"use client";
import { useState } from "react";
import type { VerifyResultV2 } from "@/lib/supabase";
import { formatYmdKo, formatPhone } from "@/lib/wedding";
import PhoneVerification from "@/components/PhoneVerification";

export default function VerifyBadge({ onVerified }: { onVerified?: (participantId: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<VerifyResultV2 | null>(null);
  if (result) {
    const isHeart = result.type === "마음배송";
    const done = result.status === "완료";
    return (
      <div className="bg-white border-2 border-wedding-gold/30 rounded-2xl p-5 text-center space-y-2">
        {isHeart ? (
          <p className="text-sm text-sage-700">
            <span className="font-extrabold">{result.name}</span>님,
            <br />
            {result.region ? `${result.region}에서 ` : ""}보내주신 마음, 잘 받았어요! 🥰
          </p>
        ) : (
          <p className="text-sm text-sage-700">
            <span className="font-extrabold">{result.name}</span>님,
            <br />
            {result.date ? `${formatYmdKo(result.date)} ${result.time_slot ?? ""}에 ` : ""}
            {done ? "만나서 반가웠어요! 🎉" : "곧 만나요! 🛵"}
          </p>
        )}

        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
            isHeart
              ? "bg-wedding-gold/10 text-wedding-gold"
              : "bg-delivery/10 text-delivery"
          }`}
        >
          {isHeart ? "💌 마음으로 함께한 분" : "🛵✅ 직접 만나 받은 특별한 분"}
        </div>

        {result.guest_no != null && (isHeart || done) && (
          <p className="text-xs text-wedding-gold font-bold">
            당신은 {result.guest_no}번째 손님이었어요 💛
          </p>
        )}
        {!isHeart && !done && (
          <p className="text-[11px] text-neutral-500">
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
        혹시 청첩장을 받으셨거나 마음을 보내셨나요? 본인 확인하기 →
      </button>
    );
  }


  return <div className="bg-white border border-wedding-gold/20 rounded-2xl p-5 space-y-3 text-left">
    <p className="text-xs text-neutral-500">신청하실 때 알려주신 성함과 전체 전화번호를 입력해주세요.</p>
    <input aria-label="성함" placeholder="성함" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border p-3 text-base" />
    <input aria-label="전화번호" placeholder="010-0000-0000" type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} className="w-full rounded-lg border p-3 text-base" />
    <PhoneVerification name={name} phone={phone} purpose="badge" onVerified={(_, data) => {
      if (data) { setResult(data); onVerified?.(data.participant_id, data.name); }
    }} />
    <button type="button" onClick={() => setOpen(false)} className="text-xs underline">닫기</button>
  </div>;
}
