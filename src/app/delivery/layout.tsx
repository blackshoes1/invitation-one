import type { Metadata } from "next";
import { groom, bride } from "@/lib/wedding";

export const metadata: Metadata = {
  title: `청첩장 배달 서비스 🛵 | ${groom.name} ♥ ${bride.name}`,
  description:
    "청첩장도 배달이 되나요? 네, 됩니다! 신랑신부가 직접 찾아가 청첩장을 전해드려요. 지금 주문하세요 🛵",
};

/**
 * 배달앱 느낌의 별도 레이아웃.
 * 루트 layout 의 body(overflow-hidden) 안에서 자체 스크롤 컨테이너로 동작합니다.
 */
export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-[100dvh] overflow-y-auto bg-delivery-bg text-neutral-800 font-sans">
      {children}
    </div>
  );
}
