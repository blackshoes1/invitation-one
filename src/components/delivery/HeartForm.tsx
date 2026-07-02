"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  STAMPS,
  INVITATION_KEY,
  HEART_VIDEO_URL,
  formatPhone,
  isValidPhone,
} from "@/lib/wedding";
import { OVERSEAS, joinRegion } from "@/lib/regions";
import StampPicker from "@/components/delivery/StampPicker";
import RegionPicker from "@/components/delivery/RegionPicker";

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
  const [sido, setSido] = useState("");
  const [sub, setSub] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) return setError("앗, 성함은 꼭 알려주셔야 해요! 🙏");
    if (!sido || !sub.trim())
      return setError(
        sido === OVERSEAS
          ? "어느 나라에서 보내시는지 알려주세요 🌍"
          : "어디서 마음을 보내시는지 알려주세요 📍"
      );
    if (phone.trim() && !isValidPhone(phone))
      return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    setError(null);
    setSending(true);

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.rpc("send_heart", {
        p_group_id: group?.id ?? null,
        p_name: name.trim(),
        p_region: joinRegion(sido, sub.trim()),
        p_stamp: stamp,
        p_message: message.trim() || null,
        p_phone: phone.trim() || null,
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
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wedding-gold/10 text-wedding-gold text-xs font-bold">
          💌 마음으로 함께한 분
        </div>
        <p className="text-xs text-neutral-400">
          {joinRegion(sido, sub)}에서 보내주신 마음이
          <br />
          저희 청첩장 지도에 예쁘게 찍혔어요 📍
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

      <div className="space-y-1.5">
        <p className="text-xs font-bold text-neutral-500">
          어디서 마음을 보내시나요? 📍
        </p>
        <RegionPicker
          sido={sido}
          sub={sub}
          onChange={(s, g) => {
            setSido(s);
            setSub(g);
          }}
        />
        <p className="text-[11px] text-neutral-400">
          보내주신 지역은 청첩장 지도에 💌 핀으로 찍혀요 (구 단위까지만)
        </p>
      </div>

      <textarea
        value={message}
        maxLength={500}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="한마디 (선택)"
        className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-24 text-sm"
      />

      <div className="space-y-1.5">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          placeholder="연락처 (선택)"
          className="dform-input"
        />
        <p className="text-[11px] text-neutral-400">
          남겨주시면 다음에 청첩장에서 다시 오셨을 때 알아볼 수 있어요 💌
        </p>
      </div>

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
