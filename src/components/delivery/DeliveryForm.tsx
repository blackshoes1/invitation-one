"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { type TimeSlot, formatYmdKo, groom } from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import StepIndicator from "@/components/delivery/StepIndicator";
import CompletePage from "@/components/delivery/CompletePage";

const SLOTS: { value: TimeSlot; emoji: string }[] = [
  { value: "오전", emoji: "🌅" },
  { value: "오후", emoji: "☀️" },
  { value: "저녁", emoji: "🌙" },
];

const TOTAL = 6;

export default function DeliveryForm({
  group = null,
  onSubmitted,
}: {
  group?: { id: string; name: string } | null;
  onSubmitted?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

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

  const loadBooked = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data } = await supabase.rpc("get_booked_dates");
    if (Array.isArray(data)) {
      setBooked(new Set(data.map((d: string) => String(d).slice(0, 10))));
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBooked();
  }, []);

  const go = (delta: number) => {
    setError(null);
    setDir(delta);
    setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + delta)));
  };

  const next = () => {
    if (step === 0 && !name.trim()) return setError("성함을 입력해주세요 🙏");
    if (step === 1 && !phone.trim()) return setError("연락처를 입력해주세요 📞");
    if (step === 2 && !location.trim()) return setError("배송지를 입력해주세요 📍");
    if (step === 3 && !date) return setError("배송 희망일을 골라주세요 📅");
    if (step === 4 && !slot) return setError("시간대를 골라주세요 ⏰");
    go(1);
  };

  const submit = async () => {
    setError(null);
    if (!date || !slot) return;
    setSending(true);
    setOrderNo(String(booked.size + 1).padStart(3, "0"));

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("deliveries").insert({
        group_id: group?.id ?? null,
        name: name.trim(),
        phone: phone.trim(),
        location: location.trim(),
        date,
        time_slot: slot,
        message: message.trim() || null,
      });
      if (error) {
        setSending(false);
        if (error.code === "23505") {
          setError("앗, 이 날짜는 이미 마감됐어요! 다른 날짜를 골라주세요 🙏");
          setDate(null);
          setDir(-1);
          setStep(3);
          loadBooked();
        } else {
          setError("주문에 실패했어요. 잠시 후 다시 시도해주세요 🛠️");
        }
        return;
      }
    } else {
      console.info("[delivery demo]", { group, name, phone, location, date, slot, message });
      await new Promise((r) => setTimeout(r, 500));
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
        orderNo={orderNo} partySize={0} deliveryId={null}      />
    );
  }

  const content = () => {
    switch (step) {
      case 0:
        return (
          <Q title="주문하시는 분의 이름을 알려주세요 📋">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder="성함"
              className="dform-input"
            />
          </Q>
        );
      case 1:
        return (
          <Q title="배송 완료 후 연락드릴 번호요! 📞">
            <input
              autoFocus
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder="010-0000-0000"
              className="dform-input"
            />
          </Q>
        );
      case 2:
        return (
          <Q title="배송지를 입력해주세요 📍" sub="전국 어디든 직접 배달합니다 🛵">
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
      case 3:
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
      case 4:
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
      case 5:
        return (
          <Q
            title={`배송기사(${groom.name})에게 요청사항이 있으신가요? 💬`}
            sub="예: 신부도 같이 와주세요 (선택)"
          >
            <textarea
              autoFocus
              value={message}
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
        {step < TOTAL - 1 ? (
          <button
            type="button"
            onClick={next}
            className="flex-1 flex items-center justify-center gap-1 py-4 rounded-full bg-delivery text-white text-sm font-bold shadow-sm active:scale-95 transition-transform"
          >
            다음 <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="flex-1 py-4 rounded-full bg-delivery text-white text-sm font-bold shadow-sm active:scale-95 transition-transform disabled:opacity-60"
          >
            {sending ? "주문 접수 중… 🛵" : "주문하기 🛵"}
          </button>
        )}
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
