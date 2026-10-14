import crypto from "node:crypto";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { collectionGuard } from "@/lib/privacy";
import { siteOrigin } from "@/lib/siteUrl";
import { maskPhone } from "@/lib/invite";
import { isUuid } from "@/lib/checkinServer";
import { hashManageToken } from "@/lib/manageToken";
import { sendSms, smsConfigProblem } from "@/lib/sms";
import { recordAccess } from "@/lib/privacyAudit";
import { rateLimitAllow } from "@/lib/rateLimit";
import { GUIDE_RECIPIENT_FIELDS, guideToken, guideReviewToken, recoverGuideToken, guideNotice, type GuideRecipient } from "@/lib/guestGuideNotice";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
const view = (r: GuideRecipient) => ({ id: r.id, name: r.name, phoneMasked: maskPhone(r.phone), canSms: /^01\d{8,9}$/.test(r.phone?.replace(/\D/g, "") ?? ""), side: r.side,
  confirmedAt: r.guide_confirmed_at, smsStatus: r.guide_sms_status, smsAttemptedAt: r.guide_sms_attempted_at, smsSentAt: r.guide_sms_sent_at });

export async function GET(req: Request) {
  const bad = await adminGuard(req); if (bad) return bad;
  const { data, error } = await supabaseAdmin!.from("rsvp").select(GUIDE_RECIPIENT_FIELDS).eq("attending", true).order("name");
  if (error) return json({ error: "참석자 명단을 읽지 못했습니다." }, 503);
  return json({ recipients: (data as GuideRecipient[]).map(view), smsReady: !smsConfigProblem() });
}

export async function POST(req: Request) {
  const bad = await adminGuard(req); if (bad) return bad;
  const closed = collectionGuard(); if (closed) return closed;
  const body = await req.json().catch(() => null);
  if (body?.action !== "prepare" && body?.action !== "send") return json({ error: "요청을 확인해주세요." }, 400);
  const ids = body.action === "send" ? [body.id] : body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 10 || !ids.every(isUuid) || new Set(ids).size !== ids.length) return json({ error: "참석자를 선택해주세요. 한 번에 최대 10명을 처리합니다." }, 400);
  if (body.action === "send" && (body.confirm !== true || typeof body.reviewToken !== "string")) return json({ error: "발송 문구와 대상을 먼저 확인해주세요." }, 400);
  if (body.action === "send" && smsConfigProblem()) return json({ error: "문자 발송 설정을 확인해주세요." }, 503);
  const { data, error } = await supabaseAdmin!.from("rsvp").select(GUIDE_RECIPIENT_FIELDS).in("id", ids).eq("attending", true).order("name");
  if (error || data?.length !== ids.length) return json({ error: "참석자 명단이 변경됐습니다. 다시 불러와주세요." }, 409);
  const rows = data as GuideRecipient[];
  const prepared = [];
  for (const row of rows) {
    const existing = recoverGuideToken(row);
    if (row.guide_token_hash && !existing) return json({ error: "개인 링크 설정이 변경됐습니다. 관리자에게 문의해주세요." }, 409);
    if (body.action === "send" && (!existing || body.reviewToken !== guideReviewToken(row))) return json({ error: "발송 대상이나 상태가 변경됐습니다. 문구를 다시 확인해주세요." }, 409);
    const issuedAt = row.guide_issued_at ?? new Date().toISOString();
    const token = existing ?? guideToken(row.id, issuedAt);
    if (!token) return json({ error: "개인 링크 설정을 확인해주세요." }, 503);
    const requestId = body.action === "send" ? crypto.randomUUID() : null;
    if (requestId && !await rateLimitAllow("guest-guide-sms:global", 100, 3600)) return json({ error: "시간당 발송 한도에 도달했습니다. 잠시 후 다시 시도해주세요." }, 429);
    const issue = await supabaseAdmin!.rpc("issue_guest_guide_v1", {
      p_id: row.id, p_name: row.name, p_phone: row.phone?.replace(/\D/g, "") ?? "", p_expected_hash: row.guide_token_hash,
      p_expected_request: row.guide_sms_request_id, p_hash: hashManageToken(token), p_issued_at: issuedAt,
      p_request: requestId, p_resend: body.allowResend === true,
    });
    if (issue.error) return json({ error: issue.error.message === "send_in_progress" ? "발송을 처리 중입니다. 결과를 확인한 뒤 15분 후 다시 시도해주세요."
      : issue.error.message === "resend_confirmation_required" ? "이미 발송을 시도한 대상입니다. 재발송 안내를 확인해주세요." : "참석자 정보가 변경됐거나 저장하지 못했습니다. 명단을 다시 불러와주세요." }, 409);
    const url = `${siteOrigin(req)}/guest-guide?t=${token}`;
    const message = guideNotice(row.name, url);
    if (requestId) {
      const sent = await sendSms(row.phone!, message);
      const status = sent.ok && !sent.skipped ? "accepted" : sent.unknown ? "unknown" : "failed";
      const saved = await supabaseAdmin!.rpc("complete_guest_guide_sms_v1", { p_id: row.id, p_request: requestId, p_status: status });
      await recordAccess(req, `guest_guide_sms_${status}`, status === "accepted" ? "success" : "failure");
      if (saved.error) return json({ error: "문자 발송을 요청했지만 결과를 저장하지 못했습니다. 문자 서비스의 발송 내역을 먼저 확인해주세요." }, 503);
      return json({ id: row.id, status });
    }
    const savedRow = { ...row, guide_token_hash: hashManageToken(token), guide_issued_at: issuedAt };
    prepared.push({ ...view(savedRow), url, message, reviewToken: guideReviewToken(savedRow) });
  }
  return json({ recipients: prepared });
}
