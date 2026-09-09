"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { type TimeSlot, isValidPhone, slotsForDate } from "@/lib/wedding";
import type { InvitePrefill } from "@/lib/invite";
import { notifyAdmin } from "@/lib/notify";
import StepIndicator from "@/components/delivery/StepIndicator";
import OrderSummary from "@/components/delivery/OrderSummary";
import CompletePage from "@/components/delivery/CompletePage";
import { TOTAL, type DateOrder } from "@/components/delivery/form/types";
import { useDeliveryDraft } from "@/components/delivery/form/useDeliveryDraft";
import StepContact from "@/components/delivery/form/StepContact";
import StepLocation from "@/components/delivery/form/StepLocation";
import StepDate from "@/components/delivery/form/StepDate";
import StepSlot from "@/components/delivery/form/StepSlot";
import StepRider from "@/components/delivery/form/StepRider";
import StepMessage from "@/components/delivery/form/StepMessage";
import JoinOfferView from "@/components/delivery/form/JoinOfferView";

export type { Rider } from "@/components/delivery/form/types";

export default function DeliveryForm({
  group = null,
  groupSlug = null,
  convertId = null,
  invite = null,
  inviteToken = null,
  nameDefault = null,
  onSubmitted,
}: {
  group?: { id: string; name: string } | null;
  /** 그룹 페이지에서 진입 시 — 완료 화면 공유 링크를 그룹 링크로 */
  groupSlug?: string | null;
  /** 마음배송 → 직접배달 전환 시 기존 참여자 id */
  convertId?: string | null;
  /** 개인 초대 링크 프리필 (이름 + 마스킹 번호) */
  invite?: InvitePrefill | null;
  /** 개인 초대 토큰 — 제출 시 서버가 실제 연락처를 채움 */
  inviteToken?: string | null;
  /**
   * 그룹 페이지에서 명단으로 고른 이름 — 초대와 달리 **신원 확인이 아니다.**
   * 이름 기본값으로만 쓰고 연락처는 건드리지 않는다.
   */
  nameDefault?: string | null;
  onSubmitted?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [summary, setSummary] = useState(false);

  const [name, setName] = useState(invite?.name ?? nameDefault ?? "");
  const [phone, setPhone] = useState("");
  /** 초대 링크의 (마스킹된) 연락처를 그대로 쓰는 중 — 서버가 토큰으로 실제 번호를 채움 */
  const [useInvitePhone, setUseInvitePhone] = useState(Boolean(invite?.phoneMasked && inviteToken));
  const [location, setLocation] = useState("");

  const [booked, setBooked] = useState<Set<string>>(new Set());
  const phoneRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [orderNo, setOrderNo] = useState("001");
  /** 완료 화면 관리 링크용 토큰 (생성 RPC 가 1회 반환) */
  const [manageToken, setManageToken] = useState<string | null>(null);

  // 입력값 보존 — 새로고침/이탈 후 재진입 시 이어서 (날짜·시간·기사·메시지)
  const {
    date,
    setDate,
    slot,
    setSlot,
    rider,
    setRider,
    message,
    setMessage,
    clearDraft,
  } = useDeliveryDraft(done);

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState 는 RPC await 이후 (비동기)
    loadBooked();
  }, []);

  const go = (delta: number) => {
    setError(null);
    setDir(delta);
    setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + delta)));
  };

  /** 합석 제안 조회(RPC) 진행 중 — 다음 버튼 연타 방지 */
  const [checking, setChecking] = useState(false);

  const next = async () => {
    if (checking) return;
    if (step === 0) {
      if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
      if (!useInvitePhone && !isValidPhone(phone))
        return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    }
    if (step === 1 && location.trim().length < 2)
      return setError("배송지를 입력해주세요 📍");
    if (step === 2) {
      if (!date) return setError("배송 희망일을 골라주세요 📅");
      // 같은 날 먼저 신청한 주문이 있으면 합석 제안 (본인 주문·정원 초과 주문 제외)
      if (isSupabaseConfigured && supabase) {
        setChecking(true);
        try {
          const { data } = await supabase.rpc("get_orders_on_date", {
            p_date: date,
            p_phone: useInvitePhone ? "" : phone.trim(),
          });
          const orders = Array.isArray(data) ? (data as DateOrder[]) : [];
          if (orders.length > 0) {
            setError(null);
            setJoinOffer(orders);
            return;
          }
        } finally {
          setChecking(false);
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
    if (isSupabaseConfigured) {
      // P1-1: 서버 API 경유 (검증·rate limit·초대 그룹 결속은 서버가 강제)
      const res = await fetch("/api/delivery/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId: order.id,
          name: name.trim(),
          // 신원(토큰)과 연락처를 분리 — 번호를 바꿔도 명단 연결은 유지된다
          phone: useInvitePhone ? null : phone.trim(),
          convertToken: convertId,
          inviteToken,
        }),
      }).catch(() => null);
      setSending(false);
      const row = res ? await res.json().catch(() => null) : null;
      if (!res?.ok)
        return setError(
          res?.status === 429
            ? "요청이 많아요. 잠시 후 다시 시도해주세요 🙏"
            : "합석 처리에 실패했어요. 다시 시도해주세요 🛠️"
        );
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
      setManageToken((row?.manage_token as string) ?? null);
      notifyAdmin();
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setSending(false);
    }
    clearDraft();
    setJoinedInfo({ slot: order.time_slot, count: order.member_count + 1 });
    onSubmitted?.();
  };

  const submit = async () => {
    setError(null);
    if (!date || !slot) return;
    setSending(true);
    setOrderNo(String(booked.size + 1).padStart(3, "0"));

    if (isSupabaseConfigured) {
      // P1-1: 서버 API 경유 (검증·rate limit·초대 그룹 결속은 서버가 강제)
      const res = await fetch("/api/delivery/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 종류(그룹/개인)는 서버가 판정한다 — 폼은 어느 페이지에서 왔는지만 알린다
          groupSlug,
          name: name.trim(),
          // 신원(토큰)과 연락처를 분리 — "다른 번호 쓰기"를 눌러도 명단 연결은 유지된다
          phone: useInvitePhone ? null : phone.trim(),
          location: location.trim(),
          date,
          time: slot,
          message: message.trim() || null,
          convertToken: convertId,
          rider: rider ?? "신랑",
          inviteToken,
        }),
      }).catch(() => null);
      const row = res ? await res.json().catch(() => null) : null;
      if (!res?.ok) {
        setSending(false);
        setSummary(false);
        if (row?.error === "date_taken") {
          setError("앗, 이 날짜는 마감됐어요 😢 다른 날짜를 골라주세요");
          setDate(null);
          setDir(-1);
          setStep(2);
          loadBooked();
        } else if (res?.status === 429) {
          setError("요청이 많아요. 잠시 후 다시 시도해주세요 🙏");
        } else {
          setError("주문에 실패했어요. 잠시 후 다시 시도해주세요 🛠️");
        }
        return;
      }
      if (row?.participant_id) {
        setManageToken((row.manage_token as string) ?? null);
        notifyAdmin();
      }
    } else {
      // 데모(Supabase 미설정) 경로. 번호는 찍지 않는다 — 브라우저 콘솔도 로그다.
      console.info("[delivery demo]", { group, name, location, date, slot, hasMessage: Boolean(message) });
      await new Promise((r) => setTimeout(r, 500));
    }
    clearDraft();
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
        manageToken={manageToken}
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
        manageToken={manageToken}
        groupSlug={groupSlug}
      />
    );
  }

  // 합석 제안 — 같은 날 먼저 신청한 분이 있을 때
  if (joinOffer && date) {
    return (
      <JoinOfferView
        date={date}
        orders={joinOffer}
        sending={sending}
        error={error}
        onAccept={acceptJoin}
        onDecline={() => {
          setJoinOffer(null);
          setError(null);
          go(1); // 따로 받기 → 시간대 선택으로 진행
        }}
        onBack={() => {
          setJoinOffer(null);
          setError(null);
        }}
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
          <StepContact
            name={name}
            phone={phone}
            phoneRef={phoneRef}
            onNameChange={setName}
            onPhoneChange={setPhone}
            phoneMasked={useInvitePhone ? invite?.phoneMasked ?? null : null}
            // 인사(확인) 화면은 **확인할 게 다 있을 때만** 띄운다:
            //  - 초대 연락처를 쓰는 중이고 (명단에 번호가 없으면 물어보는 게 맞다)
            //  - 이름을 아직 안 고쳤을 때 (고치기 시작하면 확인 카드가 어색하다)
            inviteName={useInvitePhone && invite?.name === name ? invite.name : null}
            groupSlug={groupSlug}
            onUseOtherPhone={() => setUseInvitePhone(false)}
            onNext={next}
          />
        );
      case 1:
        return (
          <StepLocation
            location={location}
            onLocationChange={setLocation}
            onNext={next}
          />
        );
      case 2:
        return (
          <StepDate
            date={date}
            booked={booked}
            onSelect={(d) => {
              setDate(d);
              // 요일별 가능 시간대가 다름 — 이미 고른 시간대가 안 맞으면 초기화
              if (slot && !slotsForDate(d).includes(slot)) setSlot(null);
            }}
          />
        );
      case 3:
        return <StepSlot date={date} slot={slot} onSelect={setSlot} />;
      case 4:
        return <StepRider rider={rider} onSelect={setRider} />;
      case 5:
        return (
          <StepMessage
            rider={rider}
            message={message}
            onMessageChange={setMessage}
          />
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
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 고정 내비게이션 — 긴 스텝(달력 등)에서도 스크롤 없이 다음 버튼 접근.
          validation 에러도 여기(버튼 바로 위)에 표시해 항상 보이게 */}
      <div className="sticky bottom-0 z-10 mt-8 -mx-5 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] bg-delivery-bg/95 backdrop-blur-sm">
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-2.5 text-sm text-delivery-dark font-medium text-center"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="flex gap-3">
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
          disabled={checking}
          className="flex-1 flex items-center justify-center gap-1 py-4 rounded-full bg-delivery text-white text-sm font-bold shadow-sm active:scale-95 transition-transform disabled:opacity-60"
        >
          {checking ? (
            "확인 중…"
          ) : step < TOTAL - 1 ? (
            <>
              다음 <ArrowRight size={16} />
            </>
          ) : (
            "주문 확인하기 🧾"
          )}
        </button>
        </div>
      </div>
    </div>
  );
}
