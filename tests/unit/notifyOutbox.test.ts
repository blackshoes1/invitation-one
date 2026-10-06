import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 문제 3 — 드레인의 실패 처리.
 *
 * 지키려는 것은 하나다: **일시적 DB 오류로 알림이 사라지지 않는다.**
 * 예전 buildText 는 조회 오류와 "참여자 없음"을 둘 다 null 로 돌려줘서,
 * DB 가 잠깐 흔들린 것만으로 그 알림이 skipped 로 확정돼 영영 사라졌다.
 *
 * 외부 발송은 전부 mock 이다 — 실제 카카오·텔레그램 메시지는 보내지 않는다.
 */

/* ── Supabase 클라이언트 mock ──────────────────────────────────────────────
   체이닝 쿼리 빌더를 흉내 낸다. 각 테이블/동작마다 원하는 응답을 주입한다. */
interface Resp {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

const state = {
  claim: { data: [] as unknown[], error: null as { message: string } | null },
  participant: { data: null as unknown, error: null as { message: string } | null },
  delivery: { data: null as unknown, error: null as { message: string } | null },
  count: { count: 1 as number | null, error: null as { message: string } | null },
  /** notification_outbox update 결과 — [] 면 소유권을 잃은 것 */
  outboxUpdate: { data: [{ id: "o1" }] as unknown[], error: null as { message: string } | null },
  stuck: { data: 0 as unknown, error: null as { message: string } | null },
  /** 기록된 outbox update patch 들 */
  writes: [] as Record<string, unknown>[],
};

function builder(table: string) {
  let isUpdate = false;
  let patch: Record<string, unknown> = {};
  let head = false;
  const b: Record<string, unknown> = {};
  const chain = () => b;
  for (const m of ["eq", "is", "in", "order", "neq"]) b[m] = chain;
  b.update = (p: Record<string, unknown>) => {
    isUpdate = true;
    patch = p;
    return b;
  };
  b.select = (_cols?: string, opts?: { head?: boolean }) => {
    head = Boolean(opts?.head);
    return b;
  };
  b.maybeSingle = async (): Promise<Resp> =>
    table === "participants" ? state.participant : state.delivery;
  // await 로 종결될 때
  b.then = (res: (v: Resp) => unknown) => {
    if (table === "notification_outbox" && isUpdate) {
      state.writes.push({ ...patch });
      return Promise.resolve(state.outboxUpdate).then(res);
    }
    if (table === "participants" && head) return Promise.resolve(state.count).then(res);
    return Promise.resolve({ data: [], error: null }).then(res);
  };
  return b;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  isAdminConfigured: true,
  supabaseAdmin: {
    from: (t: string) => builder(t),
    rpc: async (fn: string) =>
      fn === "claim_notifications" ? state.claim : state.stuck,
  },
}));

type SendFn = (text: string) => Promise<{ ok: boolean; error?: string; skipped?: boolean }>;
const send = vi.fn<SendFn>(async () => ({ ok: true }));
vi.mock("@/lib/notifyChannel", () => ({
  notifyChannel: {
    name: "telegram",
    configured: true,
    send: (t: string) => send(t),
    health: async () => "ok",
  },
}));

const { drainNotifications } = await import("@/lib/notifyOutbox");

const claimRow = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  participant_id: "p1",
  attempts: 1,
  lock_token: "tok-1",
  ...over,
});
const heart = { id: "p1", type: "마음배송", name: "가", region: "서울", message: "축하" };

beforeEach(() => {
  state.claim = { data: [], error: null };
  state.participant = { data: heart, error: null };
  state.delivery = { data: null, error: null };
  state.count = { count: 1, error: null };
  state.outboxUpdate = { data: [{ id: "o1" }], error: null };
  state.stuck = { data: 0, error: null };
  state.writes = [];
  send.mockClear();
  send.mockImplementation(async () => ({ ok: true }));
});

