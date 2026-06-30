"use client";

export type DeliveryMode = "delivery" | "heart";

export default function MenuSelect({
  onPick,
}: {
  onPick: (mode: DeliveryMode) => void;
}) {
  return (
    <div className="max-w-sm mx-auto px-6 space-y-4">
      <p className="text-center text-sm font-bold text-neutral-700">
        🛵 메뉴를 골라주세요
      </p>

      <button
        type="button"
        onClick={() => onPick("delivery")}
        className="w-full p-5 rounded-2xl bg-delivery text-white text-left shadow-sm active:scale-95 transition-transform flex items-center gap-3"
      >
        <span className="text-3xl">🛵</span>
        <span>
          <span className="block font-extrabold">직접 배달 받기</span>
          <span className="block text-xs text-white/80">만나서 청첩장 받기</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onPick("heart")}
        className="w-full p-4 rounded-2xl bg-white border-2 border-delivery/15 text-left active:scale-95 transition-transform flex items-center gap-3"
      >
        <span className="text-2xl">💌</span>
        <span>
          <span className="block font-bold text-neutral-700">마음 배송</span>
          <span className="block text-xs text-neutral-400">
            못 만나도 마음 전하기
          </span>
        </span>
      </button>
    </div>
  );
}
