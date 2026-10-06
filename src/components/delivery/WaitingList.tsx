"use client";

import { useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatPhone, isValidPhone } from "@/lib/wedding";

/** 마감 시 대기자 등록 폼 */
export default function WaitingList() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      return setError("이름과 연락처를 입력해주세요 🙏");
    }
    // 취소 자리가 나면 SMS 로 연락할 번호 — 다른 폼과 동일하게 형식 검증
    if (!isValidPhone(phone))
      return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    setError(null);
    setSending(true);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("waiting_list")
        .insert({ name: name.trim(), phone: phone.trim() });
      if (error) {
        setSending(false);
        return setError("등록에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } else {
      await new Promise((r) => setTimeout(r, 400));
    }
    setSending(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="text-center space-y-2 py-6">
        <div className="text-4xl">📝</div>
        <p className="font-bold text-neutral-800">대기자 명단에 등록됐어요!</p>
        <p className="text-xs text-neutral-500">
          취소 자리가 생기면 순서대로 연락드릴게요 🛵
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름"
        aria-label="이름"
        className="dform-input"
      />
      <input
        type="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(formatPhone(e.target.value))}
        placeholder="연락처 010-0000-0000"
        aria-label="연락처"
        className="dform-input"
      />
      {error && <p className="text-xs text-delivery-dark text-center">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="w-full py-3.5 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform disabled:opacity-60"
      >
        {sending ? "등록 중…" : "대기자 등록하기"}
      </button>
    </div>
  );
}
