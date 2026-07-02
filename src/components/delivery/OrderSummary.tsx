"use client";

import { formatYmdKo } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";

export default function OrderSummary({
  name,
  phone,
  location,
  date,
  slot,
  onEdit,
  onConfirm,
  sending,
  error,
}: {
  name: string;
  phone: string;
  location: string;
  date: string;
  slot: TimeSlot;
  onEdit: () => void;
  onConfirm: () => void;
  sending: boolean;
  error?: string | null;
}) {
  return (
    <div className="max-w-md mx-auto px-5 py-6 space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-extrabold text-neutral-800">이대로 주문할까요? 🛵</h2>
        <p className="text-sm text-neutral-400">한 번만 확인해주세요!</p>
      </div>

      <div className="bg-white rounded-2xl border border-delivery/10 p-5 space-y-2.5 text-sm">
        <Row label="받는 분" value={`${name} · ${phone}`} />
        <Row label="배송지" value={location} />
        <Row label="배송 예정" value={`${formatYmdKo(date)} ${slot}`} />
        <Row label="함께 받는 인원" value="참여자 수로 자동 집계돼요 👥" />
      </div>

      {error && (
        <p className="text-sm text-delivery-dark font-medium text-center">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="px-5 py-4 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold"
        >
          수정하기
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={sending}
          className="flex-1 py-4 rounded-full bg-delivery text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-60"
        >
          {sending ? "주문 접수 중… 🛵" : "네, 주문할게요 🛵"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span className="text-right text-neutral-700 font-medium">{value}</span>
    </div>
  );
}
