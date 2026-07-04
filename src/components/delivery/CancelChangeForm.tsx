"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  supabase,
  isSupabaseConfigured,
  type ParticipantDetail,
  type GroupOrder,
} from "@/lib/supabase";
import {
  type TimeSlot,
  formatYmdKo,
  slotsForDate,
  STAMPS,
  INVITATION_KEY,
} from "@/lib/wedding";
import { OVERSEAS, joinRegion } from "@/lib/regions";
import DeliveryCalendar from "@/components/DeliveryCalendar";
import TrackingView from "@/components/delivery/TrackingView";
import RegionPicker from "@/components/delivery/RegionPicker";
import StampPicker from "@/components/delivery/StampPicker";

const SLOTS: TimeSlot[] = ["오전", "오후", "저녁"];

/** 마음 배송은 즉시 공개 — 키 포함 청첩장 링크 */
const invitationHref = INVITATION_KEY ? `/?key=${INVITATION_KEY}` : "/";

type Mode = "view" | "reschedule" | "switch" | "toHeart";

/**
 * 참여자 단위 취소/변경 페이지
 * - 갈아타기(그룹 내 다른 주문) / 나가기 / 마음 배송 전환
 * - 주문 대표(is_owner)는 날짜/시간 변경 가능 (참여자 전원 적용)
 * - 배송 완료 시 개인별 리뷰
 */
