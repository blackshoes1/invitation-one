"use client";

import { useRef, useState } from "react";
import type { InvitePrefill } from "@/lib/invite";
import InvitePhoneBox from "@/components/delivery/InvitePhoneBox";
import { motion } from "framer-motion";
import { isSupabaseConfigured, type Group } from "@/lib/supabase";
import { formatYmdKo, formatPhone, isValidPhone, groom } from "@/lib/wedding";
import { notifyAdmin } from "@/lib/notify";
import CompletePage from "@/components/delivery/CompletePage";

/**
 * 관리자 제안 일정 (v14)
 * - OfferCard: 그룹 페이지 상단 제안 배너 — 탭하면 승낙 폼으로
 * - AcceptOfferForm: 이름+연락처만 입력하면 끝 (첫 승낙 = 주문 생성+대표, 이후 = 합류)
 */

export function OfferCard({
  group,
  memberCount,
  onAccept,
}: {
  group: Group;
  /** 제안 주문이 이미 생성된 경우 현재 참여 인원 (없으면 null) */
  memberCount: number | null;
  onAccept: () => void;
}) {
  if (!group.offer_date || !group.offer_time) return null;
  return (
    <motion.button
      type="button"
      onClick={onAccept}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full text-left bg-delivery/5 border-2 border-delivery rounded-2xl p-4 space-y-1.5 active:scale-[0.99] transition-transform"
    >
      <p className="text-[11px] font-bold text-delivery">
        🎁 {groom.name}(신랑)의 일정 제안
      </p>
      <p className="text-lg font-extrabold text-neutral-800">
        {formatYmdKo(group.offer_date)} {group.offer_time}
        {group.offer_location ? (
          <span className="text-sm font-bold text-neutral-500">
            {" "}
            · {group.offer_location}
          </span>
        ) : null}
      </p>
      <p className="text-xs text-neutral-500">
        {memberCount != null && memberCount > 0
          ? `현재 ${memberCount}명 참여 중 — 이름·연락처만 남기면 함께 받아요`
          : "이름·연락처만 남기면 이 날 청첩장을 받아요"}
      </p>
      <p className="text-sm font-extrabold text-delivery pt-1">
        좋아요, 이 날 받을게요 🛵 →
      </p>
    </motion.button>
  );
}

export function AcceptOfferForm({
  group,
  slug,
  convertId = null,
  invite = null,
  inviteToken = null,
  onBack,
  onJoined,
}: {
  group: Group;
  slug: string;
  /** 마음배송 → 직접배달 전환 시 기존 참여자 id */
  convertId?: string | null;
  /** 개인 초대 링크 프리필 (이름 + 마스킹 번호) */
  invite?: InvitePrefill | null;
  /** 개인 초대 토큰 — 제출 시 서버가 실제 연락처를 채움 */
  inviteToken?: string | null;
  onBack: () => void;
  onJoined?: () => void;
}) {
  const [name, setName] = useState(invite?.name ?? "");
  const [phone, setPhone] = useState("");
  const [useInvitePhone, setUseInvitePhone] = useState(Boolean(invite?.phoneMasked && inviteToken));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [manageToken, setManageToken] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(1);
  const phoneRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (name.trim().length < 2) return setError("성함을 입력해주세요 🙏");
    if (!useInvitePhone && !isValidPhone(phone))
      return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    setError(null);
    setSending(true);

    if (isSupabaseConfigured) {
      // P1-1: 서버 API 경유 (검증·rate limit·초대 그룹 결속은 서버가 강제)
      const res = await fetch("/api/delivery/group/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
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
            : "신청에 실패했어요. 잠시 후 다시 시도해주세요 🛠️"
        );
      if (row?.result === "dup")
        return setError("이미 이 일정에 함께하고 계세요 😊");
      if (row?.result === "full")
        return setError("이 일정은 정원(10명)이 다 찼어요 😢 다른 날짜를 제안해주세요");
      if (row?.result === "blocked" || row?.result === "closed")
        return setError("아쉽게도 이 일정은 마감됐어요 😢 다른 날짜로 신청해주세요");
      if (row?.result === "no_offer")
        return setError("제안된 일정이 없어요. 새로고침 후 다시 시도해주세요 🙏");
      setManageToken((row?.manage_token as string) ?? null);
      setMemberCount((row?.member_count as number) ?? 1);
      notifyAdmin();
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setSending(false);
    }
    setDone(true);
    onJoined?.();
  };

  if (!group.offer_date || !group.offer_time) return null;

  if (done) {
    return (
      <CompletePage
        name={name}
        date={group.offer_date}
        slot={group.offer_time}
        location={group.offer_location}
        orderNo={memberCount > 1 ? "합류" : "접수"}
        memberCount={memberCount}
        manageToken={manageToken}
        joined={memberCount > 1}
        groupSlug={slug}
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
          {formatYmdKo(group.offer_date)} {group.offer_time}
          <br />이 날 받을게요 🛵
        </h2>
        <p className="text-sm text-neutral-500">
          {group.offer_location
            ? `📍 ${group.offer_location}`
            : "장소는 단톡방에서 함께 정해요"}
        </p>
      </div>

      <div className="space-y-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              phoneRef.current?.focus();
            }
          }}
          enterKeyHint="next"
          autoComplete="name"
          placeholder="성함 📋"
          aria-label="성함"
          className="dform-input"
        />
        {useInvitePhone && invite?.phoneMasked ? (
          <InvitePhoneBox
            phoneMasked={invite.phoneMasked}
            onUseOther={() => setUseInvitePhone(false)}
          />
        ) : (
          <input
            ref={phoneRef}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            enterKeyHint="done"
            placeholder="연락처 📞 010-0000-0000"
            aria-label="연락처"
            className="dform-input"
          />
        )}
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
          {sending ? "신청 중… 🛵" : "좋아요, 받을게요 🛵"}
        </button>
      </div>
    </motion.div>
  );
}
