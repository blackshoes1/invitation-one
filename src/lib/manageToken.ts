import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 참여자 관리 링크 토큰 (P0-2). 서버 전용.
 *
 * - 토큰: 128bit 랜덤 → hex 32자. DB 에는 SHA-256 hex 만 저장(manage_token_hash).
 * - 생성 시에는 DB 래퍼(create_delivery_v3 등)가 발급하고, 서버에서 재발급(회전)이
 *   필요할 때(SMS 링크·내 신청 찾기)는 여기서 Node crypto 로 발급 — 해시 규약 동일.
 * - participant UUID 는 공개 식별자(축하 피드 등)이므로 권한으로 쓰지 않는다.
 */
export const MANAGE_TOKEN_RE = /^[0-9a-f]{32}$/;
/** 구 링크 형식(participant UUID) 감지용 — 안내 화면으로 유도 */
export const LEGACY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashManageToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateManageToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function isManageTokenFormat(v: unknown): v is string {
  return typeof v === "string" && MANAGE_TOKEN_RE.test(v);
}

export function manageUrl(origin: string, token: string): string {
  return `${origin}/delivery/manage/${token}`;
}

/** 토큰 → 참여자 id. 형식 불량/미존재면 null (타이밍 무관: 해시 인덱스 조회) */
export async function resolveParticipantByToken(token: unknown): Promise<string | null> {
  if (!isManageTokenFormat(token) || !supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("manage_token_hash", hashManageToken(token))
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * 토큰 회전 발급 — 새 토큰을 발급해 해시 저장 후 raw 반환 (기존 링크는 무효).
 * SMS 로 새 링크를 실제 보낼 때, '내 신청 찾기' 재발급 시에만 호출할 것.
 */
export async function rotateManageToken(participantId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const raw = generateManageToken();
  const { error, data } = await supabaseAdmin
    .from("participants")
    .update({ manage_token_hash: hashManageToken(raw), updated_at: new Date().toISOString() })
    .eq("id", participantId)
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return raw;
}
