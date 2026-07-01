"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { STAMPS, INVITATION_KEY, HEART_VIDEO_URL } from "@/lib/wedding";
import StampPicker from "@/components/delivery/StampPicker";

const invitationHref = INVITATION_KEY ? `/?key=${INVITATION_KEY}` : "/";

export default function HeartForm({
  group = null,
  onSwitchToDelivery,
}: {
  group?: { id: string; name: string } | null;
  /** "역시 직접 만나고 싶어요" — 같은 페이지에서 직접 배달 폼으로 전환 */
  onSwitchToDelivery?: () => void;
}) {
  const [stamp, setStamp] = useState<string>(STAMPS[0]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) return setError("앗, 성함은 꼭 알려주셔야 해요! 🙏");
    setError(null);
    setSending(true);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("messages").insert({
        group_id: group?.id ?? null,
        name: name.trim(),
        stamp,
        message: message.trim() || null,
      });
      if (error) {
        setSending(false);
        return setError("전송에 실패했어요. 잠시 후 다시 시도해주세요 🛠️");
      }
    } else {
      await new Promise((r) => setTimeout(r, 400));
    }
    setSending(false);
    setDone(true);
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm mx-auto px-6 py-10 text-center space-y-4"
      >
        <div className="text-5xl">{stamp}</div>
        <p className="text-lg font-extrabold text-neutral-800">
          따뜻한 마음 잘 받았어요 🥰
        </p>

        {HEART_VIDEO_URL && (
          <div className="bg-delivery/5 rounded-2xl p-5 space-y-2">
            <p className="text-xs text-neutral-500 leading-relaxed">
              직접 못 뵙는 게 아쉬워서
              <br />
              저희가 짧게 인사 남겼어요
            </p>
            <a
              href={HEART_VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-full bg-delivery-mint text-white font-bold text-sm"
            >
              두 사람의 짧은 감사 영상 ▶
            </a>
          </div>
        )}

        <p className="text-sm text-neutral-500">결혼식에서는 꼭 안아드릴게요!</p>
        <Link
          href={invitationHref}
          className="inline-block mt-1 px-6 py-3.5 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform"
        >
          💌 모바일 청첩장 보기
        </Link>

        {/* 마음 → 직접 배달 전환 (거절이 아니라 마음이 바뀔 여지) */}
        {onSwitchToDelivery && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onSwitchToDelivery}
              className="text-sm text-delivery underline underline-offset-2"
            >
              역시 직접 만나서 받고 싶어요 🛵
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-6 space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-extrabold text-neutral-800">💌 마음 배송</h2>
        <p className="text-sm text-neutral-400">
          못 만나도 마음은 전할 수 있어요
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-neutral-500 text-center">축하 스탬프</p>
        <StampPicker value={stamp} onChange={setStamp} />
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름"
        className="dform-input"
      />
      <textarea
        value={message}
        maxLength={500}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="한마디 (선택)"
        className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-24 text-sm"
      />
      {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="w-full py-4 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform disabled:opacity-60"
      >
        {sending ? "전하는 중…" : "마음 전하기 💌"}
      </button>
    </div>
  );
}
