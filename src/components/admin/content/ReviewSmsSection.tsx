"use client";

import type { SaveSetting } from "./types";

/** 리뷰요청 문자 (DL-3) 섹션 */
export default function ReviewSmsSection({
  reviewSms,
  setReviewSms,
  saveSetting,
}: {
  reviewSms: string;
  setReviewSms: (v: string) => void;
  saveSetting: SaveSetting;
}) {
  return (
    <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
      <p className="text-sm font-medium text-sage-700">리뷰요청 문자</p>
      <p className="text-[11px] text-neutral-400">
        주문을 <b>완료</b> 처리할 때 하객에게 자동 발송돼요 (연락처 보유자만).
        <br />
        치환: <code>{"{이름}"}</code> <code>{"{날짜}"}</code>{" "}
        <code>{"{시간}"}</code> <code>{"{장소}"}</code>{" "}
        <code>{"{링크}"}</code>(개인 리뷰 페이지) <code>{"{청첩장}"}</code>(청첩장 주소)
      </p>
      <textarea
        value={reviewSms}
        maxLength={300}
        onChange={(e) => setReviewSms(e.target.value)}
        placeholder="[청첩장 배달] {이름}님, 청첩장 잘 받으셨나요? 😊 짧은 한줄 후기를 남겨주시면 큰 힘이 됩니다 🙏 {링크}"
        className="w-full p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600 resize-none h-24"
      />
      <div className="flex justify-end gap-2">
        {reviewSms && (
          <button
            onClick={() =>
              saveSetting("review_sms", null, "기본 문구로 되돌렸어요").then(
                () => setReviewSms("")
              )
            }
            className="px-3 py-1.5 text-xs border border-neutral-200 text-neutral-500"
          >
            기본 문구로
          </button>
        )}
        <button
          onClick={() =>
            saveSetting(
              "review_sms",
              reviewSms.trim() || null,
              reviewSms.trim() ? "리뷰요청 문자를 저장했어요 💬" : "기본 문구로 되돌렸어요"
            )
          }
          className="px-3 py-1.5 text-xs bg-sage-600 text-white"
        >
          저장
        </button>
      </div>
      <p className="text-[11px] text-neutral-400">
        <code>{"{링크}"}</code>는 하객 본인의 리뷰 페이지 주소로 자동 치환돼요.
        비워두면 기본 문구가 발송돼요.
      </p>
    </section>
  );
}
