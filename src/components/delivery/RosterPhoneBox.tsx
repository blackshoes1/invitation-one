"use client";

/**
 * 명단에서 이름을 골랐을 때의 연락처 자리 — **번호를 보여주지 않는다.**
 *
 * 초대 링크(`InvitePhoneBox`)는 토큰이 신원을 증명하므로 마스킹 번호를 보여줘도
 * 본인에게 보여주는 것이다. 그룹 링크는 누가 눌렀는지 알 수 없으므로, 마스킹
 * 번호조차 보여주면 **링크를 가진 누구나 남의 번호 뒷자리를 알아낼 수 있다.**
 * 그래서 여기서는 "명단의 번호로 보낸다"는 사실만 알리고, 실제 번호는 제출
 * 시점에 서버가 붙인다 (`rosterPhone`).
 */
export default function RosterPhoneBox({
  name,
  onUseOther,
}: {
  name: string;
  onUseOther?: () => void;
}) {
  return (
    <div className="dform-input flex items-center justify-between gap-2 bg-delivery/5 border-delivery/30">
      <span className="text-neutral-700 text-sm">
        📞 명단에 있는 {name}님 번호로 보낼게요
      </span>
      {onUseOther && (
        <button
          type="button"
          onClick={onUseOther}
          className="shrink-0 text-[11px] text-neutral-500 underline underline-offset-2"
        >
          다른 번호 입력
        </button>
      )}
    </div>
  );
}
