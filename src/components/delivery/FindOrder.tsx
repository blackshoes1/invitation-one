"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import type {
  TimeSlotValue,
  DeliveryStatus,
  TrackingStage,
  ParticipantType,
} from "@/lib/supabase";

interface Found {
  participant_id: string;
  type: ParticipantType;
  name: string;
  date: string | null;
  time_slot: TimeSlotValue | null;
  status: DeliveryStatus | null;
  tracking_stage: TrackingStage | null;
}

const EMPTY_SET = new Set<string>();

/**
 * 내 신청 찾기 — 이름 + 연락처 끝 4자리 + 신청(배송)일자(달력 선택)
 * 일치하면 manage 페이지로 재접근 (취소/변경/배송 현황)
 */
export default function FindOrder() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Found[] | null>(null);
  const last4Ref = useRef<HTMLInputElement>(null);

  const search = async () => {
    if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
    if (!/^\d{4}$/.test(last4))
      return setError("연락처 끝 4자리를 입력해주세요 📞");
    if (!date) return setError("신청하신 배송 날짜를 달력에서 골라주세요 📅");
    setError(null);
    setBusy(true);

    if (!isSupabaseConfigured || !supabase) {
      setBusy(false);
      setResults([]);
      return;
    }
    const { data, error } = await supabase.rpc("find_participants", {
      p_name: name.trim(),
      p_last4: last4,
      p_date: date,
    });
    setBusy(false);
    if (error) return setError("조회 중 문제가 생겼어요. 다시 시도해주세요 🛠️");
    setResults(Array.isArray(data) ? (data as Found[]) : []);
  };

  if (!open) {
    return (
      <div className="text-center py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-neutral-500 underline underline-offset-2"
        >
          이미 신청하셨나요? 내 신청 찾기 🔍
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-4">
      <div className="bg-white rounded-2xl border border-delivery/10 p-5 space-y-3">
        <p className="text-center text-sm font-bold text-neutral-700">
          내 신청 찾기 🔍
        </p>
        <p className="text-center text-[11px] text-neutral-400">
          신청할 때 입력한 정보로 찾아드려요
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              last4Ref.current?.focus();
            }
          }}
          enterKeyHint="next"
          placeholder="성함"
          className="dform-input"
        />
        <input
          ref={last4Ref}
          inputMode="numeric"
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => e.key === "Enter" && search()}
          enterKeyHint="done"
          placeholder="연락처 끝 4자리"
          className="dform-input"
        />

        <div className="space-y-1.5">
          <p className="text-xs font-bold text-neutral-500">
            신청하신 배송 날짜 📅
          </p>
          <DeliveryCalendar
            selected={date}
            booked={EMPTY_SET}
            onSelect={setDate}
            selectedClass="bg-delivery text-white font-bold"
          />
          {date && (
            <p className="text-xs text-delivery font-bold text-center">
              {formatYmdKo(date)} 선택
            </p>
          )}
        </div>

        {error && <p className="text-xs text-delivery-dark text-center">{error}</p>}

        {results !== null &&
          (results.length === 0 ? (
            <p className="text-center text-xs text-neutral-400 py-2">
              신청 내역을 찾지 못했어요 😢
              <br />
              성함·끝 4자리·날짜를 다시 확인해주세요
            </p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.participant_id}>
                  <Link
                    href={`/delivery/manage/${r.participant_id}`}
                    className="block bg-delivery/5 rounded-xl px-4 py-3 text-left active:scale-[0.98] transition-transform"
                  >
                    <p className="text-sm font-bold text-neutral-700">
                      🛵 {r.date ? formatYmdKo(r.date) : ""} {r.time_slot ?? ""}
                      <span className="float-right text-[11px] font-medium text-delivery">
                        관리하기 →
                      </span>
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      {r.status} · {r.tracking_stage}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
              setResults(null);
            }}
            className="px-4 py-2.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-xs font-bold"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={search}
            disabled={busy}
            className="flex-1 py-2.5 rounded-full bg-delivery text-white text-xs font-extrabold disabled:opacity-60"
          >
            {busy ? "찾는 중…" : "찾기 🔍"}
          </button>
        </div>
      </div>
    </div>
  );
}
