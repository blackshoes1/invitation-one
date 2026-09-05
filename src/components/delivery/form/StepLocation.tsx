"use client";

import Q from "./Q";

export default function StepLocation({
  location,
  onLocationChange,
  onNext,
}: {
  location: string;
  onLocationChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <Q
      title="배송지를 입력해주세요 📍"
      sub="전국 어디든 직접 배달합니다 🛵 시·군·구까지만 적어주셔도 돼요"
    >
      <input
        autoFocus
        value={location}
        onChange={(e) => onLocationChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onNext()}
        enterKeyHint="done"
        placeholder="예: 서울시 강동구, 대구광역시 수성구"
        aria-label="배송받을 지역 (시·군·구)"
        className="dform-input"
      />
    </Q>
  );
}
