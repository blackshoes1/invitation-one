"use client";

import type { SaveSetting } from "./types";

/** 확정 감사 문자 (LC-2) 섹션 */
export default function ConfirmSmsSection({
  confirmSms,
  setConfirmSms,
  saveSetting,
}: {
  confirmSms: string;
  setConfirmSms: (v: string) => void;
  saveSetting: SaveSetting;
}) {
  return (
    <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
      <p className="text-sm font-medium text-sage-700">확정 감사 문자</p>
      <p className="text-[11px] text-neutral-400">
        주문을 <b>확정</b> 처리할 때 하객에게 자동 발송돼요 (연락처 보유자만).
        <br />
        치환: <code>{"{이름}"}</code> <code>{"{날짜}"}</code>{" "}
        <code>{"{시간}"}</code> <code>{"{장소}"}</code>
      </p>
      <textarea
        value={confirmSms}
        maxLength={300}
        onChange={(e) => setConfirmSms(e.target.value)}
        placeholder="[청첩장 배달] {이름}님, 소중한 마음으로 신청해주셔서 감사합니다 🙏 {날짜} {시간} {장소}(으)로 찾아뵙겠습니다. 곧 만나요!"
        className="w-full p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600 resize-none h-24"
      />
      <div className="flex justify-end gap-2">
        {confirmSms && (
          <button
            onClick={() =>
              saveSetting("confirm_sms", null, "기본 문구로 되돌렸어요").then(
                () => setConfirmSms("")
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
              "confirm_sms",
              confirmSms.trim() || null,
              confirmSms.trim() ? "확정 감사 문자를 저장했어요 💬" : "기본 문구로 되돌렸어요"
            )
          }
          className="px-3 py-1.5 text-xs bg-sage-600 text-white"
        >
          저장
        </button>
      </div>
      <p className="text-[11px] text-neutral-400">
        비워두면 기본 감사 문구가 발송돼요. (솔라피 키 없으면 발송은 skip)
      </p>
    </section>
  );
}