describe("drainNotifications — 오류와 '없음'의 구분", () => {
  it("참여자 조회가 실패하면 failed 로 두고 재시도한다 (skipped 로 없애지 않는다)", async () => {
    state.claim = { data: [claimRow()], error: null };
    state.participant = { data: null, error: { message: "timeout" } };

    const r = await drainNotifications();
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(0);
    expect(send).not.toHaveBeenCalled();
    const w = state.writes.at(-1)!;
    expect(w.status).toBe("failed");
    expect(String(w.last_error)).toContain("timeout");
    // 백오프가 예약돼야 다음 회차에 다시 꺼내진다
    expect(w.next_attempt_at).toBeTruthy();
  });

  it("참여자가 실제로 삭제됐을 때만 skipped 로 확정한다", async () => {
    state.claim = { data: [claimRow()], error: null };
    state.participant = { data: null, error: null };

    const r = await drainNotifications();
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(0);
    expect(state.writes.at(-1)!.status).toBe("skipped");
  });

  it("주문 조회 실패를 '주문 없음'으로 취급하지 않는다 (날짜·장소 빠진 알림 방지)", async () => {
    state.claim = { data: [claimRow()], error: null };
    state.participant = {
      data: { id: "p1", type: "직접배달", name: "가", is_owner: true, delivery_id: "d1" },
      error: null,
    };
    state.delivery = { data: null, error: { message: "conn reset" } };

    const r = await drainNotifications();
    expect(r.failed).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("인원 집계 실패도 발송하지 않고 재시도로 돌린다", async () => {
    state.claim = { data: [claimRow()], error: null };
    state.participant = {
      data: { id: "p1", type: "직접배달", name: "나", is_owner: false, delivery_id: "d1" },
      error: null,
    };
    state.delivery = { data: { date: "2026-10-10", time_slot: "오후", location: "서울" }, error: null };
    state.count = { count: null, error: { message: "boom" } };

    const r = await drainNotifications();
    expect(r.failed).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("drainNotifications — 클레임 실패", () => {
  it("클레임 실패를 '0건 정상'으로 숨기지 않는다", async () => {
    state.claim = { data: [], error: { message: "rpc down" } };
    const r = await drainNotifications();
    expect(r.error).toContain("rpc down");
    expect(r.claimed).toBe(0);
    // 이 결과를 보고 안전망이 장애로 판정해야 한다
    expect(r.sent).toBe(0);
  });
});

describe("drainNotifications — 발송 성공 후 상태 저장", () => {
  it("sent 기록이 안 되면 persistFailed 로 드러난다 (중복 발송 가능 구간)", async () => {
    state.claim = { data: [claimRow()], error: null };
    state.outboxUpdate = { data: [], error: null }; // 소유권 상실 = 0행

    const r = await drainNotifications();
    expect(r.sent).toBe(1);
    expect(r.persistFailed).toBe(1);
    // 한 번 재시도했는지 (sent 기록 2회 + notified_at 은 참여자 테이블이라 별개)
    expect(state.writes.filter((w) => w.status === "sent").length).toBe(2);
  });

  it("정상 경로에서는 persistFailed 가 없다", async () => {
    state.claim = { data: [claimRow()], error: null };
    const r = await drainNotifications();
    expect(r.sent).toBe(1);
    expect(r.persistFailed).toBeUndefined();
    expect(state.writes.at(-1)!.status).toBe("sent");
  });

  it("발송 API 실패는 failed + 백오프", async () => {
    state.claim = { data: [claimRow()], error: null };
    send.mockImplementation(async () => ({ ok: false, error: "telegram 502" }));

    const r = await drainNotifications();
    expect(r.failed).toBe(1);
    expect(String(state.writes.at(-1)!.last_error)).toContain("502");
  });

  it("발송이 예외를 던져도 행을 sending 에 남기지 않는다", async () => {
    state.claim = { data: [claimRow()], error: null };
    send.mockImplementation(async () => {
      throw new Error("ECONNRESET");
    });

    const r = await drainNotifications();
    expect(r.failed).toBe(1);
    expect(state.writes.at(-1)!.status).toBe("failed");
  });
});

describe("drainNotifications — 갇힌 행", () => {
  it("재시도 한도/기간을 넘긴 미발송 건수를 응답에 싣는다", async () => {
    state.stuck = { data: 3, error: null };
    const r = await drainNotifications();
    expect(r.stuck).toBe(3);
    // 자동으로 보내지 않는다 — 세기만 한다
    expect(send).not.toHaveBeenCalled();
  });

  it("stuck 집계가 실패하면 0 이 아니라 undefined (오탐 방지)", async () => {
    state.stuck = { data: null, error: { message: "no function" } };
    const r = await drainNotifications();
    expect(r.stuck).toBeUndefined();
  });
});
