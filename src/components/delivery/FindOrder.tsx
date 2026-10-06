"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import { invitationHref } from "@/lib/inviteAccess";

const EMPTY_SET = new Set<string>();

/**
 * 내 신청 찾기 — 이름 + 연락처 끝 4자리 + 신청(배송)일자(달력 선택).
 *
 * 예전에는 이 셋이 맞으면 관리 링크를 **그 자리에서** 받았다. 하지만 그 셋은
 * 청첩장을 받은 사람이면 대개 아는 정보라 본인 인증이 못 된다 — 남의 주문을
 * 취소·변경할 수 있었다. 지금은 신청할 때 남긴 번호로 복구 링크를 문자로 보낸다.
 * 입력하는 것은 그대로다.
 *
 * 응답은 일치 여부와 무관하게 같다 (누가 신청했는지 떠보는 것을 막기 위해).
 */
export default function FindOrder({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const last4Ref = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 잠금 화면에서 '내 신청 찾기'로 들어온 경우(?find=1) 폼까지 스크롤
  useEffect(() => {
    if (defaultOpen) boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [defaultOpen]);

  const search = async () => {
    if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
    if (!/^\d{4}$/.test(last4))
      return setError("연락처 끝 4자리를 입력해주세요 📞");
    if (!date) return setError("신청하신 배송 날짜를 달력에서 골라주세요 📅");
    setError(null);
    setBusy(true);

    if (!isSupabaseConfigured) {
      setBusy(false);
      setSentMsg("데모 모드예요 — 실제 문자는 보내지 않아요.");
      return;
    }
    try {
      const res = await fetch("/api/delivery/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), last4, date }),
      });
      setBusy(false);
      if (res.status === 429)
        return setError("조회 시도가 너무 많아요. 잠시 후 다시 시도해주세요 🙏");
      if (!res.ok) return setError("조회 중 문제가 생겼어요. 다시 시도해주세요 🛠️");
      const j = (await res.json()) as { message?: string };
      // 서버는 일치 여부와 무관하게 같은 응답을 준다 — 화면도 그대로 보여준다
      setSentMsg(
        j.message ??
          "일치하는 신청이 있으면 신청할 때 남기신 번호로 관리 링크를 보내드렸어요 📩"
      );
    } catch {
      setBusy(false);
      setError("조회 중 문제가 생겼어요. 다시 시도해주세요 🛠️");
    }
  };

  if (!open) {
    return (
      <div className="text-center py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-neutral-500 underline underline-offset-2"
        >
          이미 신청하셨나요? 내 신청 찾기 🔍
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="max-w-sm mx-auto px-6 py-4">
      <div className="bg-white rounded-2xl border border-delivery/10 p-5 space-y-3">
        <p className="text-center text-sm font-bold text-neutral-700">
          내 신청 찾기 🔍
        </p>
        <p className="text-center text-[11px] text-neutral-500">
          신청할 때 남기신 번호로 관리 링크를 문자로 보내드려요
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              last4Ref.current?.focus();
            }
          }}
          enterKeyHint="next"
          autoComplete="name"
          placeholder="성함"
          aria-label="성함"
          className="dform-input"
        />
        <input
          ref={last4Ref}
          inputMode="numeric"
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => e.key === "Enter" && search()}
          enterKeyHint="done"
          placeholder="연락처 끝 4자리"
          aria-label="연락처 끝 4자리"
          className="dform-input"
        />

        <div className="space-y-1.5">
          <p className="text-xs font-bold text-neutral-500">
            신청하신 배송 날짜 📅
          </p>
          <DeliveryCalendar
            selected={date}
            booked={EMPTY_SET}
            onSelect={setDate}
            selectedClass="bg-delivery text-white font-bold"
            allowPast
          />
          {date && (
            <p className="text-xs text-delivery font-bold text-center">
              {formatYmdKo(date)} 선택
            </p>
          )}
        </div>

        {error && <p className="text-xs text-delivery-dark text-center">{error}</p>}

        {sentMsg && (
          <div className="bg-delivery/5 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs text-neutral-700 leading-relaxed">{sentMsg}</p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              링크는 30분간, 한 번만 쓸 수 있어요.
            </p>
            {/*
              연락처 없는 신청(관리자가 전화·카톡으로 대신 접수한 건, 마음배송)은
              문자로 받을 수 없다. 일치 여부와 무관하게 **항상** 보여줘야 이 문구
              자체가 존재 여부를 알려주는 신호가 되지 않는다.
            */}
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              연락처를 남기지 않은 신청은 문자로 받을 수 없어요. 그럴 땐 신랑·신부에게
              직접 말씀해주세요 🙏
            </p>
          </div>
        )}

        <Link
          href={invitationHref}
          className="block text-center text-xs text-delivery font-bold underline underline-offset-2"
        >
          💌 모바일 청첩장 바로 보기
        </Link>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
              setSentMsg(null);
            }}
            className="px-4 py-2.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-xs font-bold"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={search}
            disabled={busy}
            className="flex-1 py-2.5 rounded-full bg-delivery text-white text-xs font-extrabold disabled:opacity-60"
          >
            {busy ? "찾는 중…" : "찾기 🔍"}
          </button>
        </div>
      </div>
    </div>
  );
}
