import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashManageToken } from "@/lib/manageToken";
import { INVITE_TOKEN_RE } from "@/lib/invite";
import { isValidPhone } from "@/lib/wedding";

/**
 * 공개 배달/마음배송 쓰기 API 공용 헬퍼 (P1-1·P1-2). 서버 전용.
 *
 * 구조: Browser → Next API(검증·rate limit·초대 결속) → service_role RPC.
 * anon 키는 공개 정보라는 전제 — 브라우저의 write RPC 직접 호출은 회수한다
 * (supabase/migrations 의 revoke 마이그레이션, 앱 배포 후 적용).
 */

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/* ------------------------------------------------------------------ *
 * 개인 초대 토큰 → group_member identity (P1-2)
 * 토큰 하나가 명단의 한 사람(id·group·name·phone)을 나타낸다.
 * 클라이언트가 보낸 group/slug/name 은 신뢰하지 않고 서버에서 재확인.
 * ------------------------------------------------------------------ */
export interface ResolvedInvite {
  memberId: string;
  groupId: string;
  groupSlug: string | null;
  name: string;
  phone: string | null;
}

export async function resolveInvite(
  token: unknown
): Promise<ResolvedInvite | null> {
  if (typeof token !== "string" || !INVITE_TOKEN_RE.test(token)) return null;
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from("group_members")
    .select("id, group_id, name, phone, groups!inner(slug)")
    .eq("invite_token_hash", hashManageToken(token))
    .maybeSingle();
  if (!data) return null;
  const g = data.groups as unknown as { slug: string } | { slug: string }[];
  return {
    memberId: data.id as string,
    groupId: data.group_id as string,
    groupSlug: (Array.isArray(g) ? g[0]?.slug : g?.slug) ?? null,
    name: (data.name as string) ?? "",
    phone: (data.phone as string | null) ?? null,
  };
}

/**
 * 생성된 참여자를 초대 명단의 사람과 연결 (participants.group_member_id).
 * 실패해도 신청 자체는 유효하므로 로그만 남긴다 (베스트 에포트).
 */
export async function linkGroupMember(
  participantId: string,
  memberId: string
): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from("participants")
    .update({ group_member_id: memberId })
    .eq("id", participantId);
  if (error)
    console.warn("[deliveryApi] group_member 연결 실패:", error.message);
}

/* ------------------------------------------------------------------ *
 * 입력 파서 (서버가 최종 검증 — 클라이언트 검증은 UX 용일 뿐)
 * ------------------------------------------------------------------ */
export function parseName(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length >= 2 && s.length <= 40 ? s : null;
}

export function parsePhone(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s && isValidPhone(s) ? s : null;
}

export function parseText(v: unknown, max: number): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

export function parseUuid(v: unknown): string | null {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v
    : null;
}

export function parseManageTokenParam(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f]{32}$/.test(v) ? v : null;
}

/**
 * RPC 결과 행 반환 (data 가 배열/단일 모두 허용).
 * 실패 시 null.
 */
export function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row as T) ?? null;
}

/** RPC 오류 → 클라이언트 계약에 맞춘 코드 매핑 (원문 메시지는 노출하지 않음) */
export function rpcErrorCode(message: string): {
  code: string;
  status: number;
} {
  if (message.includes("date_taken") || message.includes("23505"))
    return { code: "date_taken", status: 409 };
  if (message.includes("phone_required"))
    return { code: "phone_required", status: 400 };
  if (message.includes("convert_invalid"))
    return { code: "convert_invalid", status: 400 };
  if (message.includes("out_of_range")) return { code: "range", status: 400 };
  if (message.includes("region_required"))
    return { code: "region_required", status: 400 };
  return { code: "server_error", status: 500 };
}
