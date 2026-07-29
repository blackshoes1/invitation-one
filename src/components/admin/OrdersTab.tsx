"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeliveryStatus, TrackingStage, Group } from "@/lib/supabase";
import { TRACKING_STAGES } from "@/lib/supabase";
import { formatYmdKo, slotsForDate } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";
import {
  type AdminDelivery,
  type TabCtx,
  ownerName,
  STATUS_TABS,
  NEXT_ACTION,
} from "@/app/admin/shared";

/**
 * 주문 탭 — 상태별 목록·검색·상태 변경(SMS)·추적 단계·일정 수정·주문 합치기.
 * groups 는 필터 드롭다운·그룹명 표시용으로 부모에서 주입 (그룹 탭과 공유).
 */
export default function OrdersTab({
  api,
  setError,
  setNotice,
  groups,
  groupName,
}: TabCtx & {
  groups: Group[];
  groupName: (id: string | null) => string;
}) {
  const [tab, setTab] = useState<DeliveryStatus | "전체">("전체");
  const [groupFilter, setGroupFilter] = useState("");
  /** 상태 변경 요청 진행 중인 주문 id — 확정/취소 연타로 인한 SMS 중복 발송 방지 */
  const [acting, setActing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminDelivery[]>([]);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  /** 주문(담당자 신청) 일정 수정 상태 — 그룹 담당자가 신청한 일자·시간·장소 조정 */
  const [editSched, setEditSched] = useState<{
    id: string;
    date: string;
    time: string;
    location: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrders = async (
    status: DeliveryStatus | "전체" = tab,
    gid: string = groupFilter
  ) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const qs = new URLSearchParams();
      if (status !== "전체") qs.set("status", status);
      if (gid) qs.set("group_id", gid);
      const res = await api(`/api/admin/deliveries?${qs}`);
      if (res.status === 401) return; // api() 가 중앙 처리
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "불러오기 실패");
      setRows(j.deliveries ?? []);
    } catch {
      setError("주문 목록을 불러오지 못했습니다. 네트워크를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 마운트 시 1회 로드 — 기본 "전체" (탭 전환 시 컴포넌트가 다시 마운트됨).
  // loading 초기값이 true 라 여기서는 setLoading(true) 없이 결과만 반영.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/admin/deliveries");
        if (!alive || res.status === 401) return;
        const j = await res.json();
        if (!res.ok) return setError(j.error ?? "불러오기 실패");
        setRows(j.deliveries ?? []);
      } catch {
        if (alive)
          setError("주문 목록을 불러오지 못했습니다. 네트워크를 확인해주세요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeStatus = async (id: string, status: DeliveryStatus) => {
    if (acting) return; // 진행 중 연타 방지 — SMS 중복 발송 가드
    setActing(id);
    setNotice(null);
    try {
      const res = await api(`/api/admin/deliveries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "변경 실패");
      if (status === "확정" || status === "취소") {
        const sms = j.sms as
          | { count: number; sent: number; skipped: boolean }
          | null;
        const label = status === "확정" ? "확정" : "취소";
        setNotice(
          !sms || sms.count === 0
            ? `${label} 처리됨 — 연락처 보유 참여자가 없어 SMS 미발송.`
            : sms.skipped
            ? `${label} 처리됨 — SMS는 솔라피 키 미설정으로 미발송 (${sms.count}명 대상).`
            : `${label} 처리 및 참여자 ${sms.sent}/${sms.count}명에게 SMS 발송 완료.`
        );
      }
      loadOrders();
    } catch {
      setError("변경 요청에 실패했습니다. 네트워크를 확인해주세요.");
    } finally {
      setActing(null);
    }
  };

  const changeStage = async (id: string, stage: TrackingStage) => {
    setNotice(null);
    // 낙관적 업데이트
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, tracking_stage: stage } : r))
    );
    const res = await api(`/api/admin/deliveries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ tracking_stage: stage }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "단계 변경 실패");
      loadOrders();
    }
  };

  const saveSchedule = async () => {
    if (!editSched) return;
    if (!editSched.date) return setError("날짜를 선택해주세요.");
    if (!editSched.time) return setError("시간대를 선택해주세요.");
    if (!editSched.location.trim()) return setError("장소를 입력해주세요.");
    setError(null);
    setNotice(null);

    const notify = confirm(
      "일정을 변경합니다.\n참여자에게 변경 안내 문자를 보낼까요?\n(취소를 눌러도 일정은 변경되며 문자만 생략됩니다)"
    );
    const res = await api(`/api/admin/deliveries/${editSched.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        date: editSched.date,
        time_slot: editSched.time,
        location: editSched.location.trim(),
        notify,
      }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "일정 변경 실패");

    const sms = j.sms as { count: number; sent: number; skipped: boolean } | null;
    setNotice(
      !notify
        ? "일정이 변경되었습니다 (문자 안내 생략)."
        : !sms || sms.count === 0
        ? "일정이 변경되었습니다 — 연락처 보유 참여자가 없어 SMS 미발송."
        : sms.skipped
        ? `일정이 변경되었습니다 — SMS는 솔라피 키 미설정으로 미발송 (${sms.count}명 대상).`
        : `일정 변경 및 참여자 ${sms.sent}/${sms.count}명에게 안내 SMS 발송 완료.`
    );
    setEditSched(null);
    loadOrders();
  };

  /** 주문 합치기 — mergeSource 의 참여자를 target 으로 이동
   *  (합석 의사는 신청 시점에 하객이 페이지에서 직접 확인 — 합석 제안 UI) */
  const doMerge = async (targetId: string) => {
    if (!mergeSource) return;
    if (!confirm("선택한 주문의 참여자를 이 주문으로 옮기고, 원래 주문은 취소할까요?"))
      return;
    setNotice(null);
    setError(null);
    const res = await api("/api/admin/merge", {
      method: "POST",
      body: JSON.stringify({ source_id: mergeSource, target_id: targetId }),
    });
    const j = await res.json();
    setMergeSource(null);
    if (!res.ok) return setError(j.error ?? "합치기 실패");
    setNotice(`참여자 ${j.moved}명을 옮기고 주문을 합쳤어요 🔗`);
    loadOrders();
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.participants ?? []).some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone ?? "").toLowerCase().includes(q)
      )
    );
  }, [rows, search]);

  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        {(["전체", ...STATUS_TABS] as (DeliveryStatus | "전체")[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              loadOrders(t, groupFilter);
            }}
            className={`px-4 py-2 text-xs tracking-wider border ${
              tab === t
                ? "bg-sage-600 text-white border-sage-600"
                : "bg-white text-neutral-500 border-wedding-gold/20"
            }`}
          >
            {t}
          </button>
        ))}
        <select
          value={groupFilter}
          onChange={(e) => {
            setGroupFilter(e.target.value);
            loadOrders(tab, e.target.value);
          }}
          className="px-3 py-2 text-xs border border-wedding-gold/20 bg-white text-neutral-600"
        >
          <option value="">전체 그룹</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 · 연락처 검색"
          className="flex-1 p-2.5 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
        />
        <a
          href="/api/admin/export"
          className="shrink-0 flex items-center px-3 text-xs border border-sage-300 text-sage-600 bg-white whitespace-nowrap"
          title="참여자 연락처 CSV 내보내기"
        >
          CSV ⬇
        </a>
      </div>

      {mergeSource && (
        <p className="text-xs text-center text-delivery bg-delivery/5 border border-delivery/20 py-2">
          🔗 합칠 대상 주문의 [여기로 합치기] 버튼을 눌러주세요
          <button
            onClick={() => setMergeSource(null)}
            className="ml-2 underline text-neutral-400"
          >
            취소
          </button>
        </p>
      )}

      {loading && (
        <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
      )}
      {!loading && filteredRows.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-10">
          해당 조건의 신청이 없습니다.
        </p>
      )}

      <div className="space-y-3">
        {filteredRows.map((r) => {
          const nextAction = NEXT_ACTION[r.status];
          const cancelable = r.status !== "취소" && r.status !== "완료";
          return (
            <div
              key={r.id}
              className="bg-white border border-wedding-gold/15 p-4 text-sm flex flex-col gap-2"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <p className="font-medium text-sage-700">
                    {ownerName(r)}
                    {(r.participants?.length ?? 0) > 1 && (
                      <span className="text-xs text-neutral-500 font-normal">
                        {" "}
                        외 {(r.participants?.length ?? 1) - 1}명
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatYmdKo(r.date)} · {r.time_slot} · {r.location}
                    {r.rider === "신랑+신부" && (
                      <span className="text-delivery font-bold"> · 💑 신랑+신부</span>
                    )}
                    {r.rider === "신부" && (
                      <span className="text-delivery font-bold"> · 👰 신부</span>
                    )}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    👥 {r.participants?.length ?? 0}명 · 📦 {groupName(r.group_id)}
                  </p>
                  {r.message && (
                    <p className="text-xs text-neutral-400 pt-1">
                      “{r.message}”
                    </p>
                  )}
                </div>
                <span className="text-[11px] px-2 py-1 bg-sage-50 text-sage-600 border border-sage-200 whitespace-nowrap">
                  {r.status}
                </span>
              </div>

              {/* 참여자 명단 (참여 시스템) */}
              {(r.participants?.length ?? 0) > 0 && (
                <ul className="border-t border-wedding-gold/10 pt-2 space-y-1">
                  {r.participants.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 text-xs text-neutral-600"
                    >
                      <span>
                        {p.is_owner ? "👑" : "👤"} {p.name}
                      </span>
                      <span className="text-neutral-400">{p.phone}</span>
                      {p.review_rating != null && (
                        <span className="ml-auto text-amber-500">
                          {"⭐".repeat(p.review_rating)}
                          {p.review_text && (
                            <span className="text-neutral-400">
                              {" "}
                              “{p.review_text}”
                            </span>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* 배송 추적 단계 (재미 트래킹, 하객 화면 실시간 반영) */}
              {r.status !== "취소" && (
                <div className="border-t border-wedding-gold/10 pt-2">
                  <p className="text-[10px] text-neutral-400 mb-1">
                    배송 현황 (하객에게 실시간 표시)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TRACKING_STAGES.map((s) => (
                      <button
                        key={s}
                        onClick={() => changeStage(r.id, s)}
                        className={`px-2.5 py-1 text-[11px] border rounded-sm ${
                          r.tracking_stage === s
                            ? "bg-delivery text-white border-delivery"
                            : "bg-white text-neutral-500 border-neutral-200"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 일정 수정(취소 외 모든 주문 — 완료 후 정정 포함) + 합치기(활성 주문만) */}
              {r.status !== "취소" && (
                <div className="flex justify-end gap-2 flex-wrap">
                  <button
                    onClick={() =>
                      setEditSched((cur) =>
                        cur?.id === r.id
                          ? null
                          : {
                              id: r.id,
                              date: r.date,
                              time: r.time_slot,
                              location: r.location ?? "",
                            }
                      )
                    }
                    className={`px-3 py-1.5 text-xs border ${
                      editSched?.id === r.id
                        ? "border-sage-600 text-sage-700 bg-sage-50"
                        : "border-neutral-300 text-neutral-500"
                    }`}
                  >
                    {editSched?.id === r.id ? "수정 닫기" : "📝 일정 수정"}
                  </button>
                  {r.status !== "완료" &&
                    (mergeSource === null ? (
                      <button
                        onClick={() => setMergeSource(r.id)}
                        className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-500"
                      >
                        이 주문을 다른 주문과 합치기 🔗
                      </button>
                    ) : mergeSource === r.id ? (
                      <button
                        onClick={() => setMergeSource(null)}
                        className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-400"
                      >
                        합치기 취소
                      </button>
                    ) : (
                      <button
                        onClick={() => doMerge(r.id)}
                        className="px-3 py-1.5 text-xs bg-delivery text-white font-bold"
                      >
                        여기로 합치기 ⤵
                      </button>
                    ))}
                </div>
              )}

              {/* 일정 수정 폼 — 그룹 담당자가 신청한 일자·시간·장소를 관리자가 조정 */}
              {editSched?.id === r.id && (
                <div className="border-t border-wedding-gold/10 pt-2.5 space-y-2">
                  <p className="text-[10px] text-neutral-400">
                    일정 수정 — 저장 시 참여자 문자 안내 여부를 물어봅니다
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="date"
                      min="2026-07-06"
                      max="2026-10-16"
                      value={editSched.date}
                      onChange={(e) =>
                        setEditSched((cur) =>
                          cur && {
                            ...cur,
                            date: e.target.value,
                            // 날짜가 바뀌면 해당 날짜에 없는 시간대는 초기화
                            time: slotsForDate(e.target.value).includes(
                              cur.time as TimeSlot
                            )
                              ? cur.time
                              : "",
                          }
                        )
                      }
                      className="p-2 text-xs border border-wedding-gold/20 bg-white"
                    />
                    <select
                      value={editSched.time}
                      onChange={(e) =>
                        setEditSched((cur) => cur && { ...cur, time: e.target.value })
                      }
                      disabled={!editSched.date}
                      className="p-2 text-xs border border-wedding-gold/20 bg-white"
                    >
                      <option value="">시간대</option>
                      {(editSched.date ? slotsForDate(editSched.date) : []).map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        )
                      )}
                    </select>
                    <input
                      type="text"
                      value={editSched.location}
                      onChange={(e) =>
                        setEditSched((cur) => cur && { ...cur, location: e.target.value })
                      }
                      placeholder="장소"
                      className="flex-1 min-w-[140px] p-2 text-xs border border-wedding-gold/20 bg-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditSched(null)}
                      className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-400"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveSchedule}
                      className="px-3 py-1.5 text-xs bg-sage-700 text-white"
                    >
                      변경 저장
                    </button>
                  </div>
                </div>
              )}

              {(nextAction || cancelable) && (
                <div className="flex justify-end gap-2">
                  {cancelable && (
                    <button
                      onClick={() => changeStatus(r.id, "취소")}
                      disabled={acting !== null}
                      className="px-3 py-1.5 text-xs border border-red-200 text-red-400 disabled:opacity-40"
                    >
                      취소 (SMS)
                    </button>
                  )}
                  {nextAction && (
                    <button
                      onClick={() => changeStatus(r.id, nextAction)}
                      disabled={acting !== null}
                      className="px-3 py-1.5 text-xs bg-sage-600 text-white tracking-wide disabled:opacity-40"
                    >
                      {acting === r.id ? "처리 중…" : `${nextAction}으로 변경`}
                      {acting !== r.id && nextAction === "확정" ? " (SMS)" : ""}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
