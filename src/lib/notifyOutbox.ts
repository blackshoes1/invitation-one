import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyChannel, type ChannelStatus } from "@/lib/notifyChannel";
import { formatYmdKo } from "@/lib/wedding";

/**
 * 관리자 알림 아웃박스 드레인 (P1-3).
 * DB 트리거가 participants insert 마다 적재한 notification_outbox 행을
 * claim_notifications()(원자 클레임)로 꺼내 발송하고 결과를 기록한다.
 * - 성공: sent + participants.notified_at (v24 호환)
 * - 실패: failed + last_error + 지수 백오프(next_attempt_at), 최대 8회
 * - 참여자가 **실제로 삭제됨**: skipped
 * 메시지 본문은 발송 시점에 participants 에서 구성 (outbox 에 PII 복제 없음).
 *
 * ── 배달 보장 (문제 3) ────────────────────────────────────────────────────
 * **at-least-once 다. exactly-once 가 아니다.**
 * 텔레그램 sendMessage 도 카카오 memo 도 멱등 키를 받지 않는다. 지원하지 않는
 * API 에 임의의 키를 보내고 중복이 없다고 주장할 수는 없다. 그래서 남는 구간:
 *
 *   발송 성공 → (이 사이에 DB 기록 실패 또는 프로세스 종료) → 행이 'sending' 으로
 *   남음 → 3분 뒤 스테일 회수 → **같은 알림이 한 번 더 간다**
 *
 * 줄이는 장치는 셋이다: ① 발송에 timeout 을 걸어 lease(3분)를 넘기지 않게 하고
 * ② 기록 실패를 즉시 한 번 재시도하며 ③ lock_token 으로 회수당한 worker 의
 * 뒤늦은 덮어쓰기를 막는다. 그래도 ①②가 모두 실패하면 중복이 남는다 —
 * 관리자 알림이라 유실보다 중복이 낫다고 보고 이 쪽을 택했다.
 */
export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  /** 발송 채널 이름 — 'none' 이면 미설정이라 한 건도 못 보낸다 */
  channel: string;
  /** 보낼 수 있는 상태인가 (구 필드명 kakao 를 대체) */
  ready: boolean;
  /**
   * 보낼 게 없을 때만 채워진다 — 그때 확인한 채널 연결 상태.
   * 보낼 게 있었다면 발송 결과(sent/failed)가 곧 상태이므로 중복 확인하지 않는다.
   */
  channelStatus?: ChannelStatus;
  /**
   * 드레인 자체가 실패했다 (클레임 오류 등). 이게 있으면 sent/failed 숫자는
   * 아무 의미가 없다 — 예전에는 클레임 실패를 조용히 "0건 정상"으로 반환해서
   * 알림이 통째로 멈춰도 안전망이 초록이었다.
   */
  error?: string;
  /**
   * 발송은 됐는데 **DB 기록에 실패한** 건수. 0 이 아니면 그 알림은 다음 드레인에서
   * 다시 발송된다 (중복). 응답에서 실제 DB 반영 여부를 알 수 있어야 한다.
   */
  persistFailed?: number;
  /**
   * 시간 예산을 넘겨 이번 회차에 손대지 않고 되돌린 건수 (다음 회차가 가져간다).
   * lease(3분)를 넘겨 다른 worker 와 같은 행을 들고 있는 상황을 만들지 않기 위함.
   */
  deferred?: number;
  /**
   * 재시도 한도나 7일 창을 넘겨 **다시는 꺼내지지 않는** 미발송 건수.
   * 0 이 아니면 운영자가 직접 봐야 한다 — 자동으로 뒤늦게 발송하지 않는다.
   */
  stuck?: number;
}

interface OutboxRow {
  id: string;
  participant_id: string | null;
  attempts: number;
  lock_token: string | null;
}

/** 조회 실패(일시 오류)와 정상 조회 결과 없음(실제 삭제)을 구분한다 */
type BuildResult =
  | { ok: true; text: string }
  | { ok: false; missing: true }
  | { ok: false; missing: false; error: string };

/** 한 행 처리에 쓰는 시간 예산 — lease(3분)를 넘겨 회수당하지 않도록 */
const ROW_BUDGET_MS = 100_000;

