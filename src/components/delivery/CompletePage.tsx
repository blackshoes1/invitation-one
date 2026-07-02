"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { formatYmdKo, groom, bride, VIDEO_URL } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";
import TrackingView from "@/components/delivery/TrackingView";

export default function CompletePage({
  name,
  date,
  slot,
  location,
  orderNo,
  memberCount,
  participantId,
  joined = false,
  groupSlug = null,
}: {
  name: string;
  date: string;
  slot: TimeSlot;
  location?: string | null;
  orderNo: string;
  /** 함께 받는 참여자 수 (자동 집계) */
  memberCount: number;
  participantId: string | null;
  /** 합류로 들어온 경우 (새 주문 아님) */
  joined?: boolean;
  groupSlug?: string | null;
}) {
  const [captureHint, setCaptureHint] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const share = async () => {
    const url = groupSlug
      ? `${window.location.origin}/delivery/group/${groupSlug}`
      : `${window.location.origin}/delivery`;
    const text = "나 청첩장 배송 신청했다 🛵 같이 받을 사람?";
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
        return;
      }
    } catch {
      return; // 사용자가 취소
    }
    try {
      await navigator.clipboard?.writeText(`${text} ${url}`);
      setShareMsg("링크를 복사했어요! 단톡방에 붙여넣어 주세요");
      setTimeout(() => setShareMsg(null), 2200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-12 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 12 }}
        className="text-6xl mb-3"
      >
        🎉
      </motion.div>

      <h1 className="text-2xl font-extrabold text-delivery">
        {joined ? "합류 완료!" : "주문이 접수되었습니다!"}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        {joined && memberCount > 1
          ? `${name}님, 다른 ${memberCount - 1}명과 함께 받아요 🎉`
          : `${name}님, 주문해주셔서 감사해요 🛵`}
      </p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-7 w-full max-w-xs bg-white rounded-2xl shadow-sm border border-delivery/10 overflow-hidden text-left"
      >
        <div className="bg-delivery px-5 py-3 text-white flex items-center justify-between">
          <span className="text-sm font-bold">주문번호 #{orderNo}</span>
          <span className="text-[11px] bg-white/25 px-2 py-0.5 rounded-full">
            배차 완료
          </span>
        </div>
        <div className="px-5 py-4 space-y-2.5 text-sm">
          <Row label="상품" value={`${groom.name}·${bride.name} 청첩장`} />
          {location && <Row label="배송지" value={location} />}
          <Row label="배송 예정" value={`${formatYmdKo(date)} ${slot}`} />
          <Row label="함께 받는 분" value={`${memberCount}명`} />
          <div className="border-t border-dashed border-neutral-200 my-2" />
          <Row label="배송기사" value={`${groom.name} (신랑)`} highlight />
        </div>
      </motion.div>

      {/* 배송 현황 (콘셉트 재미) */}
      <div className="mt-7 w-full max-w-xs">
        <TrackingView stage="주문접수" />
      </div>

      <p className="mt-5 text-xs text-neutral-400 leading-relaxed">
        배송기사가 직접 찾아갑니다 🛵
        <br />
        곧 연락드릴게요!
      </p>

      <div className="mt-5 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setCaptureHint(true)}
          className="px-5 py-2.5 rounded-full bg-white border border-delivery/25 text-delivery text-sm font-bold"
        >
          주문 내역 캡처하기 📸
        </button>
        {captureHint && (
          <p className="text-[11px] text-neutral-400">
            화면을 스크린샷으로 저장해 주세요 :)
          </p>
        )}
        <button
          type="button"
          onClick={share}
          className="px-5 py-2.5 rounded-full bg-delivery-yellow text-delivery-dark text-sm font-extrabold"
        >
          “나 청첩장 배송 신청했다 🛵” 단톡방에 공유
        </button>
        {shareMsg && <p className="text-[11px] text-neutral-400">{shareMsg}</p>}
        {participantId && (
          <Link
            href={`/delivery/manage/${participantId}`}
            className="text-sm text-neutral-500 underline underline-offset-2"
          >
            신청 취소 / 변경 / 배송 현황 보기
          </Link>
        )}
      </div>

      {/* 신청자 전용 영상 메시지 */}
      <div className="mt-8 w-full max-w-xs bg-delivery/5 rounded-2xl p-5 space-y-2">
        <p className="text-xs text-neutral-500 leading-relaxed">
          💌 신청해주신 분들께만 공개하는
          <br />
          특별한 영상 메시지가 있어요
        </p>
        {VIDEO_URL ? (
          <a
            href={VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 rounded-full bg-delivery-mint text-white font-bold text-sm active:scale-95 transition-transform"
          >
            영상 보기 ▶
          </a>
        ) : (
          <p className="text-[11px] text-neutral-400 py-2">영상 준비 중이에요 🎬</p>
        )}
      </div>

      <Link
        href="/"
        className="mt-7 inline-block text-sm text-neutral-400 underline underline-offset-2"
      >
        💌 청첩장으로 돌아가기
      </Link>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span
        className={`text-right ${
          highlight ? "text-delivery font-bold" : "text-neutral-700 font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
