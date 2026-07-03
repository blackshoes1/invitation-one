"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatYmdKo, formatPhone, isValidPhone } from "@/lib/wedding";
import type { TimeSlotValue, DeliveryStatus, TrackingStage, ParticipantType } from "@/lib/supabase";

interface Found {
  participant_id: string;
  type: ParticipantType;
  name: string;
  date: string | null;
  time_slot: TimeSlotValue | null;
  status: DeliveryStatus | null;
  tracking_stage: TrackingStage | null;
}

/**
 * 내 신청 찾기 — 이름+연락처로 조회해 manage 페이지로 재접근
 * (주문 완료 화면을 벗어난 뒤에도 취소/변경/배송 현황 확인 가능)
 */
export default function FindOrder() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Found[] | null>(null);

  const search = async () => {
    if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
    if (!isValidPhone(phone))
      return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    setError(null);
    setBusy(true);

    if (!isSupabaseConfigured || !supabase) {
      setBusy(false);
      setResults([]);
      return;
    }
    const { data, error } = await supabase.rpc("find_participants", {
      p_name: name.trim(),
      p_phone: phone.trim(),
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
          신청할 때 입력한 성함과 연락처로 찾아드려요
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="성함"
          className="dform-input"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="연락처 010-0000-0000"
          className="dform-input"
        />
        {error && <p className="text-xs text-delivery-dark text-center">{error}</p>}

        {results !== null &&
          (results.length === 0 ? (
            <p className="text-center text-xs text-neutral-400 py-2">
              신청 내역을 찾지 못했어요 😢
              <br />
              성함·연락처를 다시 확인해주세요
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
                      {r.type === "마음배송"
                        ? "💌 마음 배송"
                        : `🛵 ${r.date ? formatYmdKo(r.date) : ""} ${r.time_slot ?? ""}`}
                      <span className="float-right text-[11px] font-medium text-delivery">
                        관리하기 →
                      </span>
                    </p>
                    {r.type === "직접배달" && (
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {r.status} · {r.tracking_stage}
                      </p>
                    )}
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
