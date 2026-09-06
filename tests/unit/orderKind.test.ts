import { describe, it, expect } from "vitest";
import {
  resolveOrderKind,
  inviteMayJoin,
  orderKindOf,
  type GroupRef,
  type InviteRef,
} from "@/lib/orderKind";

const groupA: GroupRef = { id: "aaaaaaaa-0000-4000-8000-000000000001", slug: "a-team" };
const inviteA: InviteRef = { groupId: groupA.id, groupSlug: "a-team" };
const inviteB: InviteRef = {
  groupId: "bbbbbbbb-0000-4000-8000-000000000002",
  groupSlug: "b-team",
};

describe("resolveOrderKind — 종류는 진입 경로가 결정한다", () => {
  it("/delivery (토큰 없음) → 개인", () => {
    expect(resolveOrderKind({ group: null, invite: null })).toEqual({
      ok: true,
      kind: "personal",
      groupId: null,
    });
  });

  it("/delivery?i= (유효 토큰) → 개인 — 토큰이 있어도 그룹에 묶지 않는다", () => {
    expect(resolveOrderKind({ group: null, invite: inviteA })).toEqual({
      ok: true,
      kind: "personal",
      groupId: null,
    });
  });

  it("/delivery/group/<slug> (토큰 없음) → 그룹", () => {
    expect(resolveOrderKind({ group: groupA, invite: null })).toEqual({
      ok: true,
      kind: "group",
      groupId: groupA.id,
    });
  });

  it("/delivery/group/<slug>?i= (같은 그룹) → 그룹", () => {
    expect(resolveOrderKind({ group: groupA, invite: inviteA })).toEqual({
      ok: true,
      kind: "group",
      groupId: groupA.id,
    });
  });

  it("/delivery/group/<slug>?i= (다른 그룹) → 거부", () => {
    expect(resolveOrderKind({ group: groupA, invite: inviteB })).toEqual({
      ok: false,
      error: "invite_group_mismatch",
    });
  });

  it("판정은 group.id 로만 한다 — slug 가 어긋나도 id 가 같으면 그룹 주문", () => {
    // 초대 토큰의 groupSlug 는 표시용이라 신뢰 근거로 쓰지 않는다
    const staleSlug: InviteRef = { groupId: groupA.id, groupSlug: "옛-슬러그" };
    expect(resolveOrderKind({ group: groupA, invite: staleSlug })).toEqual({
      ok: true,
      kind: "group",
      groupId: groupA.id,
    });
  });
});

describe("inviteMayJoin — 다른 그룹 주문으로 넘어가는 것만 막는다", () => {
  it("토큰 없으면 제한 없음", () => {
    expect(inviteMayJoin(null, groupA.id)).toBe(true);
    expect(inviteMayJoin(null, null)).toBe(true);
  });
  it("같은 그룹 주문 → 허용", () => {
    expect(inviteMayJoin(inviteA, groupA.id)).toBe(true);
  });
  it("개인 주문(group_id=null) 합석 → 허용", () => {
    expect(inviteMayJoin(inviteA, null)).toBe(true);
  });
  it("다른 그룹 주문 → 거부", () => {
    expect(inviteMayJoin(inviteA, inviteB.groupId)).toBe(false);
  });
});

describe("orderKindOf — 저장된 주문의 종류는 group_id 하나로 결정", () => {
  it("group_id 있으면 그룹", () => {
    expect(orderKindOf(groupA.id)).toBe("group");
  });
  it("null·undefined 면 개인", () => {
    expect(orderKindOf(null)).toBe("personal");
    expect(orderKindOf(undefined)).toBe("personal");
  });
});
