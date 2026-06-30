"use client";

import WaitingList from "@/components/delivery/WaitingList";

/** 정원 마감 시 노출되는 화면 + 대기자 등록 */
export default function DeliveryClosed() {
  return (
    <div className="px-6 py-12 text-center max-w-md mx-auto space-y-5">
      <div className="text-5xl">😢</div>
      <h2 className="text-xl font-extrabold text-neutral-800">
        아쉽게도 마감됐어요
      </h2>
      <p className="text-sm text-neutral-500 leading-relaxed">
        대기자 명단에 올려드릴까요?
        <br />
        취소 자리가 생기면 순서대로 연락드려요 🛵
      </p>
      <div className="bg-white rounded-2xl border border-delivery/10 p-5">
        <WaitingList />
      </div>
    </div>
  );
}
