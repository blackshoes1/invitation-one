"use client";

import Link from "next/link";
import { invitationHref } from "@/components/delivery/manage/types";
import { useManage } from "@/components/delivery/manage/useManage";
import HeartParticipantView from "@/components/delivery/manage/HeartParticipantView";
import DeliveryParticipantView from "@/components/delivery/manage/DeliveryParticipantView";

/**
 * 참여자 단위 취소/변경 페이지
 * - 갈아타기(그룹 내 다른 주문) / 나가기 / 마음 배송 전환
 * - 주문 대표(is_owner)는 날짜/시간 변경 가능 (참여자 전원 적용)
 * - 배송 완료 시 개인별 리뷰
 */
export default function CancelChangeForm({ token }: { token: string }) {
  const {
    detail,
    orders,
    booked,
    mode,
    setMode,
    busy,
    error,
    setError,
    result,
    proposedCount,
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
  } = useManage(token);

  /* ----------------------------- 렌더 ----------------------------- */

  if (detail === undefined)
    return (
      <div className="h-[50vh] flex items-center justify-center text-sm text-neutral-400">
        불러오는 중…
      </div>
    );

  if (detail === null)
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
        <div className="text-5xl">🔍</div>
        <p className="font-bold text-neutral-700">신청 내역을 찾을 수 없어요</p>
        <Link
          href="/delivery"
          className="mt-2 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold"
        >
          배달 메인으로
        </Link>
      </div>
    );

  if (result) {
    const msg = {
      left: ["🗑️", "주문에서 나왔어요", "또 필요하시면 언제든 다시 신청해주세요 🛵"],
      switched: ["🔄", "갈아타기 완료!", "새 일정으로 함께 받아요 🛵"],
      rescheduled: ["✅", "일정이 변경되었어요", "변경된 일정으로 찾아뵐게요 🛵"],
      heart: ["💌", "마음 배송으로 바뀌었어요", "따뜻한 마음, 잘 받았어요 🥰 결혼식에서 꼭 안아드릴게요!"],
      proposed: [
        "📨",
        "일정 변경을 제안했어요",
        proposedCount > 0
          ? `함께 받는 ${proposedCount}분께 문자로 이동 의사를 여쭤봤어요. 대표님은 새 일정으로 옮겨졌고, 동의하신 분만 함께 이동해요 🛵`
          : "새 일정으로 옮겨졌어요 🛵",
      ],
      accepted: ["🤝", "함께 이동했어요", "변경된 일정으로 만나요 🛵"],
      declined: ["🙂", "기존 일정을 유지했어요", "원래 날짜 그대로 찾아뵐게요"],
    }[result];
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
        <div className="text-5xl">{msg[0]}</div>
        <p className="font-extrabold text-lg text-neutral-800">{msg[1]}</p>
        <p className="text-sm text-neutral-500">{msg[2]}</p>
        {result === "left" ? (
          <Link
            href="/delivery"
            className="mt-2 text-sm text-neutral-400 underline underline-offset-2"
          >
            🛵 배달 메인으로
          </Link>
        ) : (
          // 신청자(마음 배송 포함)는 청첩장 공개
          <Link
            href={invitationHref}
            className="mt-2 px-6 py-3 rounded-full bg-delivery text-white text-sm font-extrabold"
          >
            💌 모바일 청첩장 보기
          </Link>
        )}
      </div>
    );
  }

  /* ---------- 마음배송 참여자 ---------- */
  if (detail.type === "마음배송") {
    return <HeartParticipantView detail={detail} token={token} />;
  }

  /* ---------- 직접배달 참여자 ---------- */
  return (
    <DeliveryParticipantView
      detail={detail}
      orders={orders}
      booked={booked}
      mode={mode}
      setMode={setMode}
      busy={busy}
      error={error}
      setError={setError}
      newDate={newDate}
      setNewDate={setNewDate}
      newSlot={newSlot}
      setNewSlot={setNewSlot}
      sido={sido}
      setSido={setSido}
      sub={sub}
      setSub={setSub}
      stamp={stamp}
      setStamp={setStamp}
      heartMsg={heartMsg}
      setHeartMsg={setHeartMsg}
      rating={rating}
      setRating={setRating}
      reviewText={reviewText}
      setReviewText={setReviewText}
      reviewBusy={reviewBusy}
      reviewDone={reviewDone}
      doSwitch={doSwitch}
      doLeave={doLeave}
      doReschedule={doReschedule}
      doRespond={doRespond}
      doToHeart={doToHeart}
      doReview={doReview}
    />
  );
}
