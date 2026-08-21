"use client";

/**
 * 개인 초대 링크로 확인된 연락처 표시 (마스킹). 실제 번호는 서버에만 있고
 * 제출 시 토큰으로 채워진다. "다른 번호 입력" 을 누르면 일반 입력칸으로 전환.
 */
export default function InvitePhoneBox({
  phoneMasked,
  onUseOther,
}: {
  phoneMasked: string;
  onUseOther?: () => void;
}) {
  return (
    <div className="dform-input flex items-center justify-between gap-2 bg-delivery/5 border-delivery/30">
      <span className="text-neutral-700">
        📞 {phoneMasked}
        <span className="ml-2 text-[11px] text-delivery font-bold">초대 링크로 확인됨 ✓</span>
      </span>
      {onUseOther && (
        <button
          type="button"
          onClick={onUseOther}
          className="shrink-0 text-[11px] text-neutral-400 underline underline-offset-2"
        >
          다른 번호 입력
        </button>
      )}
    </div>
  );
}
