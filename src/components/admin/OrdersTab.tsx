"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeliveryStatus, TrackingStage, Group } from "@/lib/supabase";
import { type AdminDelivery, type TabCtx } from "@/app/admin/shared";
import OrderFilters from "./orders/OrderFilters";
import OrderCard from "./orders/OrderCard";
import type { EditSched } from "./orders/types";
import { describeSms, type SmsOutcome } from "@/lib/smsResult";
import { joinLocation } from "@/lib/regions";

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
  const [editSched, setEditSched] = useState<EditSched | null>(null);
  /** 일정 변경 시 참여자 안내 문자 발송 여부 (폼 체크박스) */
  const [notifyOnSchedule, setNotifyOnSchedule] = useState(true);
  /** 숨김 처리한 주문까지 볼지 (DB 는 보존 — 표시 전용) */
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadOrders = async (
    status: DeliveryStatus | "전체" = tab,
    gid: string = groupFilter,
    withHidden: boolean = showHidden
  ) => {
    // ※ 여기서 setError/setNotice(null) 을 하지 않는다 — 작업 성공·실패 메시지를
    //   띄운 직후 목록을 다시 불러오는 흐름이라, 여기서 지우면 같은 렌더에
    //   묶여 메시지가 아예 보이지 않는다. 화면 전환·필터 변경 시에만 지운다.
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status !== "전체") qs.set("status", status);
      if (gid) qs.set("group_id", gid);
      if (withHidden) qs.set("include_hidden", "1");
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
    const restoring = status === "대기중";
    if (restoring && !confirm("취소된 주문을 대기중으로 복구할까요? 숨김도 해제됩니다. 안내 문자는 보내지 않습니다.")) return;
    setActing(id);
    setNotice(null);
    try {
      const res = await api(`/api/admin/deliveries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(restoring ? { action: "restore" } : { status }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "변경 실패");
      if (restoring) {
        setNotice("대기중으로 복구하고 숨김을 해제했습니다. 안내 문자는 보내지 않았어요.");
      } else if (status === "확정") {
        // 한 건이라도 못 보냈으면 초록 알림이 아니라 빨간 오류다 (smsResult 참고)
        const r = describeSms(j.sms as SmsOutcome | null, "확정 처리");
        (r.ok ? setNotice : setError)(r.text);
      } else if (status === "취소") {
        // 취소는 문자를 보내지 않는다 — "연락처가 없어 미발송" 처럼 들리면 안 된다.
        setNotice("취소 처리됐습니다. 안내 문자는 보내지 않았어요 — 필요하면 직접 연락해주세요.");
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
    // 시/도·시/군/구는 필수 — 첫 낱말이 시/도여야 배송경로 지도에 핀이 붙는다.
    // 예전 자유 입력 값은 '상세 위치'에 그대로 실려 있으니 여기서 잃지 않는다.
    if (!editSched.sido || !editSched.sub)
      return setError(
        "장소의 시/도·시/군/구를 골라주세요. (원래 적혀 있던 내용은 '상세 위치'에 그대로 남아 있어요)"
      );
    setError(null);
    setNotice(null);

    const notify = notifyOnSchedule && rows.find((r) => r.id === editSched.id)?.status !== "취소";
    const res = await api(`/api/admin/deliveries/${editSched.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        date: editSched.date,
        time_slot: editSched.time,
        location: joinLocation(editSched.sido, editSched.sub, editSched.detail),
        notify,
      }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "일정 변경 실패");

    if (!notify) {
      setNotice("일정이 변경되었습니다 (문자 안내 생략).");
    } else {
      const r = describeSms(j.sms as SmsOutcome | null, "일정 변경");
      (r.ok ? setNotice : setError)(r.text);
    }
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
    setNotice(
      j.deduped > 0
        ? `참여자 ${j.moved}명을 옮기고 주문을 합쳤어요 🔗 (같은 분 ${j.deduped}명은 한 건으로 정리)`
        : `참여자 ${j.moved}명을 옮기고 주문을 합쳤어요 🔗`
    );
    loadOrders();
  };

  /** 표시 숨김/복구 — DB 는 그대로 두고 관리자 목록에서만 감춘다 */
  const toggleHidden = async (id: string, hidden: boolean, active: boolean) => {
    if (hidden && active && !confirm(
      "이 주문을 목록에서 숨길까요?\n데이터는 삭제되지 않고 보존되며, '숨김 포함 보기'로 언제든 되돌릴 수 있어요.\n(아직 진행 중인 주문이라 배송경로·캘린더에서도 사라집니다)"
    ))
      return;
    setNotice(null);
    setError(null);
    const res = await api(`/api/admin/deliveries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ hidden }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setError(j.error ?? "표시 설정 변경 실패");
    }
    setNotice(
      hidden
        ? "목록에서 숨겼어요 (데이터는 보존 — '숨김 포함 보기'로 복구 가능)."
        : "다시 표시했어요."
    );
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
      <OrderFilters
        tab={tab}
        onTabChange={(t) => {
          setTab(t);
          setError(null);
          setNotice(null);
          loadOrders(t, groupFilter);
        }}
        groupFilter={groupFilter}
        onGroupChange={(gid) => {
          setGroupFilter(gid);
          setError(null);
          setNotice(null);
          loadOrders(tab, gid);
        }}
        groups={groups}
        search={search}
        setSearch={setSearch}
      />

      <label className="flex items-center justify-end gap-1.5 text-[11px] text-neutral-500">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(e) => {
            setShowHidden(e.target.checked);
            loadOrders(tab, groupFilter, e.target.checked);
          }}
          className="accent-sage-600"
        />
        숨김 포함 보기
      </label>

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
        {filteredRows.map((r) => (
          <OrderCard
            key={r.id}
            r={r}
            groupName={groupName}
            acting={acting}
            mergeSource={mergeSource}
            setMergeSource={setMergeSource}
            notify={notifyOnSchedule}
            setNotify={setNotifyOnSchedule}
            onToggleHidden={toggleHidden}
            editSched={editSched}
            setEditSched={setEditSched}
            onChangeStatus={changeStatus}
            onChangeStage={changeStage}
            onMerge={doMerge}
            onSaveSchedule={saveSchedule}
          />
        ))}
      </div>
    </>
  );
}
