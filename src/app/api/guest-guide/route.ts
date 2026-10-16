import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashManageToken, isManageTokenFormat } from "@/lib/manageToken";
import { collectionGuard } from "@/lib/privacy";
import { GUEST_GUIDE_START, INVITATION_KEY } from "@/lib/wedding";
import { INVITATION_COOKIE, INVITATION_COOKIE_MAX_AGE, invitationHref } from "@/lib/inviteAccess";
import { PASS_HEADERS } from "@/lib/checkinServer";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { privacyHash, recordAccess } from "@/lib/privacyAudit";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PASS_HEADERS });

export async function POST(req: Request) {
  const closed = collectionGuard(); if (closed) return closed;
  if (!supabaseAdmin || !INVITATION_KEY) return json({ error: "안내 확인을 준비하고 있습니다." }, 503);
  const body = await req.json().catch(() => null);
  if (!isManageTokenFormat(body?.token) || !["load", "confirm"].includes(body?.action)) return json({ error: "개인 안내 링크를 다시 확인해주세요." }, 401);
  const actor = privacyHash(`guest-guide:${body.token}`);
  const ip = privacyHash(`guest-guide-ip:${clientIp(req)}`);
  if (!actor || !ip) return json({ error: "안내 확인을 준비하고 있습니다." }, 503);
  const limits = await Promise.all([rateLimitAllow(`guest-guide:${actor}`, 30, 600), rateLimitAllow(`guest-guide-ip:${ip}`, 120, 600)]);
  if (limits.some(allowed => !allowed)) return json({ error: "잠시 후 다시 시도해주세요." }, 429);
  if (!await recordAccess(req, `guest_guide_${body.action}`, "allowed", actor)) return json({ error: "확인 기록을 저장할 수 없습니다." }, 503);
  const hash = hashManageToken(body.token);
  const open = Date.now() >= GUEST_GUIDE_START.getTime();
  if (body.action === "load") {
    const result = await supabaseAdmin.rpc("open_guest_guide_v1", { p_hash: hash });
    if (result.error) return result.error.message === "invalid_token"
      ? json({ error: "개인 안내 링크를 다시 확인해주세요." }, 401)
      : json({ error: "안내 열람을 기록하지 못했습니다. 다시 열어주세요." }, 503);
    const guest = result.data?.[0];
    if (!guest) return json({ error: "개인 안내 링크를 다시 확인해주세요." }, 401);
    return json({ name: guest.name, openedAt: guest.opened_at, confirmedAt: guest.confirmed_at, open });
  }
  const { data, error } = await supabaseAdmin.from("rsvp").select("name,guide_confirmed_at")
    .eq("guide_token_hash", hash).eq("attending", true).maybeSingle();
  if (error) return json({ error: "안내를 확인하지 못했습니다." }, 503);
  if (!data) return json({ error: "개인 안내 링크를 다시 확인해주세요." }, 401);
  if (!open) return json({ error: "10월 15일 0시부터 확인할 수 있습니다." }, 409);
  const result = await supabaseAdmin.rpc("confirm_guest_guide_v1", { p_hash: hash });
  if (result.error) return json({ error: "안내 확인을 저장하지 못했습니다. 다시 시도해주세요." }, 503);
  const res = json({ confirmedAt: result.data, nextUrl: invitationHref });
  res.cookies.set(INVITATION_COOKIE, INVITATION_KEY, { sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: INVITATION_COOKIE_MAX_AGE });
  return res;
}
