/** 개인 초대 링크 — 클라이언트·서버 공용 순수 타입/헬퍼 (시크릿 없음) */
export interface InvitePrefill {
  name: string;
  /** 010-****-1234 — 실제 번호는 서버에만 있고 제출 시 토큰으로 채워진다 */
  phoneMasked: string | null;
  /** 그룹 없는 개별 초대면 null — 개인 링크(/delivery?i=)로만 쓴다 */
  groupSlug: string | null;
}

export const INVITE_TOKEN_RE = /^[0-9a-f]{32}$/;

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return null;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

/** 그룹 페이지용 초대 링크 — 그룹의 주문 현황·합류·제안 수락 흐름으로 들어간다 */
export function inviteUrl(origin: string, slug: string, token: string): string {
  return `${origin}/delivery/group/${encodeURIComponent(slug)}?i=${token}`;
}

/**
 * 개인 주문용 초대 링크 — 일반 배달 페이지에서 본인 주문만 진행한다.
 * 같은 토큰이라 그룹용 링크와 함께 발급·사용할 수 있다.
 */
export function personalInviteUrl(origin: string, token: string): string {
  return `${origin}/delivery?i=${token}`;
}
