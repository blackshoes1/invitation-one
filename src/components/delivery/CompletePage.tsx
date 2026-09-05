"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect } from "react";
import { formatYmdKo, groom, bride, VIDEO_URL, INVITATION_KEY } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";
import { getSiteSettings } from "@/lib/settings";
import TrackingView from "@/components/delivery/TrackingView";
import SaveInvitationLink from "@/components/delivery/SaveInvitationLink";

export default function CompletePage({
  name,
  date,
  slot,
  location,
  rider = null,
  orderNo,
  memberCount,
  manageToken,
  joined = false,
  groupSlug = null,
}: {
  name: string;
  date: string;
  slot: TimeSlot;
  location?: string | null;
  /** 배송기사 ('신랑' | '신랑+신부') — 없으면 신랑 기본 표시 */
  rider?: string | null;
  orderNo: string;
  /** 함께 받는 참여자 수 (자동 집계) */
  memberCount: number;
  /** 관리 링크 토큰 (participant UUID 아님) */
  manageToken: string | null;
  /** 합류로 들어온 경우 (새 주문 아님) */
  joined?: boolean;
  groupSlug?: string | null;
}) {
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // 배송기사 표기 — 화면 카드와 저장용 PNG 주문서에서 공용 (신부/커플 주문도 정확히)
  const riderLabel =
    rider === "신랑+신부"
      ? `${groom.name}·${bride.name} (신랑+신부)`
      : rider === "신부"
      ? `${bride.name} (신부)`
      : `${groom.name} (신랑)`;
  // Admin 설정 영상 우선, 없으면 env(VIDEO_URL) 폴백
  const [videoUrl, setVideoUrl] = useState(VIDEO_URL);
  useEffect(() => {
    getSiteSettings().then((s) => {
      if (s.video_url) setVideoUrl(s.video_url);
    });
  }, []);

  /** 주문 내역 카드를 canvas 로 그려 PNG 저장 (라이브러리 없이) */
  const saveCard = () => {
    try {
      const W = 720;
      const H = 880;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");

      // 배경
      ctx.fillStyle = "#f4f7f7";
      ctx.fillRect(0, 0, W, H);

      // 카드
      const card = { x: 60, y: 90, w: W - 120, h: H - 180, r: 28 };
      ctx.beginPath();
      ctx.roundRect(card.x, card.y, card.w, card.h, card.r);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.08)";
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 헤더 (민트)
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(card.x, card.y, card.w, 92, [28, 28, 0, 0]);
      ctx.fillStyle = "#2ac1bc";
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 30px Pretendard, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(`주문번호 #${orderNo}`, card.x + 32, card.y + 47);
      ctx.font = "22px Pretendard, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("배차 완료 🛵", card.x + card.w - 32, card.y + 47);
      ctx.textAlign = "left";

      // 본문 행
      const rows: [string, string][] = [
        ["상품", `${groom.name}·${bride.name} 청첩장`],
        ...(location ? ([["배송지", location]] as [string, string][]) : []),
        ["배송 예정", `${formatYmdKo(date)} ${slot}`],
        ["받는 분", name],
        ["함께 받는 분", `${memberCount}명`],
        ["배송기사", riderLabel],
      ];
      let y = card.y + 150;
      for (const [label, value] of rows) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = "22px Pretendard, sans-serif";
        ctx.fillText(label, card.x + 32, y);
        ctx.fillStyle = "#2b2a26";
        ctx.font = "bold 24px Pretendard, sans-serif";
        ctx.textAlign = "right";
        // 긴 배송지는 말줄임
        let v = value;
        while (ctx.measureText(v).width > card.w - 220 && v.length > 4)
          v = v.slice(0, -2) + "…";
        ctx.fillText(v, card.x + card.w - 32, y);
        ctx.textAlign = "left";
        y += 62;
      }

      // 점선 + 푸터
      ctx.strokeStyle = "#e5e7eb";
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(card.x + 32, y);
      ctx.lineTo(card.x + card.w - 32, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#2ac1bc";
      ctx.font = "bold 26px Pretendard, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("나 청첩장 배송 신청했다 🛵", W / 2, y + 56);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "20px Pretendard, sans-serif";
      ctx.fillText(`${groom.name} ♥ ${bride.name} · 청첩장배달`, W / 2, y + 100);
      ctx.textAlign = "left";

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `청첩장배달_주문서_${orderNo}.png`;
      a.click();
      setSaveMsg("주문서 이미지를 저장했어요! 📸");
    } catch {
      setSaveMsg("저장에 실패했어요 — 화면을 스크린샷해 주세요 🙏");
    }
    setTimeout(() => setSaveMsg(null), 2500);
  };

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
          <Row
            label="배송기사"
            value={
              rider === "신랑+신부"
                ? `${riderLabel} 💑`
                : rider === "신부"
                ? `${riderLabel} 👰`
                : riderLabel
            }
            highlight
          />
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
          onClick={saveCard}
          className="px-5 py-2.5 rounded-full bg-white border border-delivery/25 text-delivery text-sm font-bold"
        >
          주문서 이미지로 저장 📸
        </button>
        {saveMsg && <p className="text-[11px] text-neutral-400">{saveMsg}</p>}
        <button
          type="button"
          onClick={share}
          className="px-5 py-2.5 rounded-full bg-delivery-yellow text-delivery-dark text-sm font-extrabold"
        >
          “나 청첩장 배송 신청했다 🛵” 단톡방에 공유
        </button>
        {shareMsg && <p className="text-[11px] text-neutral-400">{shareMsg}</p>}
        {manageToken && (
          <Link
            href={`/delivery/manage/${manageToken}`}
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
        {videoUrl ? (
          <a
            href={videoUrl}
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

      {/* 주문 접수 즉시 청첩장 공개 */}
      <Link
        href={INVITATION_KEY ? `/?key=${INVITATION_KEY}` : "/"}
        className="mt-7 inline-block px-6 py-3.5 rounded-full bg-white border-2 border-delivery/25 text-delivery font-extrabold active:scale-95 transition-transform"
      >
        💌 모바일 청첩장 보기
      </Link>
      <SaveInvitationLink />
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
