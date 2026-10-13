import crypto from "node:crypto";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privacyHash, recordAccess } from "@/lib/privacyAudit";
import { collectionGuard, PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { hashManageToken, isManageTokenFormat } from "@/lib/manageToken";
import { smsConfigProblem, sendSms } from "@/lib/sms";
import { isUuid } from "@/lib/checkinServer";

export type IdentityPurpose = "badge" | "rsvp" | "checkin";
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" },
});
export const identityNameHash = (name: string) => privacyHash(`name:${name.trim()}`);
export const identityPhoneHash = (phone: string) => privacyHash(`phone:${phone.replace(/\D/g, "")}`);
export const identityCodeHash = (id: string, code: string) => privacyHash(`code:${id}:${code}`);

export async function requestIdentityCode(req: Request): Promise<Response> {
  const closed = collectionGuard();
  if (closed) return closed;
  if (!supabaseAdmin || smsConfigProblem()) return reply({ error: "문자 인증을 이용할 수 없습니다. 초대장을 보내드린 분께 문의해주세요." }, 503);
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const purpose = body?.purpose as IdentityPurpose;
  if (name.length < 2 || name.length > 40 || !/^01\d{8,9}$/.test(phone)
      || !["badge", "rsvp", "checkin"].includes(purpose)
      || body?.consent !== PRIVACY_POLICY_VERSION
      || (purpose === "checkin" && body.rsvpId != null && !isUuid(body.rsvpId))) return reply({ error: "성함·전체 전화번호와 개인정보 안내 확인이 필요합니다." }, 400);
  const nameHash = identityNameHash(name), phoneHash = identityPhoneHash(phone);
  const ipHash = privacyHash(`identity-ip:${clientIp(req)}`);
  if (!nameHash || !phoneHash || !ipHash) return reply({ error: "인증 설정을 확인해주세요." }, 503);
  const allowed = await Promise.all([
    rateLimitAllow(`identity:ip:${ipHash}`, 10, 600),
    rateLimitAllow(`identity:to:${phoneHash}:cooldown`, 1, 60),
    rateLimitAllow(`identity:to:${phoneHash}`, 5, 3600),
    rateLimitAllow("identity:global", 100, 3600),
  ]);
  if (allowed.some(v => !v)) return reply({ error: "인증 요청이 많습니다. 잠시 후 다시 시도해주세요." }, 429);
  if (!await recordAccess(req, "identity_code_request", "allowed", phoneHash)) return reply({ error: "인증 기록을 저장하지 못했습니다." }, 503);
  const id = crypto.randomUUID();
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { data: recipient, error } = await supabaseAdmin.rpc("create_guest_identity_challenge_v1", {
    p_id: id, p_purpose: purpose, p_name: name, p_phone: phone,
    p_name_hash: nameHash, p_phone_hash: phoneHash, p_code_hash: identityCodeHash(id, code),
    p_rsvp_id: purpose === "checkin" ? body.rsvpId ?? null : null,
  });
  if (error) return reply({ error: "인증 요청을 처리하지 못했습니다." }, 503);
  // Send after the uniform response so provider latency cannot reveal a matching record.
  after(async () => {
    if (typeof recipient !== "string" || !recipient) return;
    const sent = await sendSms(recipient, `[청첩장] 본인 확인 인증번호 ${code}\n5분 안에 입력해주세요. 요청하지 않았다면 무시해주세요.`);
    if (!sent.ok || sent.skipped) {
      await supabaseAdmin!.from("guest_identity_challenges").delete().eq("id", id);
      await recordAccess(req, "identity_sms", "failure", phoneHash);
    } else {
      await recordAccess(req, "identity_sms", "success", phoneHash);
    }
  });
  // 존재 여부·발송 결과는 구분하지 않는다. 코드·실제 번호·인증 토큰은 반환하지 않는다.
  return reply({ challengeId: id, expiresIn: 300, message: "확인 가능한 번호라면 인증 문자를 보냈습니다. 문자를 확인해주세요." });
}

export async function verifyIdentityCode(req: Request): Promise<Response> {
  const closed = collectionGuard();
  if (closed) return closed;
  if (!supabaseAdmin) return reply({ error: "인증 설정을 확인해주세요." }, 503);
  const body = await req.json().catch(() => null);
  if (!isUuid(body?.challengeId) || typeof body?.code !== "string" || !/^\d{6}$/.test(body.code))
    return reply({ error: "6자리 인증번호를 입력해주세요." }, 400);
  const ipHash = privacyHash(`identity-ip:${clientIp(req)}`);
  const codeHash = identityCodeHash(body.challengeId, body.code);
  if (!ipHash || !codeHash) return reply({ error: "인증 설정을 확인해주세요." }, 503);
  if (!await rateLimitAllow(`identity:verify:${ipHash}`, 30, 600)) return reply({ error: "잠시 후 다시 시도해주세요." }, 429);
  if (!await recordAccess(req, "identity_code_verify", "allowed")) return reply({ error: "인증 기록을 저장하지 못했습니다." }, 503);
  const ticket = crypto.randomBytes(16).toString("hex");
  const { data, error } = await supabaseAdmin.rpc("consume_guest_identity_code_v1", {
    p_id: body.challengeId, p_code_hash: codeHash, p_ticket_hash: hashManageToken(ticket),
  });
  if (error) return reply({ error: "인증을 확인하지 못했습니다." }, 503);
  if (!data?.ok) return reply({ error: "인증번호가 맞지 않거나 만료됐습니다. 다시 요청해주세요." }, 401);
  return reply({ verified: true, verificationToken: ticket, purpose: data.purpose, result: data.result });
}

export async function checkinIdentity(token: unknown): Promise<string | null> {
  if (!isManageTokenFormat(token) || !supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from("guest_identity_tickets")
    .select("rsvp_id").eq("token_hash", hashManageToken(token)).eq("purpose", "checkin")
    .gt("expires_at", new Date().toISOString()).is("used_at", null).maybeSingle();
  return !error ? data?.rsvp_id ?? null : null;
}
