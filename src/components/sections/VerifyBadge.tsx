"use client";

import { useState } from "react";
import { supabase, isSupabaseConfigured, type VerifyResult } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";

export default function VerifyBadge({
  onVerified,
}: {
  onVerified?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [ymd, setYmd] = useState(""); // 동명이인 충돌 시에만 사용 (YYYY-MM-DD)
  const [needYmd, setNeedYmd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const verify = async () => {
    if (name.trim().length < 2) return setError("성함을 입력해주세요.");
    if (!/^\d{4}$/.test(last4)) return setError("전화번호 끝 4자리를 입력해주세요.");
    if (needYmd && !/^\d{4}-\d{2}-\d{2}$/.test(ymd))
      return setError("만난 날짜를 YYYY-MM-DD 로 입력해주세요.");

    setBusy(true);
    setError(null);

    if (!isSupabaseConfigured || !supabase) {
      // 데모 모드
      setBusy(false);
      setResult({
        name: name.trim(),
        date: "2026-08-15",
        time_slot: "오후",
        status: "완료",
        tracking_stage: "배송완료",
        review_rating: null,
        guest_no: 3,
      });
      onVerified?.(name.trim());
      return;
    }

    const { data, error: err } = await supabase.rpc("verify_guest", {
      p_name: name.trim(),
      p_last4: last4,
      p_ymd: needYmd ? ymd : null,
    });
    setBusy(false);

    if (err) return setError("확인 중 문제가 생겼어요. 다시 시도해주세요.");
    const rows = (data ?? []) as VerifyResult[];

    if (rows.length === 0) {
      setError(
        needYmd
          ? "입력하신 날짜의 신청 내역을 찾지 못했어요."
          : "신청 내역을 찾지 못했어요. 성함·번호를 다시 확인해주세요."
      );
      return;
    }
    if (rows.length > 1) {
      // 동명이인 + 끝4 우연 일치 → 날짜로 구분
      setNeedYmd(true);
      setError("동일한 정보가 여러 건 있어요. 만나신 날짜를 알려주세요.");
      return;
    }
    setResult(rows[0]);
    onVerified?.(rows[0].name);
  };

  if (result) {
    const done = result.status === "완료";
    return (
      <div className="bg-white border-2 border-wedding-gold/30 rounded-2xl p-5 text-center space-y-2">
        <p className="text-sm text-sage-700">
          <span className="font-extrabold">{result.name}</span>님,
          <br />
          {formatYmdKo(result.date)} {result.time_slot}에 만나서 반가웠어요! 🎉
        </p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-delivery/10 text-delivery text-xs font-bold">
          🛵✅ 직접 만나 받은 특별한 분
        </div>
        {done && result.guest_no != null && (
          <p className="text-xs text-wedding-gold font-bold">
            당신은 {result.guest_no}번째 손님이었어요 💛
          </p>
        )}
        {!done && (
          <p className="text-[11px] text-neutral-400">
            아직 배송 준비 중이에요 — 곧 만나요 🛵
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-sage-600 underline underline-offset-2"
      >
        혹시 청첩장을 직접 받으셨나요? 본인 확인하기 →
      </button>
    );
  }

  return (
    <div className="bg-white border border-wedding-gold/20 rounded-2xl p-5 space-y-3 text-left">
      <p className="text-xs text-neutral-500 text-center">
        받으실 때 알려주신 성함과 번호로 확인해요
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="성함"
        className="w-full p-2.5 text-sm border border-wedding-gold/20 rounded-lg focus:outline-none focus:border-sage-600"
      />
      <input
        value={last4}
        onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="전화번호 끝 4자리"
        className="w-full p-2.5 text-sm border border-wedding-gold/20 rounded-lg focus:outline-none focus:border-sage-600"
      />
      {needYmd && (
        <input
          value={ymd}
          onChange={(e) => setYmd(e.target.value)}
          placeholder="만난 날짜 (예: 2026-08-15)"
          className="w-full p-2.5 text-sm border border-wedding-gold/20 rounded-lg focus:outline-none focus:border-sage-600"
        />
      )}
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="px-4 py-2.5 text-sm text-neutral-400 border border-wedding-gold/20 rounded-full"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={verify}
          disabled={busy}
          className="flex-1 py-2.5 text-sm font-bold text-white bg-sage-600 rounded-full disabled:opacity-60"
        >
          {busy ? "확인 중…" : "확인하기"}
        </button>
      </div>
    </div>
  );
}
