import { beforeEach, expect, it, vi } from "vitest";
import { guideToken, guideReviewToken, recoverGuideToken, guideNotice, type GuideRecipient } from "@/lib/guestGuideNotice";
import { hashManageToken } from "@/lib/manageToken";
const row: GuideRecipient = { id: "r1", name: "테스트하객", phone: "010-1111-2222", side: "groom", guide_token_hash: null, guide_issued_at: "2026-10-14T09:00:00+09:00", guide_opened_at: null, guide_confirmed_at: null, guide_sms_status: null, guide_sms_request_id: null, guide_sms_attempted_at: null, guide_sms_sent_at: null };
beforeEach(() => vi.stubEnv("APP_SIGNING_SECRET", "test-only-guide-secret"));
it("reuses the same personal address across timezone representations without exposing RSVP IDs", () => {
  const token = guideToken(row.id, row.guide_issued_at!)!;
  expect(token).toMatch(/^[a-f0-9]{32}$/);
  expect(guideToken(row.id, "2026-10-14T00:00:00Z")).toBe(token);
  expect(guideToken("other", row.guide_issued_at!)).not.toBe(token);
  expect(recoverGuideToken({ ...row, guide_token_hash: hashManageToken(token) })).toBe(token);
  expect(recoverGuideToken({ ...row, guide_token_hash: "incorrect" })).toBeNull();
});
it("invalidates the reviewed send request when the phone, confirmation or send attempt changes", () => {
  const original = guideReviewToken(row);
  for (const patch of [{ phone: "01011119999" }, { guide_confirmed_at: "2026-10-15T00:00:00Z" }, { guide_sms_request_id: "request" }])
    expect(guideReviewToken({ ...row, ...patch })).not.toBe(original);
});
it("puts essential guidance in the message and asks for confirmation after reading", () => {
  const message = guideNotice(row.name, "https://example.invalid/guest-guide?t=private-token");
  expect(message).toContain("10월 18일(일) 오전 11시");
  expect(message).toContain("축의대");
  expect(message).toContain("현장 주변에는 ATM이 없습니다.");
  expect(message).toContain("계좌");
  expect(message).toContain("대중교통");
  expect(message).toContain("국립중앙박물관 주차장");
  expect(message).toContain("예식장");
  expect(message).toContain("안내를 읽으신 뒤");
  expect(message).toContain("안내 확인했어요");
  expect(message).not.toContain("체크인");
  expect(message).not.toContain("10월 15일부터");
  expect(message).toContain("테스트하객님 전용"); expect(message).toContain("?t=private-token");
});
