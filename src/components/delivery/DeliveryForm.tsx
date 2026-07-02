"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  type TimeSlot,
  formatYmdKo,
  formatPhone,
  isValidPhone,
  groom,
} from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import StepIndicator from "@/components/delivery/StepIndicator";
import OrderSummary from "@/components/delivery/OrderSummary";
import CompletePage from "@/components/delivery/CompletePage";

const SLOTS: { value: TimeSlot; emoji: string }[] = [
  { value: "오전", emoji: "🌅" },
  { value: "오후", emoji: "☀️" },
  { value: "저녁", emoji: "🌙" },
];

/** 0 받는분(이름+연락처) · 1 배송지 · 2 날짜 · 3 시간 · 4 요청 → 요약 → 완료 */
const TOTAL = 5;
const DRAFT_KEY = "delivery-form-draft";

interface Draft {
  name: string;
  phone: string;
  location: string;
  date: string | null;
  slot: TimeSlot | null;
  message: string;
}

export default function DeliveryForm({
  group = null,
  convertId = null,
  onSubmitted,
}: {
  group?: { id: string; name: string } | null;
  /** 마음배송 → 직접배달 전환 시 기존 참여자 id */
  convertId?: string | null;
  onSubmitted?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [summary, setSummary] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [message, setMessage] = useState("");

  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [orderNo, setOrderNo] = useState("001");
  const [participantId, setParticipantId] = useState<string | null>(null);

  const loadBooked = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data } = await supabase.rpc("get_booked_dates");
    if (Array.isArray(data)) {
      setBooked(new Set(data.map((d: string) => String(d).slice(0, 10))));
    }
  };

  // 입력값 보존 — 새로고침/이탈 후 재진입 시 이어서
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(d.name ?? "");
        setPhone(d.phone ?? "");
        setLocation(d.location ?? "");
        setDate(d.date ?? null);
        setSlot(d.slot ?? null);
        setMessage(d.message ?? "");
      }
    } catch {
      /* ignore */
    }
    loadBooked();
  }, []);

  useEffect(() => {
    if (done) return;
    const d: Draft = { name, phone, location, date, slot, message };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [name, phone, location, date, slot, message, done]);

  const go = (delta: number) => {
    setError(null);
    setDir(delta);
    setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + delta)));
  };

  const next = () => {
    if (step === 0) {
      if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
      if (!isValidPhone(phone))
        return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    }
    if (step === 1 && location.trim().length < 2)
      return setError("배송지를 입력해주세요 📍");
    if (step === 2 && !date) return setError("배송 희망일을 골라주세요 📅");
    if (step === 3 && !slot) return setError("시간대를 골라주세요 ⏰");
    if (step === TOTAL - 1) {
      setError(null);
      setSummary(true);
      return;
    }
    go(1);
  };

  const submit = async () => {
    setError(null);
    if (!date || !slot) return;
    setSending(true);
    setOrderNo(String(booked.size + 1).padStart(3, "0"));

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("create_delivery_v2", {
        p_group_id: group?.id ?? null,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_location: location.trim(),
        p_date: date,
        p_time: slot,
        p_message: message.trim() || null,
        p_convert: convertId,
      });
      if (error) {
        setSending(false);
        setSummary(false);
        if (error.code === "23505" || error.message.includes("date_taken")) {
          setError("방금 다른 분이 먼저 신청하셨어요 😢 다른 날짜를 골라주세요");
          setDate(null);
          setDir(-1);
          setStep(2);
          loadBooked();
        } else {
          setError("주문에 실패했어요. 잠시 후 다시 시도해주세요 🛠️");
        }
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.participant_id) setParticipantId(row.participant_id as string);
    } else {
      console.info("[delivery demo]", { group, name, phone, location, date, slot, message });
      await new Promise((r) => setTimeout(r, 500));
    }
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setSending(false);
    setDone(true);
    onSubmitted?.();
  };

  if (done && date && slot) {
    return (
      <CompletePage
        name={name}
        date={date}
        slot={slot}
        location={location}
        orderNo={orderNo}
        memberCount={1}
        participantId={participantId}
      />
    );
  }

  if (summary && date && slot) {
    return (
      <OrderSummary
        name={name}
        phone={phone}
        location={location}
        date={date}
        slot={slot}
        onEdit={() => setSummary(false)}
        onConfirm={submit}
        sending={sending}
        error={error}
      />
    );
  }

  const content = () => {
    switch (step) {
      case 0:
        return (
          <Q title="받는 분 정보를 알려주세요 📋">
            <div className="space-y-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성함"
                className="dform-input"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder="배송 완료 후 연락드릴 번호 📞"
                className="dform-input"
              />
            </div>
          </Q>
        );
      case 1:
        return (
          <Q title="배송지를 입력해주세요 📍" sub="전국 어디든 직접 배달합니다 🛵 정확할수록 빨리 찾아가요">
            <input
              autoFocus
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder="예: 강남역 2번 출구, 회사 앞"
              className="dform-input"
            />
          </Q>
        );
      case 2:
        return (
          <Q title="배송 희망일을 선택해주세요 📅" sub="● 마감   ○ 배송 가능">
            <DeliveryCalendar
              selected={date}
              booked={booked}
              onSelect={setDate}
              selectedClass="bg-delivery text-white font-bold"
            />
            {date && (
              <p className="text-sm text-delivery font-bold text-center pt-2">
                {formatYmdKo(date)} 선택! 👍
              </p>
            )}
          </Q>
        );
      case 3:
        return (
          <Q title={`${date ? formatYmdKo(date) : ""} 배송 희망 시간대를 골라주세요 ⏰`}>
            <div className="grid grid-cols-3 gap-3">
              {SLOTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSlot(s.value)}
                  aria-pressed={slot === s.value}
                  className={`py-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                    slot === s.value
                      ? "border-delivery bg-delivery text-white scale-105"
                      : "border-delivery/20 bg-white text-neutral-500"
                  }`}
                >
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="text-sm font-bold">{s.value}</span>
                </button>
              ))}
            </div>
          </Q>
        );
      case 4:
        return (
          <Q
            title={`배송기사(${groom.name})에게 요청사항이 있으신가요? 💬`}
            sub="예: 신부도 같이 와주세요 (선택)"
          >
            <textarea
              autoFocus
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="요청사항을 적어주세요"
              className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-28 text-sm"
            />
          </Q>
        );
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 pt-6 pb-10">
      {group && (
        <p className="text-center text-xs text-delivery font-bold mb-3">
          📦 {group.name} 그룹 주문
        </p>
      )}
      {convertId && (
        <p className="text-center text-xs text-delivery-mint font-bold mb-3">
          💌 → 🛵 마음 배송에서 직접 배달로 전환 중이에요
        </p>
      )}
      <StepIndicator current={step} total={TOTAL} />

      <div className="relative mt-8 min-h-[320px]">
        <AnimatePresence custom={dir} mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: dir > 0 ? 50 : -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir > 0 ? -50 : 50 }}
            transition={{ duration: 0.25 }}
          >
            {content()}
            {error && (
              <p className="mt-4 text-sm text-delivery-dark font-medium text-center">
                {error}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="flex items-center justify-center gap-1 px-5 py-4 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold"
          >
            <ArrowLeft size={16} /> 이전
          </button>
        )}
        <button
          type="button"
          onClick={next}
          className="flex-1 flex items-center justify-center gap-1 py-4 rounded-full bg-delivery text-white text-sm font-bold shadow-sm active:scale-95 transition-transform"
        >
          {step < TOTAL - 1 ? (
            <>
              다음 <ArrowRight size={16} />
            </>
          ) : (
            "주문 확인하기 🧾"
          )}
        </button>
      </div>
    </div>
  );
}

function Q({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-xl font-extrabold text-neutral-800 leading-snug">
          {title}
        </h2>
        {sub && <p className="text-sm text-neutral-400">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
