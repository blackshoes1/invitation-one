"use client";

import Link from "next/link";
import type { ParticipantDetail, GroupOrder } from "@/lib/supabase";
import { type TimeSlot, formatYmdKo } from "@/lib/wedding";
import TrackingView from "@/components/delivery/TrackingView";
import { type Mode, invitationHref } from "./types";
import ReviewBlock from "./ReviewBlock";
import SwitchPanel from "./SwitchPanel";
import ReschedulePanel from "./ReschedulePanel";
import ToHeartPanel from "./ToHeartPanel";

/* ---------- 직접배달 참여자 ---------- */
export default function DeliveryParticipantView({
  detail,
  orders,
  booked,
  mode,
  setMode,
  busy,
  error,
  setError,
  newDate,
  setNewDate,
  newSlot,
  setNewSlot,
  sido,
  setSido,
  sub,
  setSub,
  stamp,
  setStamp,
  heartMsg,
  setHeartMsg,
  rating,
  setRating,
  reviewText,
  setReviewText,
  reviewBusy,
  reviewDone,
  doSwitch,
  doLeave,
  doReschedule,
  doRespond,
  doToHeart,
  doReview,
}: {
  detail: ParticipantDetail;
  orders: GroupOrder[];
  booked: Set<string>;
  mode: Mode;
  setMode: (m: Mode) => void;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  newDate: string | null;
  setNewDate: (d: string | null) => void;
  newSlot: TimeSlot | null;
  setNewSlot: (s: TimeSlot | null) => void;
  sido: string;
  setSido: (s: string) => void;
  sub: string;
  setSub: (s: string) => void;
  stamp: string;
  setStamp: (s: string) => void;
  heartMsg: string;
  setHeartMsg: (s: string) => void;
  rating: number;
  setRating: (n: number) => void;
  reviewText: string;
  setReviewText: (s: string) => void;
  reviewBusy: boolean;
  reviewDone: boolean;
  doSwitch: (targetId: string) => void;
  doLeave: () => void;
  doReschedule: () => void;
  doRespond: (accept: boolean) => void;
  doToHeart: () => void;
  doReview: () => void;
}) {
  const memberCount = detail.member_count ?? 1;
  const isDone = detail.status === "완료";
  const isCancelled = detail.status === "취소";

  if (isCancelled)
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
        <div className="text-5xl">🗑️</div>
        <p className="font-bold text-neutral-700">취소된 주문이에요</p>
        <Link
          href="/delivery"
          className="mt-2 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold"
        >
          다시 신청하기
        </Link>
      </div>
    );

  return (
    <div className="max-w-md mx-auto px-6 py-8 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-extrabold text-neutral-800">
          {detail.name}님의 신청 내역
        </h1>
        <p className="text-sm text-neutral-500">
          현재 주문:{" "}
          <span className="font-bold text-delivery">
            {detail.date ? formatYmdKo(detail.date) : ""} {detail.time_slot}
          </span>{" "}
          — 함께 받는 분 {memberCount}명
        </p>
        {detail.member_names && detail.member_names.length > 0 && (
          <p className="text-xs text-neutral-500">
            참여: {detail.member_names.join(", ")}
          </p>
        )}
        <div className="flex justify-center gap-1.5 pt-1">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
            상태: {detail.status}
          </span>
          {detail.is_owner && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-delivery/10 text-delivery font-bold">
              주문 대표 👑
            </span>
          )}
        </div>
      </div>

      {/* 대표의 일정 변경 제안 — 함께 이동 / 정중히 사양 */}
      {!isDone && detail.pending_delivery_id && detail.pending_date && (
        <div className="bg-delivery/5 border-2 border-delivery/25 rounded-2xl p-5 space-y-3">
          <div className="text-center space-y-1.5">
            <div className="text-3xl">📨</div>
            <p className="text-sm font-extrabold text-neutral-800">
              {detail.pending_by ? `${detail.pending_by}님` : "주문 대표님"}이
              일정을 옮기려고 해요
            </p>
            <p className="text-xs text-neutral-500 leading-relaxed">
              {detail.date ? formatYmdKo(detail.date) : ""} {detail.time_slot}
              {" → "}
              <span className="font-bold text-delivery">
                {formatYmdKo(detail.pending_date)} {detail.pending_time}
              </span>
              <br />
              함께 이동하시겠어요? 각자 편하게 정하시면 돼요 🙂
            </p>
          </div>
          {error && (
            <p className="text-sm text-delivery-dark text-center">{error}</p>
          )}
          <div className="flex gap-2.5">
            <button
              onClick={() => doRespond(false)}
              disabled={busy}
              className="flex-1 py-3 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold disabled:opacity-60"
            >
              정중히 사양할게요 🙏
            </button>
            <button
              onClick={() => doRespond(true)}
              disabled={busy}
              className="flex-1 py-3 rounded-full bg-delivery text-white text-sm font-extrabold active:scale-95 transition-transform disabled:opacity-60"
            >
              {busy ? "처리 중…" : "함께 이동할게요 🤝"}
            </button>
          </div>
        </div>
      )}

      {/* 실시간 배송 현황 */}
      {detail.tracking_stage && (
        <div className="bg-delivery/5 rounded-2xl py-5 px-4">
          <TrackingView stage={detail.tracking_stage} />
        </div>
      )}

      {/* 배송 완료 → 개인별 리뷰 */}
      {isDone && (
        <ReviewBlock
          already={detail.review_rating}
          alreadyText={detail.review_text}
          rating={rating}
          setRating={setRating}
          reviewText={reviewText}
          setReviewText={setReviewText}
          busy={reviewBusy}
          done={reviewDone}
          onSubmit={doReview}
        />
      )}

      {!isDone && mode === "view" && (
        <div className="space-y-3">
          {detail.is_owner && (
            <button
              onClick={() => setMode("reschedule")}
              className="w-full py-3.5 rounded-full bg-delivery text-white font-bold active:scale-95 transition-transform"
            >
              날짜/시간 변경하기
            </button>
          )}
          {orders.length > 0 && (
            <button
              onClick={() => setMode("switch")}
              className="w-full py-3.5 rounded-full bg-white border-2 border-delivery/25 text-delivery font-bold"
            >
              다른 주문으로 갈아타기 🔄
            </button>
          )}
          <button
            onClick={() => setMode("toHeart")}
            className="w-full py-3.5 rounded-full bg-white border-2 border-wedding-gold/30 text-wedding-gold font-bold"
          >
            마음 배송으로 바꾸기 💌
          </button>
          <button
            onClick={doLeave}
            disabled={busy}
            className="w-full py-3.5 rounded-full bg-white border-2 border-delivery/20 text-delivery-dark font-bold disabled:opacity-60"
          >
            이 주문에서 나가기
          </button>
        </div>
      )}

      {/* 갈아타기 */}
      {!isDone && mode === "switch" && (
        <SwitchPanel
          orders={orders}
          busy={busy}
          error={error}
          setMode={setMode}
          setError={setError}
          doSwitch={doSwitch}
        />
      )}

      {/* 일정 변경 (대표만) */}
      {!isDone && mode === "reschedule" && (
        <ReschedulePanel
          memberCount={memberCount}
          booked={booked}
          newDate={newDate}
          setNewDate={setNewDate}
          newSlot={newSlot}
          setNewSlot={setNewSlot}
          busy={busy}
          error={error}
          setMode={setMode}
          setError={setError}
          doReschedule={doReschedule}
        />
      )}

      {/* 마음 배송 전환 */}
      {!isDone && mode === "toHeart" && (
        <ToHeartPanel
          stamp={stamp}
          setStamp={setStamp}
          sido={sido}
          sub={sub}
          setSido={setSido}
          setSub={setSub}
          heartMsg={heartMsg}
          setHeartMsg={setHeartMsg}
          busy={busy}
          error={error}
          setMode={setMode}
          setError={setError}
          doToHeart={doToHeart}
        />
      )}

      {error && mode === "view" && (
        <p className="text-sm text-delivery-dark text-center">{error}</p>
      )}

      {/* 신청자는 청첩장 열람 가능 (접수 즉시 공개) */}
      {mode === "view" && (
        <div className="text-center pt-1">
          <Link
            href={invitationHref}
            className="text-sm text-neutral-500 underline underline-offset-2"
          >
            💌 모바일 청첩장 보기
          </Link>
        </div>
      )}
    </div>
  );
}
