"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  type TimeSlot,
  formatYmdKo,
  formatPhone,
  isValidPhone,
  slotsForDate,
  groom,
  bride,
} from "@/lib/wedding";
import { notifyAdmin } from "@/lib/notify";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import StepIndicator from "@/components/delivery/StepIndicator";
import OrderSummary from "@/components/delivery/OrderSummary";
import CompletePage from "@/components/delivery/CompletePage";

const SLOTS: { value: TimeSlot; emoji: string }[] = [
  { value: "오전", emoji: "🌅" },
  { value: "오후", emoji: "☀️" },
  { value: "저녁", emoji: "🌙" },
];

export type Rider = "신랑" | "신부" | "신랑+신부";
const RIDERS: { value: Rider; emoji: string; desc: string }[] = [
  { value: "신랑", emoji: "🤵", desc: "신랑이 갈게요" },
  { value: "신부", emoji: "👰", desc: "신부가 갈게요" },
  { value: "신랑+신부", emoji: "💑", desc: "둘이 같이 갈게요" },
];

/** 0 받는분(이름+연락처) · 1 배송지 · 2 날짜 · 3 시간 · 4 배송기사 · 5 요청 → 요약 → 완료 */
const TOTAL = 6;
const DRAFT_KEY = "delivery-form-draft";

interface Draft {
  name: string;
  phone: string;
  location: string;
  date: string | null;
  slot: TimeSlot | null;
  rider: Rider | null;
  message: string;
}

/** get_orders_on_date RPC — 같은 날 기존 주문 (이름은 서버에서 마스킹) */
interface DateOrder {
  id: string;
  time_slot: TimeSlot;
  member_count: number;
  owner_masked: string | null;
}