async function buildText(participantId: string): Promise<BuildResult> {
  const { data: p, error } = await supabaseAdmin!
    .from("participants")
    .select("id, type, name, region, message, is_owner, delivery_id")
    .eq("id", participantId)
    .maybeSingle();
  // ⚠️ 오류와 "없음"을 절대 같이 다루지 않는다. 예전에는 둘 다 null 이라
  //    DB 가 잠깐 흔들린 것만으로 알림이 skipped 로 확정돼 사라졌다.
  if (error) return { ok: false, missing: false, error: `participant: ${error.message}` };
  if (!p) return { ok: false, missing: true };

  if (p.type === "마음배송")
    return {
      ok: true,
      text: `💌 마음 배송 도착!\n${p.name} (${p.region ?? "지역 미상"})\n"${(p.message ?? "").slice(0, 60)}"`,
    };

  let d: { date: string; time_slot: string; location: string } | null = null;
  if (p.delivery_id) {
    const r = await supabaseAdmin!
      .from("deliveries")
      .select("date, time_slot, location")
      .eq("id", p.delivery_id)
      .maybeSingle();
    // 주문 조회 실패를 "주문 없음"으로 취급하면 날짜·장소가 빠진 알림이 나간다
    if (r.error) return { ok: false, missing: false, error: `delivery: ${r.error.message}` };
    d = r.data;
  }

  let count = 1;
  if (p.delivery_id) {
    const c = await supabaseAdmin!
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("delivery_id", p.delivery_id);
    if (c.error) return { ok: false, missing: false, error: `count: ${c.error.message}` };
    count = c.count ?? 1;
  }

  return {
    ok: true,
    text: p.is_owner
      ? `🛵 새 주문 접수!\n${p.name} · ${d ? formatYmdKo(d.date) : ""} ${d?.time_slot ?? ""}\n📍 ${d?.location ?? ""}`
      : `🤝 합석/합류!\n${p.name} → ${d ? formatYmdKo(d.date) : ""} ${d?.time_slot ?? ""} 주문 (현재 ${count}명)`,
  };
}

const backoffMs = (attempts: number) =>
  Math.min(2 ** Math.max(attempts, 1), 60) * 60 * 1000; // 2,4,8,…,60분

