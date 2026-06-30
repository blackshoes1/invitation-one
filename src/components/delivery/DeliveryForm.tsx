"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  type TimeSlot,
  formatYmdKo,
  formatPhone,
  isValidPhone,
  groom,
  PARTY_MAX,
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

const TOTAL = 6; // 입력 스텝 수 (요약 제외)

interface Draft {
  name: string;
  phone: string;
  location: string;
  date: string | null;
  slot: TimeSlot | null;
  party: number;
  message: string;
}

export default function DeliveryForm({
  group = null,
  onSubmitted,
}: {
  group?: { id: string; name: string } | null;
  onSubmitted?: () => void;
}) {
  const storageKey = `delivery-draft${group ? `-${group.id}` : ""}`;

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [summary, setSummary] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<TimeSlot | null>(null);
  const [party, setParty] = useState(1);
  const [message, setMessage] = useState("");

  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [orderNo, setOrderNo] = useState("001");
  const [deliveryId, setDeliveryId] = useState<string | null>(null);

  const restored = useRef(false);

  // 예약일 로드
  const loadBooked = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data } = await supabase.rpc("get_booked_dates");
    if (Array.isArray(data)) {
      setBooked(new Set(data.map((d: string) => String(d).slice(0, 10))));
    }
  };

  // 입력값 보존: 마운트 시 복원
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBooked();
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        setName(d.name ?? "");
        setPhone(d.phone ?? "");
        setLocation(d.location ?? "");
        setDate(d.date ?? null);
        setSlot(d.slot ?? null);
        setParty(d.party ?? 1);
        setMessage(d.message ?? "");
      }
    } catch {
      /* ignore */
    }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 입력값 보존: 변경 시 저장
  useEffect(() => {
    if (!restored.current) return;
    const draft: Draft = { name, phone, location, date, slot, party, message };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [name, phone, location, date, slot, party, message, storageKey]);

  const go = (delta: number) => {
    setError(null);
    setDir(delta);
    setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + delta)));
  };

  const next = () => {
    if (step === 0) {
      if (name.trim().length < 2) return setError("앗, 성함은 2자 이상 알려주셔야 해요! 🙏");
      if (!isValidPhone(phone)) return setError("연락처를 010-0000-0000 형식으로 입력해주세요 📞");
    }
    if (step === 1 && location.trim().length < 2)
      return setError("배송지를 정확히 입력해주세요 📍");
    if (step === 2 && !date) return setError("배송 희망일을 골라주세요 📅");
    if (step === 3 && !slot) return setError("시간대를 골라주세요 ⏰");
    if (step === 5) {
      // 마지막 입력 단계 → 요약으로
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
      const { data, error } = await supabase.rpc("create_delivery", {
        p_group_id: group?.id ?? null,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_location: location.trim(),
        p_date: date,
        p_time: slot,
        p_party: party,
        p_message: message.trim() || null,
      });
      if (error) {
        setSending(false);
        console.error("[delivery insert error]", error);
        const taken =
          error.code === "23505" || /date_taken|duplicate/i.test(error.message ?? "");
        if (taken) {
          setError("방금 다른 분이 먼저 신청하셨어요 😢 다른 날짜를 선택해주세요.");
          setDate(null);
          setSummary(false);
          setDir(-1);
          setStep(2);
          loadBooked();
        } else {
          setError(`주문 실패: ${error.message ?? "알 수 없는 오류"} 🛠️`);
        }
        return;
      }
      setDeliveryId(typeof data === "string" ? data : null);
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
    try {
      sessionStorage.removeItem(storageKey);
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
        partySize={party}
        deliveryId={deliveryId}
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
        party={party}
        sending={sending}
        onEdit={() => setSummary(false)}
        onConfirm={submit}
      />
    );
  }

  const content = () => {
    switch (step) {
      case 0:
        return (
          <Q title="받는 분 정보를 알려주세요 📋">
            <div className="space-y-4">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성함"
                className="dform-input"
              />
              <input
                type="tel"
                inputMode="numeric"
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
          <Q title="당일 예상 참석 인원이 몇 분이세요? 👥" sub="그룹으로 오시는 경우를 위한 인원 파악용이에요">
            <div className="flex items-center justify-center gap-6 py-3">
              <button
                type="button"
                aria-label="인원 감소"
                onClick={() => setParty((p) => Math.max(1, p - 1))}
                disabled={party <= 1}
                className="w-12 h-12 rounded-full border-2 border-delivery/25 text-delivery flex items-center justify-center disabled:opacity-30"
              >
                <Minus size={18} />
              </button>
              <span className="text-3xl font-extrabold text-neutral-800 w-16 text-center">
                {party}명
              </span>
              <button
                type="button"
                aria-label="인원 증가"
                onClick={() => setParty((p) => Math.min(PARTY_MAX, p + 1))}
                disabled={party >= PARTY_MAX}
                className="w-12 h-12 rounded-full border-2 border-delivery/25 text-delivery flex items-center justify-center disabled:opacity-30"
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="text-center text-xs text-neutral-400">최대 {PARTY_MAX}명까지 가능해요</p>
          </Q>
        );
      case 5:
        return (
          <Q title={`배송기사(${groom.name})에게 요청사항이 있으신가요? 💬`} sub="예: 신부도 같이 와주세요 (선택)">
            <textarea
              autoFocus
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="요청사항을 적어주세요"
              className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-28 text-sm"
            />
            <p className="text-right text-[11px] text-neutral-400">{message.length}/500</p>
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
              <p className="mt-4 text-sm text-delivery-dark font-medium text-center">{error}</p>
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
          {step === TOTAL - 1 ? "확인하기" : "다음"} <ArrowRight size={16} />
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
        <h2 className="text-xl font-extrabold text-neutral-800 leading-snug">{title}</h2>
        {sub && <p className="text-sm text-neutral-400">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
