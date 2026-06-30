"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  supabase,
  isSupabaseConfigured,
  type DeliveryDetail,
} from "@/lib/supabase";
import { type TimeSlot, formatYmdKo } from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";

const SLOTS: TimeSlot[] = ["오전", "오후", "저녁"];

export default function CancelChangeForm({ deliveryId }: { deliveryId: string }) {
  const [detail, setDetail] = useState<DeliveryDetail | null | undefined>(undefined);
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"view" | "change">("view");
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState<TimeSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"changed" | "cancelled" | null>(null);

  const load = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setDetail(null);
      return;
    }
    const { data } = await supabase.rpc("get_delivery", { p_id: deliveryId });
    const row = Array.isArray(data) && data[0] ? (data[0] as DeliveryDetail) : null;
    setDetail(row);
    const { data: bd } = await supabase.rpc("get_booked_dates");
    if (Array.isArray(bd)) {
      const set = new Set(bd.map((d: string) => String(d).slice(0, 10)));
      if (row) set.delete(row.date); // 본인 날짜는 선택 가능하도록 제외
      setBooked(set);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId]);

  const doReschedule = async () => {
    if (!newDate || !newSlot) return setError("새 날짜와 시간대를 선택해주세요.");
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("reschedule_delivery", {
        p_id: deliveryId,
        p_date: newDate,
        p_time: newSlot,
      });
      setBusy(false);
      if (error) return setError("변경에 실패했어요. 다시 시도해주세요.");
      if (data === "taken")
        return setError("방금 다른 분이 먼저 신청한 날짜예요 😢 다른 날짜를 골라주세요.");
      if (data === "range") return setError("신청 가능 기간이 아니에요.");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setBusy(false);
    }
    setResult("changed");
  };

  const doCancel = async () => {
    if (!confirm("정말 신청을 취소하시겠어요? 날짜 자리가 즉시 해제됩니다.")) return;
    setBusy(true);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.rpc("cancel_delivery", { p_id: deliveryId });
      setBusy(false);
      if (error) return setError("취소에 실패했어요. 다시 시도해주세요.");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setBusy(false);
    }
    setResult("cancelled");
  };

  if (detail === undefined)
    return (
      <div className="h-[50vh] flex items-center justify-center text-sm text-neutral-400">
        불러오는 중…
      </div>
    );

  if (detail === null)
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
        <div className="text-5xl">🔍</div>
        <p className="font-bold text-neutral-700">신청 내역을 찾을 수 없어요</p>
        <Link href="/delivery" className="mt-2 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold">
          배달 메인으로
        </Link>
      </div>
    );

  if (result)
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
        <div className="text-5xl">{result === "cancelled" ? "🗑️" : "✅"}</div>
        <p className="font-extrabold text-lg text-neutral-800">
          {result === "cancelled" ? "신청이 취소되었어요" : "변경이 완료되었어요"}
        </p>
        <p className="text-sm text-neutral-500">
          {result === "cancelled"
            ? "또 필요하시면 언제든 다시 신청해주세요 🛵"
            : "변경된 일정으로 찾아뵐게요 🛵"}
        </p>
        <Link href="/" className="mt-2 text-sm text-neutral-400 underline underline-offset-2">
          💌 청첩장으로 돌아가기
        </Link>
      </div>
    );

  if (detail.status === "취소")
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
        <div className="text-5xl">🗑️</div>
        <p className="font-bold text-neutral-700">이미 취소된 신청이에요</p>
        <Link href="/delivery" className="mt-2 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold">
          다시 신청하기
        </Link>
      </div>
    );

  return (
    <div className="max-w-md mx-auto px-6 py-8 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-extrabold text-neutral-800">
          {detail.name}님의 신청 내역
        </h1>
        <p className="text-sm text-neutral-500">
          현재 예약:{" "}
          <span className="font-bold text-delivery">
            {formatYmdKo(detail.date)} {detail.time_slot}
          </span>
          , {detail.location}
        </p>
        <span className="inline-block text-[11px] mt-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
          상태: {detail.status}
        </span>
      </div>

      {mode === "view" ? (
        <div className="space-y-3">
          <button
            onClick={() => setMode("change")}
            className="w-full py-3.5 rounded-full bg-delivery text-white font-bold active:scale-95 transition-transform"
          >
            날짜/시간 변경하기
          </button>
          <button
            onClick={doCancel}
            disabled={busy}
            className="w-full py-3.5 rounded-full bg-white border-2 border-delivery/20 text-delivery-dark font-bold disabled:opacity-60"
          >
            신청 취소하기
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-bold text-neutral-700">새 날짜를 골라주세요 📅</p>
          <DeliveryCalendar
            selected={newDate}
            booked={booked}
            onSelect={setNewDate}
            selectedClass="bg-delivery text-white font-bold"
          />
          <div className="grid grid-cols-3 gap-3">
            {SLOTS.map((s) => (
              <button
                key={s}
                onClick={() => setNewSlot(s)}
                className={`py-3 rounded-xl border-2 text-sm font-bold ${
                  newSlot === s
                    ? "border-delivery bg-delivery text-white"
                    : "border-delivery/20 bg-white text-neutral-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setMode("view");
                setError(null);
              }}
              className="px-5 py-3.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 font-bold"
            >
              이전
            </button>
            <button
              onClick={doReschedule}
              disabled={busy}
              className="flex-1 py-3.5 rounded-full bg-delivery text-white font-bold disabled:opacity-60"
            >
              {busy ? "변경 중…" : "변경하기"}
            </button>
          </div>
        </div>
      )}

      {error && mode === "view" && (
        <p className="text-sm text-delivery-dark text-center">{error}</p>
      )}
    </div>
  );
}
