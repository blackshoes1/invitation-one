"use client";

import { formatYmdKo } from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import Q from "./Q";

export default function StepDate({
  date,
  booked,
  onSelect,
}: {
  date: string | null;
  booked: Set<string>;
  onSelect: (d: string) => void;
}) {
  return (
    <Q title="배송 희망일을 선택해주세요 📅" sub="● 마감   ○ 배송 가능">
      <DeliveryCalendar
        selected={date}
        booked={booked}
        onSelect={onSelect}
        selectedClass="bg-delivery text-white font-bold"
      />
      {date && (
        <p className="text-sm text-delivery font-bold text-center pt-2">
          {formatYmdKo(date)} 선택! 👍
        </p>
      )}
    </Q>
  );
}
