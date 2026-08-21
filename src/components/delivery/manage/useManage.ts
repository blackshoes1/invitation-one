"use client";

import { useCallback, useEffect, useState } from "react";
import {
  supabase,
  isSupabaseConfigured,
  type ParticipantDetail,
  type GroupOrder,
} from "@/lib/supabase";
import { type TimeSlot, STAMPS } from "@/lib/wedding";
import { OVERSEAS, joinRegion } from "@/lib/regions";
import type { Mode } from "./types";

/** 관리 API 호출 헬퍼 — 토큰은 본문에 담아 전송 */
async function manageApi(body: Record<string, unknown>) {
  const res = await fetch("/api/delivery/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  return { ok: res.ok, status: res.status, result: j.result, error: j.error };
}

export function useManage(token: string) {
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
    // 관리 토큰으로 서버 조회 (participant UUID 직접 조회 불가 — P0-2)
    let row: ParticipantDetail | null = null;
    try {
      const res = await fetch(`/api/delivery/manage?t=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as { participant?: ParticipantDetail };
        row = j.participant ?? null;
      }
    } catch {
      row = null;
    }
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
  }, [token]);

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
      const { ok, result: data } = await manageApi({ t: token, action: "switch", target_id: targetId });
      setBusy(false);
      if (!ok) return setError("갈아타기에 실패했어요. 다시 시도해주세요.");
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
      const { ok } = await manageApi({ t: token, action: "leave" });
      setBusy(false);
      if (!ok) return setError("처리에 실패했어요. 다시 시도해주세요.");
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
            token,
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
      const { ok, result: data } = await manageApi({ t: token, action: "respond", accept });
      setBusy(false);
      if (!ok) return setError("처리에 실패했어요. 다시 시도해주세요.");
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
      const { ok, result: data } = await manageApi({
        t: token,
        action: "convert_to_heart",
        region: joinRegion(sido, sub.trim()),
        stamp,
        message: heartMsg.trim() || null,
      });
      setBusy(false);
      if (!ok || data !== "ok")
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
      const { ok, result: data } = await manageApi({
        t: token,
        action: "review",
        rating,
        text: reviewText.trim() || null,
      });
      setReviewBusy(false);
      if (!ok) return setError("리뷰 등록에 실패했어요. 다시 시도해주세요.");
      if (data === "not_ready")
        return setError("아직 배송 완료 전이라 리뷰를 남길 수 없어요.");
      if (data === "rating") return setError("별점을 다시 선택해주세요 ⭐");
    } else {
      await new Promise((r) => setTimeout(r, 400));
      setReviewBusy(false);
    }
    setReviewDone(true);
  };

  return {
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
  };
}
