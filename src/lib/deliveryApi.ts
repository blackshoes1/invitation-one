import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashManageToken } from "@/lib/manageToken";
import { INVITE_TOKEN_RE } from "@/lib/invite";
import type { GroupRef } from "@/lib/orderKind";
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
  /** 그룹 없는 개별 초대면 null (20260906000200 마이그레이션) */
  groupId: string | null;
  groupSlug: string | null;
  name: string;
  phone: string | null;
}

export async function resolveInvite(
  token: unknown
): Promise<ResolvedInvite | null> {
  if (typeof token !== "string" || !INVITE_TOKEN_RE.test(token)) return null;
  if (!supabaseAdmin) return null;
  // groups 는 **left join** — inner 로 조이면 그룹 없는 개별 초대가 조용히
  // "토큰 없음"으로 떨어져 이름·번호 자동 입력이 안 된다
  const { data } = await supabaseAdmin
    .from("group_members")
    .select("id, group_id, name, phone, groups(slug)")
    .eq("invite_token_hash", hashManageToken(token))
    .maybeSingle();
  if (!data) return null;
  const g = data.groups as unknown as { slug: string } | { slug: string }[] | null;
  return {
    memberId: data.id as string,
    groupId: (data.group_id as string | null) ?? null,
    groupSlug: (Array.isArray(g) ? g[0]?.slug : g?.slug) ?? null,
    name: (data.name as string) ?? "",
    phone: (data.phone as string | null) ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * 그룹 조회 — 주문 종류 판정의 입력 (src/lib/orderKind.ts)
 * 클라이언트가 보낸 group id 는 판정 근거로 쓰지 않는다. 폼은 자기가 어느
 * 페이지에서 왔는지(slug)만 알려주고, 그룹의 실체는 서버가 조회한다.
 * ------------------------------------------------------------------ */
export async function loadGroupBySlug(slug: unknown): Promise<GroupRef | null> {
  const s = typeof slug === "string" ? slug.trim().slice(0, 80) : "";
  if (!s || !supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from("groups")
    .select("id, slug")
    .eq("slug", s)
    .maybeSingle();
  return data ? { id: data.id as string, slug: data.slug as string } : null;
}

/**
 * 구버전 클라이언트 호환 — 배포 전에 열어둔 탭이 groupSlug 없이 groupId 만 보낸다.
 * (그룹 id 는 get_group 으로 누구나 받을 수 있는 공개 값이라 노출 문제는 없다)
 * 모든 하객이 새 폼을 받고 나면 지울 수 있다.
 */
export async function loadGroupById(id: unknown): Promise<GroupRef | null> {
  const uuid = parseUuid(id);
  if (!uuid || !supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from("groups")
    .select("id, slug")
    .eq("id", uuid)
    .maybeSingle();
  return data ? { id: data.id as string, slug: data.slug as string } : null;
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

/**
 * 연락처 판정 — 신원(초대 토큰)과 연락처를 분리한다.
 *
 * 예전에는 하객이 "다른 번호 쓰기"를 누르면 폼이 `inviteToken` 까지 null 로
 * 보내서 연락처뿐 아니라 **신원(명단 연결)까지 사라졌다.** 이제 토큰은 항상
 * 오고, 여기서 연락처만 분기한다.
 *
 * - 직접 입력한 번호가 있으면 그 번호를 쓴다
 * - 없으면 null 을 돌려주고, RPC 가 초대 토큰 해시로 명단의 번호를 채운다
 * - 입력은 했는데 형식이 틀리면 **거부한다** — 오타를 초대 번호로 조용히
 *   대체하면 하객은 바꾼 줄 알지만 실제로는 옛 번호로 배송된다
 */
export function resolvePhone(
  raw: unknown,
  hasInvite: boolean
): { ok: true; phone: string | null } | { ok: false } {
  const typed = String(raw ?? "").trim();
  if (typed) {
    const phone = parsePhone(typed);
    return phone ? { ok: true, phone } : { ok: false };
  }
  return hasInvite ? { ok: true, phone: null } : { ok: false };
}

/**
 * 명단에서 고른 이름 → 연락처 (그룹 링크로 들어온 하객용).
 *
 * **번호는 브라우저로 절대 나가지 않는다.** 하객은 이름만 고르고, 실제 번호는
 * 제출 시점에 여기서 붙는다 — 초대 토큰이 `_invite_phone` 으로 채우는 것과 같은
 * 원칙이다. 마스킹본조차 내려보내지 않으므로 그룹 링크를 가졌다는 것만으로는
 * 남의 번호를 알아낼 수 없다.
 *
 * 못 찾으면 null 이고, 그때는 하객이 직접 입력해야 한다. 안 찾아주는 경우:
 * - 그 이름이 명단에 없다
 * - **동명이인** — 누구 번호인지 고를 수 없다. 아무거나 붙이면 엉뚱한 사람의
 *   번호로 배송 연락이 간다. 이름 목록 API 도 같은 규칙으로 `hasPhone:false` 를
 *   내려주므로 화면에서 미리 걸러진다.
 * - 명단에 번호가 없다 / 형식이 깨져 있다
 */
export async function rosterPhone(
  groupId: string | null,
  name: string
): Promise<string | null> {
  if (!groupId || !supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from("group_members")
    .select("phone")
    .eq("group_id", groupId)
    .eq("name", name)
    .limit(2); // 2건이면 동명이인 — 아래에서 거른다
  if (!data || data.length !== 1) return null;
  return parsePhone(data[0].phone);
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
