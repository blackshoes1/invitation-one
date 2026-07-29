"use client";

import { useMemo, useState } from "react";
import type {
  DeliveryStatus,
  TrackingStage,
  Group,
  RouteDay,
} from "@/lib/supabase";
import RouteMap from "@/components/RouteMap";
import FieldOps from "@/components/admin/FieldOps";
import WaitingTab from "@/components/admin/WaitingTab";
import MessagesTab from "@/components/admin/MessagesTab";
import SnapTab from "@/components/admin/SnapTab";
import ContentTab from "@/components/admin/ContentTab";
import GroupsTab from "@/components/admin/GroupsTab";
import { Metric, Legend } from "@/components/admin/ui";
import { TRACKING_STAGES } from "@/lib/supabase";
import { formatYmdKo, toYmd, slotsForDate } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";
import {
  type AdminDelivery,
  type AdminStats,
  type View,
  ownerName,
  thisWeekRange,
  buildIcs,
  STATUS_TABS,
  NEXT_ACTION,
  CAL_MONTHS,
  CAL_YEAR,
  WEEK,
} from "@/app/admin/shared";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<View>("orders");

  const [tab, setTab] = useState<DeliveryStatus>("대기중");
  const [groupFilter, setGroupFilter] = useState("");
  /** 상태 변경 요청 진행 중인 주문 id — 확정/취소 연타로 인한 SMS 중복 발송 방지 */
  const [acting, setActing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminDelivery[]>([]);
  const [allRows, setAllRows] = useState<AdminDelivery[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  /** 전체 등록인원 (취소 주문 참여자 제외, 그룹 미지정 포함) */
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [routeDays, setRouteDays] = useState<RouteDay[]>([]);
  const [routeOrigin, setRouteOrigin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeDate, setRouteDate] = useState<string>("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeSource, setMergeSource] = useState<string | null>(null);

  /** 주문(담당자 신청) 일정 수정 상태 — 그룹 담당자가 신청한 일자·시간·장소 조정 */
  const [editSched, setEditSched] = useState<{
    id: string;
    date: string;
    time: string;
    location: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kakao, setKakao] = useState<"ok" | "expired" | "unconfigured" | null>(null);

  const groupName = (id: string | null) =>
    id ? groups.find((g) => g.id === id)?.name ?? "그룹" : "—";

  // 쿠키 세션으로 인증 — 비밀번호는 로그인 시 1회만 전송.
  // 401(세션 만료)은 여기서 중앙 감지해 어느 탭에서든 로그인 화면으로 되돌린다
  // (탭별 로더가 만료를 빈 목록으로 오인해 "0건"을 표시하던 문제 방지).
  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 401) {
      setAuthed(false);
      setError("세션이 만료되었습니다. 다시 로그인해주세요.");
    }
    return res;
  };

  const loadGroups = async () => {
    try {
      const res = await api("/api/admin/groups");
      if (res.ok) {
        const j = await res.json();
        setGroups(j.groups ?? []);
        setTotalMembers(typeof j.total_members === "number" ? j.total_members : null);
      }
    } catch {
      setError("그룹 목록을 불러오지 못했습니다.");
    }
  };

  const loadOrders = async (
    status: DeliveryStatus = tab,
    gid: string = groupFilter
  ) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const qs = new URLSearchParams({ status });
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

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const [res, blockedRes] = await Promise.all([
        api("/api/admin/deliveries"),
        api("/api/admin/blocked"),
      ]);
      if (res.ok) setAllRows((await res.json()).deliveries ?? []);
      if (blockedRes.ok)
        setBlocked(new Set(((await blockedRes.json()).dates ?? []) as string[]));
    } catch {
      setError("캘린더를 불러오지 못했습니다. 네트워크를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  /** 날짜 선택 토글 (다중 선택 → 일괄 차단/해제) */
  const toggleSelect = (ymd: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  };

  /** 선택한 날짜들 일괄 마감/해제 (주문 있는 날짜도 마감 가능 — 신규 신청만 차단) */
  const applyBlock = async (block: boolean) => {
    if (selected.size === 0) return;
    setError(null);
    setNotice(null);
    const res = await api("/api/admin/blocked", {
      method: "POST",
      body: JSON.stringify({ dates: [...selected], block }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "마감 처리 실패");
    setBlocked((prev) => {
      const next = new Set(prev);
      for (const d of selected) {
        if (block) next.add(d);
        else next.delete(d);
      }
      return next;
    });
    setSelected(new Set());
    setNotice(
      block
        ? `${j.done}개 날짜를 마감했어요 🚫 (기존 주문은 유지돼요)`
        : `${j.done}개 날짜 마감을 해제했어요 ✅`
    );
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await api("/api/admin/stats");
      const j = await res.json();
      setStats(res.ok ? j : null);
    } catch {
      setError("요약을 불러오지 못했습니다. 네트워크를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const loadRoute = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/api/admin/route");
      const j = await res.json();
      if (res.ok) {
        const days = (j.days ?? []) as RouteDay[];
        setRouteDays(days);
        setRouteOrigin(j.origin ?? null);
        setRouteDate((prev) =>
          prev && days.some((d) => d.date === prev) ? prev : days[0]?.date ?? ""
        );
      } else setError(j.error ?? "경로 불러오기 실패");
    } catch {
      setError("경로를 불러오지 못했습니다. 네트워크를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const downloadIcs = () => {
    const blob = new Blob([buildIcs(allRows)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "delivery-schedule.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("비밀번호가 올바르지 않습니다.");
        return;
      }
      setAuthed(true);
      await loadGroups();
      await loadOrders("대기중", "");
      // 카카오 알림 연결 상태 (만료 사전 경고)
      api("/api/admin/kakao-status")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setKakao(j.status));
    } finally {
      setLoading(false);
    }
  };

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

  /** 주문 일정(일자·시간·장소) 저장 — 참여자 SMS 안내 여부 확인 후 PATCH */
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

  /** 그룹 카드의 명단 인원(roster_count)을 로컬로 ±n 반영 (재조회 없이 배지 동기화) */
  const bumpRoster = (gid: string, delta: number) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.id === gid
          ? { ...g, roster_count: Math.max(0, (g.roster_count ?? 0) + delta) }
          : g
      )
    );

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

  // 캘린더용: 날짜 → 활성(취소 제외) 주문 목록 (같은 날 여러 팀 가능)
  const byDate = useMemo(() => {
    const m: Record<string, AdminDelivery[]> = {};
    for (const r of allRows)
      if (r.status !== "취소") m[r.date] = [...(m[r.date] ?? []), r];
    return m;
  }, [allRows]);

  /* ----------------------------- 로그인 ----------------------------- */
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-wedding-cream px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
          className="w-full max-w-xs space-y-4 bg-white p-8 border border-wedding-gold/20"
        >
          <h1 className="font-serif text-lg text-sage-700 text-center tracking-widest">
            배달 관리자
          </h1>
          {/* text-base(16px) — 모바일에서 포커스 시 화면 확대(iOS 자동 줌) 방지 */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="관리자 비밀번호"
            className="w-full p-3 border border-wedding-gold/25 bg-transparent focus:outline-none focus:border-sage-600 text-base text-sage-700 rounded-none"
          />
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sage-700 text-white text-xs tracking-[0.2em] disabled:opacity-60"
          >
            {loading ? "확인 중…" : "입장"}
          </button>
        </form>
      </main>
    );
  }

  /* ----------------------------- 본문 ----------------------------- */
  return (
    <main className="min-h-screen bg-wedding-cream px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="font-serif text-xl text-sage-700 tracking-widest text-center">
          배달 관리자
        </h1>

        <div className="flex justify-center gap-2 flex-wrap">
          {(
            [
              ["dashboard", "요약"],
              ["orders", "주문"],
              ["calendar", "캘린더"],
              ["route", "배송경로"],
              ["groups", "그룹"],
              ["waiting", "대기자"],
              ["messages", "방명록"],
              ["snap", "하객스냅"],
              ["field", "현장운영"],
              ["content", "콘텐츠"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                // 대기자·방명록·스냅·콘텐츠 탭은 컴포넌트 마운트 시 자체 로드
                if (v === "dashboard") loadStats();
                if (v === "orders") loadOrders();
                if (v === "calendar") loadCalendar();
                if (v === "route") loadRoute();
                if (v === "groups") loadGroups();
              }}
              className={`px-4 py-2 text-xs tracking-wider border ${
                view === v
                  ? "bg-sage-700 text-white border-sage-700"
                  : "bg-white text-neutral-500 border-wedding-gold/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {kakao === "expired" && (
          <p className="text-xs text-center text-red-600 bg-red-50 py-2 border border-red-200">
            🔔 카카오 알림 연결이 만료됐어요 — 새 주문 알림이 오지 않습니다. refresh
            token 재발급이 필요해요 (README/kakao.ts 참고).
          </p>
        )}
        {kakao === "ok" && (
          <p className="text-[11px] text-center text-sage-500">🔔 카카오 알림 연결됨</p>
        )}

        {notice && (
          <p className="text-xs text-center text-sage-700 bg-sage-50 py-2 border border-sage-200">
            {notice}
          </p>
        )}
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        {loading && (
          <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
        )}

        {/* ===== 현장 운영 (체크인 v2) ===== */}
        {view === "field" && <FieldOps />}

        {/* ===== 대시보드 (요약) ===== */}
        {view === "dashboard" && stats && (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] text-neutral-400 mb-1.5">참여자</p>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="전체" value={stats.participants.total} />
                <Metric label="🛵 직접배달" value={stats.participants.delivery} />
                <Metric label="💌 마음배송" value={stats.participants.heart} />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-neutral-400 mb-1.5">주문 상태</p>
              <div className="grid grid-cols-4 gap-2">
                <Metric label="대기중" value={stats.deliveries.waiting} />
                <Metric label="확정" value={stats.deliveries.confirmed} />
                <Metric label="완료" value={stats.deliveries.done} />
                <Metric label="취소" value={stats.deliveries.canceled} muted />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-neutral-400 mb-1.5">기타</p>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="대기자" value={stats.waiting} />
                <Metric label="📸 하객 스냅" value={stats.snaps} />
              </div>
            </div>
            {/* 현장 체크인 (GX-4) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] text-neutral-400">현장 체크인 (식수)</p>
                <div className="flex gap-2">
                  <a
                    href="/checkin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-sage-600 underline underline-offset-2"
                  >
                    체크인 열기
                  </a>
                  <a
                    href="/checkin-qr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-sage-600 underline underline-offset-2"
                  >
                    🖨️ QR 인쇄
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="🍽️ 참석 인원" value={stats.checkin?.people ?? 0} />
                <Metric label="체크인 팀" value={stats.checkin?.checkins ?? 0} />
              </div>
            </div>
          </div>
        )}

        {/* ===== 주문 ===== */}
        {view === "orders" && (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {STATUS_TABS.map((t) => (
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

                    {/* 주문 합치기 (활성 주문만) */}
                    {r.status !== "취소" && r.status !== "완료" && (
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
                        {mergeSource === null ? (
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
                        )}
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
        )}

        {/* ===== 캘린더 ===== */}
        {view === "calendar" && (
          <div className="space-y-6">
            {/* 이번 주 일정 + .ics */}
            {(() => {
              const [ws, we] = thisWeekRange();
              const week = allRows
                .filter((r) => r.status !== "취소" && r.date >= ws && r.date <= we)
                .sort((a, b) => a.date.localeCompare(b.date));
              return (
                <div className="bg-white border border-wedding-gold/15 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-sage-700">이번 주 일정</p>
                    <button
                      onClick={downloadIcs}
                      className="text-xs px-3 py-1.5 border border-sage-300 text-sage-600"
                    >
                      .ics 내보내기
                    </button>
                  </div>
                  {week.length === 0 ? (
                    <p className="text-xs text-neutral-400">이번 주 일정이 없습니다.</p>
                  ) : (
                    <ul className="space-y-1">
                      {week.map((r) => (
                        <li key={r.id} className="text-xs text-neutral-600">
                          {formatYmdKo(r.date)} · {r.time_slot} · {ownerName(r)} 👥
                          {r.participants?.length ?? 0}명 ({r.status})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-center gap-3 text-[11px] text-neutral-500 flex-wrap">
              <Legend color="bg-sage-500" label="주문 있음 (숫자=팀 수)" />
              <Legend color="bg-neutral-700" label="마감됨 🚫" />
            </div>
            <p className="text-[11px] text-neutral-400 text-center">
              날짜를 눌러 여러 개 선택한 뒤 한 번에 마감/해제 — 주문이 있는 날도 마감할 수
              있어요 (기존 주문 유지, 신규 신청만 차단)
            </p>

            {selected.size > 0 && (
              <div className="sticky top-2 z-10 flex justify-center gap-2 bg-white/95 border border-wedding-gold/20 rounded-full px-3 py-2 shadow-sm">
                <span className="text-xs text-neutral-500 self-center">
                  {selected.size}개 선택
                </span>
                <button
                  onClick={() => applyBlock(true)}
                  className="px-3 py-1.5 text-xs bg-neutral-700 text-white rounded-full"
                >
                  마감 🚫
                </button>
                <button
                  onClick={() => applyBlock(false)}
                  className="px-3 py-1.5 text-xs bg-sage-600 text-white rounded-full"
                >
                  해제 ✅
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="px-3 py-1.5 text-xs border border-neutral-200 text-neutral-500 rounded-full"
                >
                  취소
                </button>
              </div>
            )}
            {CAL_MONTHS.map((month) => {
              const offset = new Date(CAL_YEAR, month, 1).getDay();
              const days = new Date(CAL_YEAR, month + 1, 0).getDate();
              const cells: (string | null)[] = Array(offset).fill(null);
              for (let d = 1; d <= days; d++)
                cells.push(toYmd(new Date(CAL_YEAR, month, d)));
              return (
                <div key={month} className="bg-white border border-wedding-gold/15 p-3">
                  <p className="font-serif text-sm text-sage-700 text-center mb-2">
                    {CAL_YEAR}. {String(month + 1).padStart(2, "0")}
                  </p>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEK.map((w) => (
                      <div key={w} className="text-[10px] text-neutral-400 py-1">
                        {w}
                      </div>
                    ))}
                    {cells.map((ymd, i) =>
                      ymd === null ? (
                        <div key={`b${i}`} />
                      ) : (
                        (() => {
                          const list = byDate[ymd] ?? [];
                          const isBlocked = blocked.has(ymd);
                          const isSelected = selected.has(ymd);
                          const color = isBlocked
                            ? "bg-neutral-700 text-white"
                            : list.length > 0
                            ? "bg-sage-500 text-white"
                            : "bg-transparent text-neutral-300 hover:bg-neutral-100";
                          const title = [
                            ...list.map(
                              (r) =>
                                `${ownerName(r)} 외 ${Math.max(0, (r.participants?.length ?? 1) - 1)}명 · ${r.time_slot} · ${r.status}`
                            ),
                            isBlocked ? "마감됨 🚫" : null,
                          ]
                            .filter(Boolean)
                            .join(" / ");
                          return (
                            <button
                              key={ymd}
                              type="button"
                              onClick={() => toggleSelect(ymd)}
                              title={title || "선택 후 마감"}
                              className={`relative aspect-square rounded-md text-[11px] flex items-center justify-center ${color} ${
                                isSelected
                                  ? "ring-2 ring-delivery ring-offset-1 font-bold"
                                  : ""
                              }`}
                            >
                              {Number(ymd.slice(-2))}
                              {list.length > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-delivery text-white text-[8px] font-bold flex items-center justify-center">
                                  {list.length}
                                </span>
                              )}
                            </button>
                          );
                        })()
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== 배송경로 ===== */}
        {view === "route" && (
          <div className="space-y-4">
            <p className="text-[11px] text-neutral-400 text-center">
              배송할 주문(대기중·확정)을 날짜별로 묶고, 식장 기준 가까운 순서로 정렬했어요.
              번호대로 돌면 효율적이에요. (주소는 카카오로 자동 위치 변환)
            </p>

            {!loading && routeDays.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                배송할 주문이 없습니다.
              </p>
            )}

            {routeDays.length > 0 && (
              <>
                <div className="flex flex-wrap justify-center gap-2">
                  {routeDays.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => setRouteDate(d.date)}
                      className={`px-3 py-1.5 text-xs border ${
                        routeDate === d.date
                          ? "bg-sage-600 text-white border-sage-600"
                          : "bg-white text-neutral-500 border-wedding-gold/20"
                      }`}
                    >
                      {formatYmdKo(d.date)} · {d.count}건
                    </button>
                  ))}
                </div>

                {(() => {
                  const day = routeDays.find((d) => d.date === routeDate);
                  if (!day || !routeOrigin) return null;
                  return (
                    <>
                      <RouteMap stops={day.stops} origin={routeOrigin} />
                      <ol className="space-y-2">
                        {day.stops.map((s) => {
                          const noGeo = s.lat == null || s.lng == null;
                          return (
                            <li
                              key={s.id}
                              className="bg-white border border-wedding-gold/15 p-3 flex gap-3 text-sm"
                            >
                              <span
                                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  noGeo
                                    ? "bg-neutral-200 text-neutral-500"
                                    : "bg-delivery text-white"
                                }`}
                              >
                                {noGeo ? "?" : s.order}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sage-700">
                                  {s.name}
                                  {s.count > 1 && (
                                    <span className="text-[11px] text-neutral-400 font-normal">
                                      {" "}
                                      외 {s.count - 1}명
                                    </span>
                                  )}
                                  <span className="text-[11px] text-neutral-400 font-normal">
                                    {" · "}
                                    {s.time_slot} · {s.tracking_stage}
                                  </span>
                                </p>
                                <p className="text-xs text-neutral-500 break-words">
                                  📍 {s.location}
                                  {noGeo && (
                                    <span className="text-red-400"> (위치 못 찾음)</span>
                                  )}
                                </p>
                                <div className="flex gap-3 mt-1 text-[11px]">
                                  {s.phone && (
                                    <a
                                      href={`tel:${s.phone}`}
                                      className="text-delivery underline"
                                    >
                                      {s.phone}
                                    </a>
                                  )}
                                  <a
                                    href={`https://map.kakao.com/?q=${encodeURIComponent(
                                      s.location
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sage-600 underline"
                                  >
                                    카카오맵 열기
                                  </a>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ===== 그룹 ===== */}
        {view === "groups" && (
          <GroupsTab
            api={api}
            setError={setError}
            setNotice={setNotice}
            groups={groups}
            totalMembers={totalMembers}
            reload={loadGroups}
            bumpRoster={bumpRoster}
          />
        )}

        {/* ===== 대기자 ===== */}
        {view === "waiting" && (
          <WaitingTab api={api} setError={setError} setNotice={setNotice} />
        )}

        {/* ===== 방명록(마음 배송) ===== */}
        {view === "messages" && (
          <MessagesTab
            api={api}
            setError={setError}
            setNotice={setNotice}
            groupName={groupName}
          />
        )}

        {/* ===== 하객 스냅 ===== */}
        {view === "snap" && (
          <SnapTab api={api} setError={setError} setNotice={setNotice} />
        )}

        {/* ===== 콘텐츠 (청첩장 사진/영상) ===== */}
        {view === "content" && (
          <ContentTab api={api} setError={setError} setNotice={setNotice} />
        )}
      </div>
    </main>
  );
}

