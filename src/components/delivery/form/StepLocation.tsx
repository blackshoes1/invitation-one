"use client";

import Q from "./Q";
import RegionPicker from "@/components/delivery/RegionPicker";

/**
 * 배송지 — 시/도 → 시/군/구 **선택**.
 *
 * 예전에는 자유 입력이었는데, 실제로 이런 값들이 들어왔다:
 * "갱냄", "ㅎㅇ", "아무데나쥬어옹", "근영이형집". 신랑신부가 이걸로 배달 동선을
 * 짤 수 없다. 안내 문구는 이미 "시·군·구까지만"이었으므로, 물어보는 방식을
 * 그 문구에 맞춘 것이다.
 *
 * 값은 `joinRegion` 이 합친 "서울 강동구" 형태로 저장된다 — 마음 배송의 지역과
 * 같은 표기라 관리자 화면·통계에서 따로 다룰 게 없다.
 *
 * 해외는 고를 수 없다(`domesticOnly`) — 직접 배달을 갈 수 없는 곳을 신청받으면
 * 안 된다. 해외에서 축하만 남기는 길은 마음 배송이 이미 맡고 있다.
 */
export default function StepLocation({
  sido,
  sub,
  onRegionChange,
}: {
  sido: string;
  sub: string;
  onRegionChange: (sido: string, sub: string) => void;
}) {
  return (
    <Q
      title="어디로 배달할까요? 📍"
      sub="전국 어디든 직접 배달합니다 🛵 시·군·구까지만 골라주세요"
    >
      <RegionPicker sido={sido} sub={sub} onChange={onRegionChange} domesticOnly />
    </Q>
  );
}
