"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { supabase, isSupabaseConfigured, type GroupOrder } from "@/lib/supabase";
import { formatYmdKo, formatPhone, isValidPhone } from "@/lib/wedding";
import CompletePage from "@/components/delivery/CompletePage";

/**
 * 기존 주문 합류 — 초경량 폼 (이름 + 연락처만)
 * 날짜/장소/시간은 기존 주문 것을 따름
 */
export default function JoinForm({
  order,
  groupSlug,
  convertId = null,
  onBack,
  onJoined,
}: {
  order: GroupOrder;
  groupSlug?: string | null;
  /** 마음배송 → 직접배달 전환 시 기존 참여자 id */
  convertId?: string | null;
  onBack: () => void;
  onJoined?: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);

  const owner = order.member_names[0] ?? "";
  const others = order.member_names.length;

  const submit = async () => {
    if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
    if (!isValidPhone(phone))
      return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    setError(null);
    setSending(true);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("join_delivery", {
        p_delivery: order.id,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_convert: convertId,
      });
      setSending(false);
      if (error) return setError("합류에 실패했어요. 잠시 후 다시 시도해주세요 🛠️");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.result === "dup")
        return setError("이미 이 주문에 함께하고 계세요 😊");
      if (row?.result === "closed")
        return setError("이 주문은 마감됐어요 😢 다른 주문을 골라주세요");
      setParticipantId((row?.participant_id as string) ?? null);
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setSending(false);
    }
    setDone(true);
    onJoined?.();
  };

  if (done) {
    return (
      <CompletePage
        name={name}
        date={order.date}
        slot={order.time_slot}
        orderNo="합류"
        memberCount={others + 1}
        participantId={participantId}
        joined
        groupSlug={groupSlug}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm mx-auto px-6 py-6 space-y-5"
    >
      <div className="text-center space-y-1">
        <h2 className="text-xl font-extrabold text-neutral-800">
          {formatYmdKo(order.date)} {order.time_slot} 주문에
          <br />
          합류할게요 ➕
        </h2>
        <p className="text-sm text-neutral-400">
          {owner}
          {others > 1 ? `님 외 ${others - 1}명` : "님"}과 함께 받아요
        </p>
      </div>

      <div className="space-y-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="성함 📋"
          className="dform-input"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="연락처 📞 010-0000-0000"
          className="dform-input"
        />
      </div>

      {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-4 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold"
        >
          이전
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={sending}
          className="flex-1 py-4 rounded-full bg-delivery text-white text-sm font-extrabold active:scale-95 transition-transform disabled:opacity-60"
        >
          {sending ? "합류 중… 🛵" : "함께 받기 🛵"}
        </button>
      </div>
    </motion.div>
  );
}