export async function drainNotifications(limit = 5): Promise<DrainResult> {
  const zero: DrainResult = {
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    channel: notifyChannel.name,
    ready: notifyChannel.configured,
  };
  // 채널 미설정이면 클레임하지 않고 pending 으로 둔다 (설정 후 다음 드레인에서 발송).
  // ⚠️ 채널을 갈아끼울 때 이 가드를 같이 안 고치면 알림이 outbox 에 쌓이기만 하고
  //    조용히 멈춘다 — 그래서 안전망 워크플로가 ready=false 를 장애로 취급한다.
  if (!supabaseAdmin) return { ...zero, error: "supabase_not_configured" };
  if (!notifyChannel.configured) return zero;

  const { data, error } = await supabaseAdmin.rpc("claim_notifications", { p_limit: limit });
  if (error) {
    // 클레임 실패는 "보낼 게 없음"이 아니다. 조용히 0 을 반환하면 알림이 통째로
    // 멈춰도 안전망 크론이 초록으로 지나간다 — 실제로 그렇게 오래 멈춘 적이 있다.
    console.error("[outbox] claim failed:", error.message);
    return { ...zero, error: `claim: ${error.message}` };
  }
  const rows = (data ?? []) as OutboxRow[];
  const out: DrainResult = { ...zero, claimed: rows.length };
  const now = () => new Date().toISOString();

  // 보낼 게 없어도 채널 연결을 한 번 확인한다 — 고장을 주문이 들어온 뒤에
  // 알게 되면 늦기 때문이다. 결과는 안전망 워크플로가 읽는다.
  //
  // 채널마다 의미가 다르다:
  //  - 카카오: refresh token 이 약 2개월 만료인데, 갱신 요청이 나가야 만료 임박 시
  //    새 토큰을 받아 자동 회전된다. 즉 이 확인이 **토큰을 살려두는 일**을 겸한다.
  //    5분 크론이 매번 카카오를 치지 않도록 3시간 간격 제한이 걸려 있고, 건너뛴
  //    회차는 channelStatus 가 비어서 나간다 ("이번엔 모름").
  //  - 텔레그램: 만료가 없어 살려둘 게 없다. getMe 로 토큰·봇 상태만 본다.
  if (rows.length === 0) {
    const status = await notifyChannel.health();
    if (status) out.channelStatus = status;
    out.stuck = await stuckCount();
    return out;
  }

  const startedAt = Date.now();
  let persistFailed = 0;
  let deferred = 0;

  /**
   * 상태 기록 — **소유권을 확인하고** 쓴다. 회수당한 worker(느려서 lease 를 넘긴
   * 쪽)의 뒤늦은 update 가 새 주인의 결과를 덮어쓰지 못하게 한다.
   * 반환값은 "실제로 DB 에 반영됐는가".
   */
  const write = async (
    row: OutboxRow,
    patch: Record<string, unknown>
  ): Promise<boolean> => {
    let q = supabaseAdmin!
      .from("notification_outbox")
      .update({ ...patch, updated_at: now() })
      .eq("id", row.id);
    // 구 DB(마이그레이션 미적용)에는 lock_token 이 없다 — 그때는 id 로만 쓴다
    if (row.lock_token) q = q.eq("lock_token", row.lock_token);
    const { data: hit, error: e } = await q.select("id");
    if (e) {
      console.error("[outbox] 상태 기록 실패:", row.id, e.message);
      return false;
    }
    // 0행 = 회수당했다. 실패가 아니라 "내 차례가 아니다" — 새 주인이 처리한다.
    return (hit?.length ?? 0) > 0;
  };

  for (const row of rows) {
    // lease(3분)를 넘기면 다른 worker 가 같은 행을 들고 가 중복 발송이 된다.
    // 예산을 넘긴 나머지는 손대지 않고 되돌려 다음 회차에 넘긴다.
    if (Date.now() - startedAt > ROW_BUDGET_MS) {
      deferred++;
      // 시도하지 않았으므로 attempts 를 되돌린다 (헛되이 한도를 소모하지 않게)
      await write(row, {
        status: "pending",
        attempts: Math.max(0, row.attempts - 1),
        locked_at: null,
        lock_token: null,
      });
      continue;
    }

    // 한 행이 터져도 나머지는 계속 보낸다. 그리고 무엇보다 — 던져진 예외가
    // 이 루프를 빠져나가면 그 행은 'sending' 인 채로 남고, 3분 스테일 락이
    // 회수해 줄 때까지(=다음 드레인이 돌 때까지) 아무 흔적 없이 멈춰 있다.
    // 실제로 2026-09-06 에 그렇게 묶여 16분간 알림이 안 갔다. 여기서 잡아
    // failed 로 기록하면 사유가 남고 백오프 재시도 대상이 된다.
    try {
      const built = row.participant_id
        ? await buildText(row.participant_id)
        : ({ ok: false, missing: true } as BuildResult);

      if (!built.ok && built.missing) {
        // 참여자가 실제로 삭제됐다 — 보낼 내용이 영영 없으므로 재시도하지 않는다
        out.skipped++;
        if (!(await write(row, { status: "skipped", last_error: "participant_missing" })))
          persistFailed++;
        continue;
      }
      if (!built.ok) {
        // 일시적 DB 오류 — 재시도 대상으로 둔다 (skipped 로 확정하면 알림이 사라진다)
        out.failed++;
        if (!(await markFailed(write, row, `db: ${built.error}`))) persistFailed++;
        continue;
      }

      const r = await notifyChannel.send(built.text);
      if (r.ok && !r.skipped) {
        out.sent++;
        // ⚠️ 여기서부터 커밋 지점까지가 중복 위험 구간이다 (파일 상단 주석).
        //    기록에 실패하면 한 번 더 시도해서 구간을 최대한 좁힌다.
        let stored = await write(row, {
          status: "sent",
          sent_at: now(),
          last_error: null,
        });
        if (!stored)
          stored = await write(row, { status: "sent", sent_at: now(), last_error: null });
        if (!stored) {
          persistFailed++;
          console.error(
            "[outbox] 발송은 됐는데 sent 기록 실패 — 다음 드레인에서 중복 발송될 수 있다:",
            row.id
          );
        }
        if (row.participant_id) {
          const { error: pe } = await supabaseAdmin
            .from("participants")
            .update({ notified_at: now() })
            .eq("id", row.participant_id)
            .is("notified_at", null);
          if (pe) console.error("[outbox] notified_at 기록 실패:", row.id, pe.message);
        }
      } else {
        out.failed++;
        if (!(await markFailed(write, row, r.error ?? `${notifyChannel.name}_skipped`)))
          persistFailed++;
      }
    } catch (e) {
      out.failed++;
      console.error("[outbox] row failed:", row.id, e);
      // 이 기록마저 실패하면 그 행은 'sending' 으로 남는다 — 스테일 락이 회수한다
      const okWrite = await markFailed(write, row, `throw: ${String(e)}`).catch(() => false);
      if (!okWrite) persistFailed++;
    }
  }

  if (persistFailed > 0) out.persistFailed = persistFailed;
  if (deferred > 0) out.deferred = deferred;
  out.stuck = await stuckCount();
  return out;
}

/** 실패 기록 + 지수 백오프 예약 (성공/실패 어느 쪽도 안 남기면 행이 갇힌다) */
async function markFailed(
  write: (row: OutboxRow, patch: Record<string, unknown>) => Promise<boolean>,
  row: OutboxRow,
  error: string
): Promise<boolean> {
  return write(row, {
    status: "failed",
    last_error: error.slice(0, 500),
    next_attempt_at: new Date(Date.now() + backoffMs(row.attempts)).toISOString(),
  });
}

/**
 * 재시도 한도·클레임 창을 넘겨 **다시는 꺼내지지 않는** 미발송 건수.
 * 세기만 한다 — 오래된 알림을 뒤늦게 무단 발송하지 않는다.
 * 구 DB(함수 미적용)에서는 undefined 를 돌려 안전망이 오탐하지 않게 한다.
 */
async function stuckCount(): Promise<number | undefined> {
  const { data, error } = await supabaseAdmin!.rpc("outbox_stuck_count");
  if (error) {
    console.warn("[outbox] stuck 집계 실패:", error.message);
    return undefined;
  }
  return typeof data === "number" ? data : undefined;
}
