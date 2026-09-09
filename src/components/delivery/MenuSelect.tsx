"use client";

import BikeIcon from "@/components/delivery/BikeIcon";

export type DeliveryMode = "delivery" | "heart";

export default function MenuSelect({
  onPick,
}: {
  onPick: (mode: DeliveryMode) => void;
}) {
  return (
    <div className="max-w-md mx-auto px-5 space-y-3">

      <button
        type="button"
        onClick={() => onPick("delivery")}
        className="w-full p-5 rounded-2xl bg-delivery text-white text-left shadow-sm active:scale-95 transition-transform flex items-center gap-3"
      >
        <BikeIcon className="w-9 h-9 text-white shrink-0" />
        <span>
          <span className="block font-extrabold">청첩장 받을 일정 정하기</span>
          <span className="block text-xs text-white/80">만나서 받을게요 🛵</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onPick("heart")}
        className="w-full p-4 rounded-2xl bg-white border-2 border-delivery/15 text-left active:scale-95 transition-transform flex items-center gap-3"
      >
        <span className="text-2xl">💌</span>
        <span>
          <span className="block font-bold text-neutral-700">축하 한마디만 남기기</span>
          <span className="block text-xs text-neutral-500">
            종이 청첩장은 안 받고 축하만 남길게요 (마음 배송 💌)
          </span>
        </span>
      </button>

      <p className="text-center text-[11px] text-neutral-500 leading-relaxed">
        결혼식 참석 여부와는 상관없어요 🙂
        <br />
          참석 응답을 하지 않아도 신청할 수 있어요
      </p>
    </div>
  );
}
