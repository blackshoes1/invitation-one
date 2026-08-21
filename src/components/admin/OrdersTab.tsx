"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeliveryStatus, TrackingStage, Group } from "@/lib/supabase";
import { type AdminDelivery, type TabCtx } from "@/app/admin/shared";
import OrderFilters from "./orders/OrderFilters";
import OrderCard from "./orders/OrderCard";
import type { EditSched } from "./orders/types";

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
      <OrderFilters
        tab={tab}
        onTabChange={(t) => {
          setTab(t);
          loadOrders(t, groupFilter);
        }}
        groupFilter={groupFilter}
        onGroupChange={(gid) => {
          setGroupFilter(gid);
          loadOrders(tab, gid);
        }}
        groups={groups}
        search={search}
        setSearch={setSearch}
      />

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