export default function DeliveryForm({
  group = null,
  groupSlug = null,
  convertId = null,
  onSubmitted,
}: {
  group?: { id: string; name: string } | null;
  /** 그룹 페이지에서 진입 시 — 완료 화면 공유 링크를 그룹 링크로 */
  groupSlug?: string | null;
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
  const [rider, setRider] = useState<Rider | null>(null);
  const [message, setMessage] = useState("");

  const [booked, setBooked] = useState<Set<string>>(new Set());
  const phoneRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [orderNo, setOrderNo] = useState("001");
  const [participantId, setParticipantId] = useState<string | null>(null);

  // 합석 제안 — 같은 날 기존 주문이 있을 때
  const [joinOffer, setJoinOffer] = useState<DateOrder[] | null>(null);
  const [joinedInfo, setJoinedInfo] = useState<{
    slot: TimeSlot;
    count: number;
  } | null>(null);

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
        setRider(d.rider ?? null);
        setMessage(d.message ?? "");
      }
    } catch {
      /* ignore */
    }
    loadBooked();
  }, []);

  useEffect(() => {
    if (done) return;
    const d: Draft = { name, phone, location, date, slot, rider, message };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [name, phone, location, date, slot, rider, message, done]);

  const go = (delta: number) => {
    setError(null);
    setDir(delta);
    setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + delta)));
  };

  const next = async () => {
    if (step === 0) {
      if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
      if (!isValidPhone(phone))
        return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    }
    if (step === 1 && location.trim().length < 2)
      return setError("배송지를 입력해주세요 📍");
    if (step === 2) {
      if (!date) return setError("배송 희망일을 골라주세요 📅");
      // 같은 날 먼저 신청한 주문이 있으면 합석 제안 (본인 주문·정원 초과 주문 제외)
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.rpc("get_orders_on_date", {
          p_date: date,
          p_phone: phone.trim(),
        });
        const orders = Array.isArray(data) ? (data as DateOrder[]) : [];
        if (orders.length > 0) {
          setError(null);
          setJoinOffer(orders);
          return;
        }
      }
    }
    if (step === 3 && !slot) return setError("시간대를 골라주세요 ⏰");
    if (step === 4 && !rider) return setError("배송기사를 선택해주세요 🛵");
    if (step === TOTAL - 1) {
      setError(null);
      setSummary(true);
      return;
    }
    go(1);
  };

  /** 합석 수락 — 기존 주문에 바로 합류 */
  const acceptJoin = async (order: DateOrder) => {
    setSending(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("join_delivery", {
        p_delivery: order.id,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_convert: convertId,
      });
      setSending(false);
      if (error) return setError("합석 처리에 실패했어요. 다시 시도해주세요 🛠️");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.result === "dup")
        return setError("이미 이 주문에 함께하고 계세요 😊");
      if (row?.result === "full") {
        setJoinOffer(null);
        return setError("이 주문은 정원(10명)이 다 찼어요 😢 새로 신청해주세요");
      }
      if (row?.result === "closed") {
        setJoinOffer(null);
        return setError("방금 그 주문이 마감됐어요 😢 새로 신청해주세요");
      }
      setParticipantId((row?.participant_id as string) ?? null);
      notifyAdmin(row?.participant_id as string);
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setSending(false);
    }
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setJoinedInfo({ slot: order.time_slot, count: order.member_count + 1 });
    onSubmitted?.();
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
        p_rider: rider ?? "신랑",
      });
      if (error) {
        setSending(false);
        setSummary(false);
        if (error.code === "23505" || error.message.includes("date_taken")) {
          setError("앗, 이 날짜는 마감됐어요 😢 다른 날짜를 골라주세요");
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
      if (row?.participant_id) {
        setParticipantId(row.participant_id as string);
        notifyAdmin(row.participant_id as string);
      }
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

  // 합석 완료
  if (joinedInfo && date) {
    return (
      <CompletePage
        name={name}
        date={date}
        slot={joinedInfo.slot}
        orderNo="합석"
        memberCount={joinedInfo.count}
        participantId={participantId}
        joined
        groupSlug={groupSlug}
      />
    );
  }

  if (done && date && slot) {
    return (
      <CompletePage
        name={name}
        date={date}
        slot={slot}
        location={location}
        rider={rider}
        orderNo={orderNo}
        memberCount={1}
        participantId={participantId}
        groupSlug={groupSlug}
      />
    );
  }

  // 합석 제안 — 같은 날 먼저 신청한 분이 있을 때
  if (joinOffer && date) {
    return (
      <div className="max-w-md mx-auto px-5 pt-6 pb-10 space-y-5">
        <div className="text-center space-y-2">
          <div className="text-4xl">🤝</div>
          <h2 className="text-xl font-extrabold text-neutral-800 leading-snug">
            {formatYmdKo(date)}에
            <br />
            먼저 신청하신 분이 있어요!
          </h2>
          <p className="text-sm text-neutral-400">
            같은 자리에서 함께 받으시면 좋아요. 합석하시겠어요?
          </p>
        </div>

        <div className="space-y-3">
          {joinOffer.map((o) => (
            <div
              key={o.id}
              className="bg-white rounded-2xl border border-delivery/10 p-4 space-y-2.5"
            >
              <p className="text-sm font-bold text-neutral-700">
                🛵 {o.owner_masked ?? "먼저 신청하신 분"}님
                {o.member_count > 1 ? ` 외 ${o.member_count - 1}명` : ""} ·{" "}
                {o.time_slot}
              </p>
              <button
                type="button"
                onClick={() => acceptJoin(o)}
                disabled={sending}
                className="w-full py-3 rounded-full bg-delivery text-white text-sm font-extrabold active:scale-95 transition-transform disabled:opacity-60"
              >
                {sending ? "합석 중… 🛵" : "네, 합석할게요 🤝"}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-delivery-dark font-medium text-center">{error}</p>
        )}

        <button
          type="button"
          onClick={() => {
            setJoinOffer(null);
            setError(null);
            go(1); // 따로 받기 → 시간대 선택으로 진행
          }}
          className="w-full py-3.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold"
        >
          아니요, 따로 받을게요
        </button>
        <button
          type="button"
          onClick={() => {
            setJoinOffer(null);
            setError(null);
          }}
          className="w-full text-xs text-neutral-400 underline underline-offset-2"
        >
          ← 날짜 다시 고르기
        </button>
      </div>
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
        rider={rider}
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    phoneRef.current?.focus(); // 완료 → 연락처로 이동
                  }
                }}
                enterKeyHint="next"
                placeholder="성함"
                className="dform-input"
              />
              <input
                ref={phoneRef}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && next()}
                enterKeyHint="done"
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
              enterKeyHint="done"
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
              onSelect={(d) => {
                setDate(d);
                // 평일은 저녁만 가능 — 이미 고른 시간대가 안 맞으면 초기화
                if (slot && !slotsForDate(d).includes(slot)) setSlot(null);
              }}
              selectedClass="bg-delivery text-white font-bold"
            />
            {date && (
              <p className="text-sm text-delivery font-bold text-center pt-2">
                {formatYmdKo(date)} 선택! 👍
              </p>
            )}
          </Q>
        );
      case 3: {
        const avail = date ? slotsForDate(date) : [];
        const visible = SLOTS.filter((s) => avail.includes(s.value));
        return (
          <Q
            title={`${date ? formatYmdKo(date) : ""} 배송 희망 시간대를 골라주세요 ⏰`}
            sub={visible.length === 1 ? "평일은 저녁 배달만 가능해요 🌙" : undefined}
          >
            <div
              className={`grid gap-3 ${
                visible.length === 1 ? "grid-cols-1" : "grid-cols-3"
              }`}
            >
              {visible.map((s) => (
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
      }
      case 4:
        return (
          <Q
            title="배송기사를 선택해주세요 🛵"
            sub="기사님 일정에 따라 조정될 수 있어요 😊"
          >
            <div className="grid grid-cols-3 gap-3">
              {RIDERS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRider(r.value)}
                  aria-pressed={rider === r.value}
                  className={`py-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                    rider === r.value
                      ? "border-delivery bg-delivery text-white scale-105"
                      : "border-delivery/20 bg-white text-neutral-500"
                  }`}
                >
                  <span className="text-3xl">{r.emoji}</span>
                  <span className="text-sm font-bold">{r.value}</span>
                  <span
                    className={`text-[11px] ${
                      rider === r.value ? "text-white/80" : "text-neutral-400"
                    }`}
                  >
                    {r.desc}
                  </span>
                </button>
              ))}
            </div>
          </Q>
        );
      case 5:
        return (
          <Q
            title={`배송기사(${
              rider === "신랑+신부"
                ? "신랑·신부"
                : rider === "신부"
                ? bride.name
                : groom.name
            })에게 요청사항이 있으신가요? 💬`}
            sub="예: 저녁 7시 이후에 와주세요 (선택)"
          >
            <textarea
              autoFocus
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="요청사항을 적어주세요"
              className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-28 text-base"
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

      {/* 하단 고정 내비게이션 — 긴 스텝(달력 등)에서도 스크롤 없이 다음 버튼 접근 */}
      <div className="sticky bottom-0 z-10 flex gap-3 mt-8 -mx-5 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] bg-delivery-bg/95 backdrop-blur-sm">
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
