/** 개인 초대 링크 — 클라이언트·서버 공용 순수 타입/헬퍼 (시크릿 없음) */
export interface InvitePrefill {
  name: string;
  /** 010-****-1234 — 실제 번호는 서버에만 있고 제출 시 토큰으로 채워진다 */
  phoneMasked: string | null;
  groupSlug: string;
}

export const INVITE_TOKEN_RE = /^[0-9a-f]{32}$/;

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return null;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

export function inviteUrl(origin: string, slug: string, token: string): string {
  return `${origin}/delivery/group/${encodeURIComponent(slug)}?i=${token}`;
}