export default function CancelChangeForm({ participantId }: { participantId: string }) {
  const [detail, setDetail] = useState<ParticipantDetail | null | undefined>(undefined);
  const [orders, setOrders] = useState<GroupOrder[]>([]);
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    "left" | "switched" | "rescheduled" | "heart" | "proposed" | "accepted" | "declined" | null
  >(null);
  const [proposedCount, setProposedCount] = useState(0);

  // 일정 변경
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState<TimeSlot | null>(null);
  // 마음 배송 전환
  const [sido, setSido] = useState("");
  const [sub, setSub] = useState("");
  const [stamp, setStamp] = useState<string>(STAMPS[0]);
  const [heartMsg, setHeartMsg] = useState("");
  // 리뷰
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setDetail(null);
      return;
    }
    const { data } = await supabase.rpc("get_participant", { p_id: participantId });
    const row = Array.isArray(data) && data[0] ? (data[0] as ParticipantDetail) : null;
    setDetail(row);
    if (!row) return;

    if (row.group_slug) {
      const { data: od } = await supabase.rpc("get_group_orders", {
        p_slug: row.group_slug,
      });
      if (Array.isArray(od)) {
        setOrders(
          (od as GroupOrder[]).filter(
            (o) => o.id !== row.delivery_id && o.status !== "완료"
          )
        );
      }
    }
    const { data: bd } = await supabase.rpc("get_booked_dates");
    if (Array.isArray(bd)) {
      const set = new Set(bd.map((d: string) => String(d).slice(0, 10)));
      if (row.date) set.delete(row.date); // 본인 주문 날짜는 선택 가능
      setBooked(set);
    }
  }, [participantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /* ----------------------------- 액션 ----------------------------- */

  const doSwitch = async (targetId: string) => {
    if (!confirm("이 주문으로 갈아탈까요? 🔄")) return;
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("switch_participant", {
        p_id: participantId,
        p_target: targetId,
      });
      setBusy(false);
      if (error) return setError("갈아타기에 실패했어요. 다시 시도해주세요.");
      if (data === "closed") return setError("그 주문은 방금 마감됐어요 😢");
      if (data === "full") return setError("그 주문은 정원(10명)이 다 찼어요 😢");
      if (data === "dup") return setError("그 주문에 이미 같은 정보로 함께하고 계세요 😊");
      if (data !== "ok" && data !== "same") return setError("처리하지 못했어요. 다시 시도해주세요.");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setBusy(false);
    }
    setResult("switched");
  };

  const doLeave = async () => {
    if (!confirm("정말 이 주문에서 나가시겠어요?\n(마지막 참여자라면 주문이 취소되고 날짜 자리가 해제돼요)"))
      return;
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.rpc("leave_delivery", { p_id: participantId });
      setBusy(false);
      if (error) return setError("처리에 실패했어요. 다시 시도해주세요.");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setBusy(false);
    }
    setResult("left");
  };

  const doReschedule = async () => {
    if (!newDate || !newSlot) return setError("새 날짜와 시간대를 선택해주세요.");
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      try {
        const res = await fetch("/api/delivery/reschedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId,
            date: newDate,
            time: newSlot,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          result?: string;
          moved_count?: number;
        };
        setBusy(false);
        if (!res.ok)
          return setError("변경에 실패했어요. 잠시 후 다시 시도해주세요.");
        switch (j.result) {
          case "taken":
            return setError("방금 다른 분이 먼저 신청한 날짜예요 😢 다른 날짜를 골라주세요.");
          case "range":
            return setError("신청 가능 기간이 아니에요.");
          case "not_owner":
            return setError("주문 대표만 일정을 변경할 수 있어요.");
          case "solo":
            return setResult("rescheduled");
          case "proposed":
            setProposedCount(j.moved_count ?? 0);
            return setResult("proposed");
          default:
            return setError("처리하지 못했어요. 다시 시도해주세요.");
        }
      } catch {
        setBusy(false);
        return setError("변경에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setBusy(false);
      setResult("rescheduled");
    }
  };

  /** 일정 변경 제안에 응답 — 수락(함께 이동) / 사양(기존 날짜 잔류) */
  const doRespond = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("respond_reschedule", {
        p_participant: participantId,
        p_accept: accept,
      });
      setBusy(false);
      if (error) return setError("처리에 실패했어요. 다시 시도해주세요.");
      if (data === "closed")
        return setError("아쉽지만 그 일정이 마감됐어요 😢 기존 날짜에 그대로 남아요.");
      if (data === "full")
        return setError("옮기려는 주문의 정원(10명)이 다 찼어요 😢");
      if (data === "none") return load(); // 대기 상태가 이미 아님 — 새로고침
      if (data === "accepted") return setResult("accepted");
      if (data === "declined") return setResult("declined");
      return setError("처리하지 못했어요. 다시 시도해주세요.");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setBusy(false);
      setResult(accept ? "accepted" : "declined");
    }
  };

  const doToHeart = async () => {
    if (!sido || !sub.trim())
      return setError(
        sido === OVERSEAS ? "어느 나라인지 알려주세요 🌍" : "지역을 선택해주세요 📍"
      );
    setBusy(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("convert_to_heart", {
        p_id: participantId,
        p_region: joinRegion(sido, sub.trim()),
        p_stamp: stamp,
        p_message: heartMsg.trim() || null,
      });
      setBusy(false);
      if (error || data !== "ok")
        return setError("전환에 실패했어요. 다시 시도해주세요.");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setBusy(false);
    }
    setResult("heart");
  };

  const doReview = async () => {
    if (rating < 1) return setError("별점을 선택해주세요 ⭐");
    setReviewBusy(true);
    setError(null);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("submit_review_v2", {
        p_participant: participantId,
        p_rating: rating,
        p_text: reviewText.trim() || null,
      });
      setReviewBusy(false);
      if (error) return setError("리뷰 등록에 실패했어요. 다시 시도해주세요.");
      if (data === "not_ready")
        return setError("아직 배송 완료 전이라 리뷰를 남길 수 없어요.");
      if (data === "rating") return setError("별점을 다시 선택해주세요 ⭐");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setReviewBusy(false);
    }
    setReviewDone(true);
  };

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
    const convertHref = detail.group_slug
      ? `/delivery/group/${detail.group_slug}?convert=${detail.id}`
      : `/delivery?convert=${detail.id}`;
    return (
      <div className="max-w-md mx-auto px-6 py-10 space-y-5 text-center">
        <div className="text-5xl">{detail.stamp ?? "💌"}</div>
        <h1 className="text-xl font-extrabold text-neutral-800">
          {detail.name}님의 마음 배송
        </h1>
        {detail.region && (
          <p className="text-sm text-neutral-500">📍 {detail.region}에서 보내주셨어요</p>
        )}
        {detail.message && (
          <p className="text-sm text-neutral-500 bg-white rounded-2xl border border-delivery/10 p-4">
            “{detail.message}”
          </p>
        )}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wedding-gold/10 text-wedding-gold text-xs font-bold">
          💌 마음으로 함께한 분
        </div>
        <div className="pt-3 space-y-3">
          <Link
            href={invitationHref}
            className="block mx-auto w-fit px-6 py-3.5 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform"
          >
            💌 모바일 청첩장 보기
          </Link>
          <div>
            <Link
              href={convertHref}
              className="text-sm text-delivery underline underline-offset-2"
            >
              역시 직접 만나서 받고 싶어요 🛵
            </Link>
            <p className="mt-1.5 text-[11px] text-neutral-400">
              언제든 마음이 바뀌면 직접 배달로 전환할 수 있어요
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- 직접배달 참여자 ---------- */
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
          <p className="text-xs text-neutral-400">
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
        <div className="space-y-3">
          <p className="text-sm font-bold text-neutral-700">어느 주문으로 옮길까요? 🔄</p>
          {orders.map((o) => {
            const owner = o.member_names[0] ?? "";
            const extra = o.member_names.length - 1;
            return (
              <button
                key={o.id}
                onClick={() => doSwitch(o.id)}
                disabled={busy}
                className="w-full text-left bg-white rounded-2xl border-2 border-delivery/15 p-4 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                <p className="text-sm font-extrabold text-neutral-800">
                  🛵 {formatYmdKo(o.date)} {o.time_slot}
                  <span className="font-medium text-neutral-500">
                    {" "}
                    — {owner}
                    {extra > 0 ? ` 외 ${extra}명` : ""}
                  </span>
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  참여: {o.member_names.join(", ")}
                </p>
              </button>
            );
          })}
          {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
          <button
            onClick={() => {
              setMode("view");
              setError(null);
            }}
            className="w-full py-3 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold"
          >
            이전
          </button>
        </div>
      )}

      {/* 일정 변경 (대표만) */}
      {!isDone && mode === "reschedule" && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-neutral-700">
            새 날짜를 골라주세요 📅{" "}
            <span className="text-xs text-neutral-400 font-normal">
              {memberCount > 1
                ? `(함께 받는 분들껜 문자로 여쭤봐요 — 동의하신 분만 함께 이동해요)`
                : `(바로 변경돼요)`}
            </span>
          </p>
          <DeliveryCalendar
            selected={newDate}
            booked={booked}
            onSelect={(d) => {
              setNewDate(d);
              if (newSlot && !slotsForDate(d).includes(newSlot)) setNewSlot(null);
            }}
            selectedClass="bg-delivery text-white font-bold"
          />
          {newDate && slotsForDate(newDate).length === 1 && (
            <p className="text-[11px] text-neutral-400 text-center">
              평일은 저녁 배달만 가능해요 🌙
            </p>
          )}
          <div
            className={`grid gap-3 ${
              newDate && slotsForDate(newDate).length === 1
                ? "grid-cols-1"
                : "grid-cols-3"
            }`}
          >
            {(newDate ? slotsForDate(newDate) : SLOTS).map((s) => (
              <button
                key={s}
                onClick={() => setNewSlot(s)}
                className={`py-3 rounded-xl border-2 text-sm font-bold ${
                  newSlot === s
                    ? "border-delivery bg-delivery text-white"
                    : "border-delivery/20 bg-white text-neutral-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setMode("view");
                setError(null);
              }}
              className="px-5 py-3.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 font-bold"
            >
              이전
            </button>
            <button
              onClick={doReschedule}
              disabled={busy}
              className="flex-1 py-3.5 rounded-full bg-delivery text-white font-bold disabled:opacity-60"
            >
              {busy ? "변경 중…" : "변경하기"}
            </button>
          </div>
        </div>
      )}

      {/* 마음 배송 전환 */}
      {!isDone && mode === "toHeart" && (
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-neutral-700">
              마음 배송으로 바꿀게요 💌
            </p>
            <p className="text-[11px] text-neutral-400">
              못 만나도 괜찮아요 — 마음은 청첩장 지도에 예쁘게 남아요
            </p>
          </div>
          <StampPicker value={stamp} onChange={setStamp} />
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-neutral-500">
              어디서 마음을 보내시나요? 📍
            </p>
            <RegionPicker
              sido={sido}
              sub={sub}
              onChange={(s, g) => {
                setSido(s);
                setSub(g);
              }}
            />
          </div>
          <textarea
            value={heartMsg}
            maxLength={500}
            onChange={(e) => setHeartMsg(e.target.value)}
            placeholder="한마디 (선택)"
            className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-20 text-base"
          />
          {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setMode("view");
                setError(null);
              }}
              className="px-5 py-3.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 font-bold"
            >
              이전
            </button>
            <button
              onClick={doToHeart}
              disabled={busy}
              className="flex-1 py-3.5 rounded-full bg-delivery text-white font-bold disabled:opacity-60"
            >
              {busy ? "전환 중…" : "마음 배송으로 💌"}
            </button>
          </div>
        </div>
      )}

      {error && mode === "view" && (
        <p className="text-sm text-delivery-dark text-center">{error}</p>
      )}

      {/* 신청자는 청첩장 열람 가능 (접수 즉시 공개) */}
      {mode === "view" && (
        <div className="text-center pt-1">
          <Link
            href={invitationHref}
            className="text-sm text-neutral-400 underline underline-offset-2"
          >
            💌 모바일 청첩장 보기
          </Link>
        </div>
      )}
    </div>
  );
}

function ReviewBlock({
  already,
  alreadyText,
  rating,
  setRating,
  reviewText,
  setReviewText,
  busy,
  done,
  onSubmit,
}: {
  already: number | null;
  alreadyText: string | null;
  rating: number;
  setRating: (n: number) => void;
  reviewText: string;
  setReviewText: (s: string) => void;
  busy: boolean;
  done: boolean;
  onSubmit: () => void;
}) {
  // 이미 등록된 리뷰가 있거나 방금 등록 완료한 경우
  if (done || already) {
    const stars = "⭐".repeat(done ? rating : already ?? 0);
    return (
      <div className="bg-white border-2 border-delivery/15 rounded-2xl p-5 text-center space-y-2">
        <p className="text-sm font-extrabold text-delivery">리뷰 감사합니다! 🙏</p>
        <p className="text-lg tracking-wide">{stars}</p>
        {(done ? reviewText : alreadyText) && (
          <p className="text-xs text-neutral-500 leading-relaxed">
            “{done ? reviewText : alreadyText}”
          </p>
        )}
        <p className="text-[11px] text-neutral-400">
          남겨주신 후기는 청첩장에 소개돼요 💝
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-delivery/15 rounded-2xl p-5 space-y-4">
      <div className="text-center space-y-1">
        <p className="text-sm font-extrabold text-neutral-800">
          청첩장은 만족스러우셨나요?
        </p>
        <p className="text-[11px] text-neutral-400">별점을 남겨주시면 큰 힘이 돼요</p>
      </div>

      <div className="flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n}점`}
            className={`text-3xl transition-transform active:scale-90 ${
              n <= rating ? "grayscale-0 scale-110" : "grayscale opacity-40"
            }`}
          >
            ⭐
          </button>
        ))}
      </div>

      <div>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value.slice(0, 100))}
          placeholder="한줄 후기 (선택) 예) 신랑 친절해요 / 청첩장 예뻐요"
          rows={2}
          className="w-full rounded-xl border border-delivery/20 px-3 py-2.5 text-base resize-none focus:outline-none focus:border-delivery"
        />
        <p className="text-right text-[10px] text-neutral-300">
          {reviewText.length}/100
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="w-full py-3.5 rounded-full bg-delivery text-white font-bold active:scale-95 transition-transform disabled:opacity-60"
      >
        {busy ? "등록 중…" : "리뷰 등록하기"}
      </button>
    </div>
  );
}
