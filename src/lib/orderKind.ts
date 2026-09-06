/**
 * 주문 종류(그룹/개인) 판정 — 유일한 근거.
 *
 * 배경: 예전에는 이 판정이 다섯 곳에 흩어져 있었고, 그중 하나는 클라이언트가
 * 계산해 서버로 보내는 `personal` 플래그였다 (DeliveryForm → /api/delivery/create).
 * 규칙이 갈라지면 같은 주문이 화면마다 다르게 보인다. 그래서 규칙을 여기 모으고,
 * 클라이언트는 "내가 어느 링크로 들어왔는가"라는 사실만 보낸다.
 *
 * 규칙 — 종류는 **진입 경로**가 결정한다:
 *
 * | 진입 | 초대 토큰 | 결과 |
 * |---|---|---|
 * | `/delivery`                    | 없음      | 개인 (group_id = null) |
 * | `/delivery?i=<t>`              | 유효      | 개인 (group_id = null, 신원만 연결) |
 * | `/delivery/group/<slug>`       | 없음      | 그룹 (group_id = slug 의 그룹) |
 * | `/delivery/group/<slug>?i=<t>` | 같은 그룹 | 그룹 |
 * | `/delivery/group/<slug>?i=<t>` | 다른 그룹 | 거부 (invite_group_mismatch) |
 *
 * 저장된 주문의 종류는 `deliveries.group_id` 하나로 결정된다 (`orderKindOf`).
 * 종류를 따로 저장하지 않는 이유: 진실의 출처가 둘이 되면 어긋날 수 있다.
 * 자세한 배경은 `docs/GROUP_PERSONAL_ORDER.md` 참고.
 *
 * 이 파일은 순수 함수만 둔다 (DB 접근 없음) — 규칙을 테스트로 고정하기 위해.
 */

export type OrderKind = "group" | "personal";

/** 서버가 slug 로 조회해 존재를 확인한 그룹 (클라이언트가 보낸 값이 아님) */
export interface GroupRef {
  id: string;
  slug: string;
}

/** 초대 토큰이 가리키는 명단의 한 사람 — 판정에 필요한 부분만 */
export interface InviteRef {
  groupId: string;
  groupSlug: string | null;
}

export type OrderKindResult =
  | { ok: true; kind: OrderKind; groupId: string | null }
  | { ok: false; error: "invite_group_mismatch" };

/**
 * 새 주문의 종류를 판정한다.
 *
 * @param group  그룹 페이지에서 온 요청이면 그 그룹, 아니면 null
 * @param invite 유효한 초대 토큰이 해석된 결과, 없으면 null
 */
export function resolveOrderKind({
  group,
  invite,
}: {
  group: GroupRef | null;
  invite: InviteRef | null;
}): OrderKindResult {
  // 그룹 페이지가 아니면 개인 주문 — 초대 토큰이 있어도 그룹에 묶지 않는다.
  // (토큰은 신원 확인용으로만 쓰이고 participants.group_member_id 로 남는다)
  if (!group) return { ok: true, kind: "personal", groupId: null };

  // 그룹 페이지인데 다른 그룹의 초대 토큰이 왔다 — 조용히 버리지 않고 거부한다.
  // 하객에게는 화면에서 "이 링크는 ○○ 그룹 초대예요"라고 먼저 안내한다.
  if (invite && invite.groupId !== group.id)
    return { ok: false, error: "invite_group_mismatch" };

  return { ok: true, kind: "group", groupId: group.id };
}

/**
 * 그룹을 **슬러그로 지목하는** 경로(그룹 제안 수락)용 — 같은 결속 규칙의 슬러그 판.
 * 슬러그는 그룹당 유일하므로 id 비교와 결과가 같다. 슬러그가 실재하지 않아도
 * "다른 그룹의 토큰"이라는 사실은 그대로라 여기서 먼저 걸러진다.
 */
export function inviteMatchesGroupSlug(
  invite: InviteRef | null,
  slug: string
): boolean {
  return !invite || invite.groupSlug === slug;
}

/**
 * 합석(join): 초대 토큰으로 **다른 그룹**의 주문에 넘어가는 것만 막는다.
 * 개인 주문(group_id = null)에 합석하는 건 허용 — 개인 링크로 들어온 하객도
 * 같은 날 다른 개인 주문에 함께 받을 수 있어야 한다.
 */
export function inviteMayJoin(
  invite: InviteRef | null,
  deliveryGroupId: string | null
): boolean {
  if (!invite) return true;
  return deliveryGroupId === null || deliveryGroupId === invite.groupId;
}

/**
 * 이미 저장된 주문 한 건의 종류. 판정 근거는 `group_id` 하나뿐이다.
 * 어드민 화면도 이 함수를 써서 폼·API 와 같은 규칙으로 표시한다.
 */
export function orderKindOf(groupId: string | null | undefined): OrderKind {
  return groupId ? "group" : "personal";
}
