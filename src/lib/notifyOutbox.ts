import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendToMe, isKakaoConfigured } from "@/lib/kakao";
import { formatYmdKo } from "@/lib/wedding";

/**
 * 카카오 관리자 알림 아웃박스 드레인 (P1-3).
 * DB 트리거가 participants insert 마다 적재한 notification_outbox 행을
 * claim_notifications()(원자 클레임)로 꺼내 발송하고 결과를 기록한다.
 * - 성공: sent + participants.notified_at (v24 호환)
 * - 실패: failed + last_error + 지수 백오프(next_attempt_at), 최대 8회
 * - 참여자 삭제됨: skipped
 * 메시지 본문은 발송 시점에 participants 에서 구성 (outbox 에 PII 복제 없음).
 */
export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  kakao: boolean;
}

interface OutboxRow {
  id: string;
  participant_id: string | null;
  attempts: number;
}

async function buildText(participantId: string): Promise<string | null> {
  const { data: p } = await supabaseAdmin!
    .from("participants")
    .select("id, type, name, region, message, is_owner, delivery_id")
    .eq("id", participantId)
    .maybeSingle();
  if (!p) return null;
  if (p.type === "마음배송")
    return `💌 마음 배송 도착!\n${p.name} (${p.region ?? "지역 미상"})\n"${(p.message ?? "").slice(0, 60)}"`;
  const { data: d } = p.delivery_id
    ? await supabaseAdmin!
        .from("deliveries")
        .select("date, time_slot, location")
        .eq("id", p.delivery_id)
        .maybeSingle()
    : { data: null };
  const count = p.delivery_id
    ? (
        await supabaseAdmin!
          .from("participants")
          .select("id", { count: "exact", head: true })
          .eq("delivery_id", p.delivery_id)
      ).count ?? 1
    : 1;
  return p.is_owner
    ? `🛵 새 주문 접수!\n${p.name} · ${d ? formatYmdKo(d.date) : ""} ${d?.time_slot ?? ""}\n📍 ${d?.location ?? ""}`
    : `🤝 합석/합류!\n${p.name} → ${d ? formatYmdKo(d.date) : ""} ${d?.time_slot ?? ""} 주문 (현재 ${count}명)`;
}

const backoffMs = (attempts: number) =>
  Math.min(2 ** Math.max(attempts, 1), 60) * 60 * 1000; // 2,4,8,…,60분

export async function drainNotifications(limit = 5): Promise<DrainResult> {
  const zero: DrainResult = { claimed: 0, sent: 0, failed: 0, skipped: 0, kakao: isKakaoConfigured };
  // 카카오 미설정이면 클레임하지 않고 pending 으로 둔다 (설정 후 다음 드레인에서 발송)
  if (!supabaseAdmin || !isKakaoConfigured) return zero;

  const { data, error } = await supabaseAdmin.rpc("claim_notifications", { p_limit: limit });
  if (error) {
    console.error("[outbox] claim failed:", error.message);
    return zero;
  }
  const rows = (data ?? []) as OutboxRow[];
  const out = { ...zero, claimed: rows.length };
  const now = () => new Date().toISOString();

  for (const row of rows) {
    const text = row.participant_id ? await buildText(row.participant_id) : null;
    if (!text) {
      out.skipped++;
      await supabaseAdmin
        .from("notification_outbox")
        .update({ status: "skipped", last_error: "participant_missing", updated_at: now() })
        .eq("id", row.id);
      continue;
    }
    const r = await sendToMe(text);
    if (r.ok && !r.skipped) {
      out.sent++;
      await Promise.all([
        supabaseAdmin
          .from("notification_outbox")
          .update({ status: "sent", sent_at: now(), last_error: null, updated_at: now() })
          .eq("id", row.id),
        supabaseAdmin
          .from("participants")
          .update({ notified_at: now() })
          .eq("id", row.participant_id!)
          .is("notified_at", null),
      ]);
    } else {
      out.failed++;
      await supabaseAdmin
        .from("notification_outbox")
        .update({
          status: "failed",
          last_error: (r.error ?? "kakao_skipped").slice(0, 500),
          next_attempt_at: new Date(Date.now() + backoffMs(row.attempts)).toISOString(),
          updated_at: now(),
        })
        .eq("id", row.id);
    }
  }
  return out;
}
