"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { type TimeSlot, formatYmdKo } from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";

const SLOTS: { value: TimeSlot; emoji: string }[] = [
  { value: "오전", emoji: "🌅" },
  { value: "오후", emoji: "☀️" },
  { value: "저녁", emoji: "🌙" },
];

const TOTAL = 6; // 입력 스텝 수

export default function ReceiveTab() {
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
    // 스텝별 검증
    if (step === 0 && !name.trim()) return setError("성함을 입력해 주세요.");
    if (step === 1 && !phone.trim()) return setError("연락처를 입력해 주세요.");
    if (step === 2 && !location.trim()) return setError("만날 장소를 입력해 주세요.");
    if (step === 3 && !date) return setError("날짜를 선택해 주세요.");
    if (step === 4 && !slot) return setError("시간대를 선택해 주세요.");
    go(1);
  };

  const submit = async () => {
    setError(null);
    if (!date || !slot) return;
    setSending(true);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("deliveries").insert({
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
          setError("이미 신청된 날짜예요. 다른 날짜를 골라주세요.");
          setDate(null);
          setDir(-1);
          setStep(3);
          loadBooked();
        } else {
          setError("신청에 실패했어요. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
    } else {
      console.info("[delivery demo]", { name, phone, location, date, slot, message });
      await new Promise((r) => setTimeout(r, 400));
    }
    setSending(false);
    setDone(true);
  };

  /* ----------------------------- 완료 화면 ----------------------------- */
  if (done) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-wedding-cream">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-5"
        >
          <div className="text-5xl">🎉</div>
          <h2 className="font-serif text-xl text-sage-700 tracking-wide">
            주문 완료!
          </h2>
          <p className="text-sm text-neutral-600 leading-relaxed font-sans">
            {name}님, 신청해주셔서 감사해요.
            <br />
            <span className="text-sage-700 font-medium">
              {date && formatYmdKo(date)} {slot}
            </span>
            에<br />
            <span className="text-sage-700 font-medium">{location}</span> 로 찾아갈게요 🛵
          </p>
          <p className="text-xs text-neutral-400">곧 연락드릴게요!</p>
        </motion.div>
      </div>
    );
  }

  /* ----------------------------- 스텝 화면 ----------------------------- */
  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <Bubble title="안녕하세요! 👋" subtitle="성함이 어떻게 되세요?">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder="성함"
              className="step-input"
            />
          </Bubble>
        );
      case 1:
        return (
          <Bubble
            title={`반가워요, ${name || "하객"}님! 😊`}
            subtitle="연락처를 알려주세요"
            hint="확정되면 이 번호로 연락드릴게요"
          >
            <input
              autoFocus
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder="010-0000-0000"
              className="step-input"
            />
          </Bubble>
        );
      case 2:
        return (
          <Bubble
            title="어디로 찾아갈까요? 🛵"
            subtitle="편하신 곳 어디든 갑니다!"
            hint="예: 강남역 2번 출구, 회사 앞 등"
          >
            <input
              autoFocus
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder="만날 장소"
              className="step-input"
            />
          </Bubble>
        );
      case 3:
        return (
          <Bubble title="언제가 좋으세요? 📅">
            <DeliveryCalendar selected={date} booked={booked} onSelect={setDate} />
            {date && (
              <p className="text-xs text-sage-700 text-center pt-2">
                선택: <span className="font-medium">{formatYmdKo(date)}</span>
              </p>
            )}
          </Bubble>
        );
      case 4:
        return (
          <Bubble
            title={`${date ? formatYmdKo(date) : ""}, 몇 시쯤 괜찮으세요?`}
          >
            <div className="grid grid-cols-3 gap-3">
              {SLOTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSlot(s.value)}
                  aria-pressed={slot === s.value}
                  className={`py-5 border flex flex-col items-center gap-2 transition-all ${
                    slot === s.value
                      ? "border-sage-600 bg-sage-600 text-white"
                      : "border-wedding-gold/25 text-neutral-500 bg-white"
                  }`}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="text-xs tracking-wide">{s.value}</span>
                </button>
              ))}
            </div>
          </Bubble>
        );
      case 5:
        return (
          <Bubble
            title="마지막으로 전하실 말씀이 있으신가요? 💬"
            hint="선택사항이에요"
          >
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="편한 시간대나 참고하실 내용을 적어주세요"
              className="w-full p-3 border border-wedding-gold/20 bg-white focus:outline-none focus:border-wedding-gold resize-none h-24 text-sm tracking-wide placeholder:text-neutral-300 rounded-none font-sans"
            />
          </Bubble>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-wedding-cream">
      {/* 진행률 도트 */}
      <div className="flex justify-center gap-2 pt-8 pb-2">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === step
                ? "w-6 bg-sage-600"
                : i < step
                ? "w-2 bg-sage-400"
                : "w-2 bg-sage-200"
            }`}
          />
        ))}
      </div>

      {/* 스텝 본문 */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence custom={dir} mode="wait" initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir > 0 ? 40 : -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir > 0 ? -40 : 40 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto hide-scrollbar px-7 flex flex-col justify-center"
          >
            {stepContent()}
            {error && (
              <p className="text-xs text-red-500 text-center mt-4">{error}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 네비게이션 */}
      <div className="flex gap-3 px-7 pb-8 pt-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="flex items-center justify-center gap-1 px-5 py-3.5 border border-wedding-gold/25 text-neutral-500 text-xs tracking-wider"
          >
            <ArrowLeft size={14} /> 이전
          </button>
        )}
        {step < TOTAL - 1 ? (
          <button
            type="button"
            onClick={next}
            className="flex-1 flex items-center justify-center gap-1 py-3.5 bg-sage-700 text-white text-xs tracking-[0.2em]"
          >
            다음 <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="flex-1 py-3.5 bg-sage-700 text-white text-xs tracking-[0.2em] disabled:opacity-60"
          >
            {sending ? "신청 중…" : "주문하기 🛵"}
          </button>
        )}
      </div>
    </div>
  );
}

/* 말풍선형 스텝 헤더 + 입력 래퍼 */
function Bubble({
  title,
  subtitle,
  hint,
  children,
}: {
  title: string;
  subtitle?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 max-w-sm mx-auto w-full">
      <div className="space-y-1.5">
        <h2 className="font-serif text-xl text-sage-700 leading-snug">{title}</h2>
        {subtitle && (
          <p className="text-sm text-neutral-500 font-sans">{subtitle}</p>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-neutral-400 font-sans">{hint}</p>}
    </div>
  );
}
