import { describe, it, expect } from "vitest";
import { resolvePhone } from "@/lib/deliveryApi";

/**
 * 결함 ① 회귀 방지 — 신원(초대 토큰)과 연락처를 분리한다.
 *
 * 예전 폼은 "다른 번호 쓰기"를 누르면 inviteToken 까지 null 로 보내서
 * 연락처뿐 아니라 명단 연결(group_member_id)까지 사라졌다. 이제 토큰은 항상
 * 오고, 서버가 여기서 연락처만 분기한다.
 */
describe("resolvePhone", () => {
  it("직접 입력한 번호가 있으면 그 번호를 쓴다 (초대 유무와 무관)", () => {
    expect(resolvePhone("010-1234-5678", true)).toEqual({
      ok: true,
      phone: "010-1234-5678",
    });
    expect(resolvePhone("010-1234-5678", false)).toEqual({
      ok: true,
      phone: "010-1234-5678",
    });
  });

  it("입력이 없고 초대가 있으면 null — RPC 가 토큰으로 명단 번호를 채운다", () => {
    expect(resolvePhone(null, true)).toEqual({ ok: true, phone: null });
    expect(resolvePhone("", true)).toEqual({ ok: true, phone: null });
    expect(resolvePhone("   ", true)).toEqual({ ok: true, phone: null });
  });

  it("입력도 초대도 없으면 거부", () => {
    expect(resolvePhone(null, false)).toEqual({ ok: false });
    expect(resolvePhone("", false)).toEqual({ ok: false });
  });

  it("형식이 틀린 입력은 초대 번호로 조용히 대체하지 않고 거부한다", () => {
    // 오타를 그냥 넘기면 하객은 번호를 바꾼 줄 알지만 실제로는 옛 번호로 간다
    expect(resolvePhone("010-12", true)).toEqual({ ok: false });
    expect(resolvePhone("전화번호없음", true)).toEqual({ ok: false });
    expect(resolvePhone("010-12", false)).toEqual({ ok: false });
  });
});
