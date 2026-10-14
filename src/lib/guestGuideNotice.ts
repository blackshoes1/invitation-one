import { createHmac } from "node:crypto";
import { signingKeyFromEnv } from "@/lib/signedToken";
import { hashManageToken } from "@/lib/manageToken";
import { privacyHash } from "@/lib/privacyAudit";

export interface GuideRecipient {
  id: string; name: string; phone: string | null; side: string | null;
  guide_token_hash: string | null; guide_issued_at: string | null; guide_confirmed_at: string | null;
  guide_sms_status: string | null; guide_sms_request_id: string | null;
  guide_sms_attempted_at: string | null; guide_sms_sent_at: string | null;
}
export const GUIDE_RECIPIENT_FIELDS = "id,name,phone,side,guide_token_hash,guide_issued_at,guide_confirmed_at,guide_sms_status,guide_sms_request_id,guide_sms_attempted_at,guide_sms_sent_at";

export function guideToken(id: string, issuedAt: string): string | null {
  const key = signingKeyFromEnv(), time = Date.parse(issuedAt);
  if (!key || !Number.isFinite(time)) return null;
  return createHmac("sha256", key).update(JSON.stringify(["guest-guide:v1", id, new Date(time).toISOString()])).digest("hex").slice(0, 32);
}
export function recoverGuideToken(row: GuideRecipient): string | null {
  if (!row.guide_issued_at || !row.guide_token_hash) return null;
  const token = guideToken(row.id, row.guide_issued_at);
  return token && hashManageToken(token) === row.guide_token_hash ? token : null;
}
export function guideReviewToken(row: GuideRecipient): string | null {
  return privacyHash(`guide-review:${JSON.stringify([row.id,row.name,row.phone?.replace(/\D/g,""),row.guide_token_hash,row.guide_sms_request_id,row.guide_sms_status,row.guide_confirmed_at])}`);
}
export function guideNotice(name: string, url: string): string {
  return `[성근영·김아영 결혼식 안내]\n${name}님, 예식 전 안내를 확인해주세요.\n10월 15일부터 아래 개인 링크에서 사전 안내 체크인을 하면 축의금 계좌·주차장부터 예식장까지 오시는 길을 볼 수 있어요.\n${url}\n예식: 10월 18일(일) 오전 11시\n이 링크는 ${name}님 전용입니다.`;
}
