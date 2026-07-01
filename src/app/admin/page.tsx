"use client";

import { useMemo, useState } from "react";
import type {
  Delivery,
  DeliveryStatus,
  TrackingStage,
  Group,
  GroupMemberRow,
  WaitingEntry,
  Message,
} from "@/lib/supabase";
import { TRACKING_STAGES } from "@/lib/supabase";
import { formatYmdKo, toYmd } from "@/lib/wedding";

/** 이번 주(일~토) 범위의 YMD */
function thisWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toYmd(start), toYmd(end)];
}

/** 활성 배달들을 .ics 캘린더 문자열로 */
function buildIcs(rows: Delivery[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cheong//delivery//KO",
  ];
  for (const r of rows) {
    if (r.status === "취소") continue;
    const d = r.date.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@cheong`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:청첩장배달 - ${r.name} (${r.time_slot})`,
      `DESCRIPTION:${r.location} / ${r.party_size ?? 1}명 / ${r.status}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const STATUS_TABS: DeliveryStatus[] = ["대기중", "확정", "완료", "취소"];
const NEXT_ACTION: Record<DeliveryStatus, DeliveryStatus | null> = {
  대기중: "확정",
  확정: "완료",
  완료: null,
  취소: null,
};
type View = "orders" | "calendar" | "groups" | "waiting" | "messages";

const CAL_MONTHS = [6, 7, 8, 9]; // 7~10월(0-base)
const CAL_YEAR = 2026;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<View>("orders");

  const [tab, setTab] = useState<DeliveryStatus>("대기중");
  const [groupFilter, setGroupFilter] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Delivery[]>([]);
  const [allRows, setAllRows] = useState<Delivery[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newGroup, setNewGroup] = useState("");

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, GroupMemberRow[]>>({});
  const [newMember, setNewMember] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const groupName = (id: string | null) =>
    id ? groups.find((g) => g.id === id)?.name ?? "그룹" : "—";

  // 쿠키 세션으로 인증 — 비밀번호는 로그인 시 1회만 전송
  const api = (path: string, init?: RequestInit) =>
    fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

  const loadGroups = async () => {
    const res = await api("/api/admin/groups");
    if (res.ok) setGroups((await res.json()).groups ?? []);
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
      if (res.status === 401) {
        setError("세션이 만료되었습니다. 다시 로그인해주세요.");
        setAuthed(false);
        return;
      }
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "불러오기 실패");
      setRows(j.deliveries ?? []);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendar = async () => {
    setLoading(true);
    const res = await api("/api/admin/deliveries");
    if (res.ok) setAllRows((await res.json()).deliveries ?? []);
    setLoading(false);
  };

  const loadWaiting = async () => {
    setLoading(true);
    const res = await api("/api/admin/waiting");
    const j = await res.json();
    setWaiting(res.ok ? j.waiting ?? [] : []);
    setLoading(false);
  };

  const loadMessages = async () => {
    setLoading(true);
    const res = await api("/api/admin/messages");
    const j = await res.json();
    setMessages(res.ok ? j.messages ?? [] : []);
    setLoading(false);
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
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (id: string, status: DeliveryStatus) => {
    setNotice(null);
    const res = await api(`/api/admin/deliveries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "변경 실패");
    if (status === "확정" || status === "취소") {
      const sms = j.sms;
      const label = status === "확정" ? "확정" : "취소";
      setNotice(
        sms?.skipped
          ? `${label} 처리됨 — SMS는 솔라피 키 미설정으로 미발송.`
          : sms?.ok
          ? `${label} 처리 및 SMS 발송 완료.`
          : `${label} 처리됨 — SMS 실패: ${sms?.error ?? ""}`
      );
    }
    loadOrders();
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

  const createGroup = async () => {
    if (!newGroup.trim()) return;
    const res = await api("/api/admin/groups", {
      method: "POST",
      body: JSON.stringify({ name: newGroup.trim() }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "그룹 생성 실패");
    setNewGroup("");
    loadGroups();
  };

  const copyLink = (slug: string) => {
    navigator.clipboard?.writeText(
      `${window.location.origin}/delivery/group/${slug}`
    );
    setNotice("그룹 링크가 복사되었습니다.");
  };

  const toggleMembers = async (gid: string) => {
    if (openGroup === gid) return setOpenGroup(null);
    setOpenGroup(gid);
    const res = await api(`/api/admin/groups/${gid}/members`);
    if (res.ok) {
      const j = await res.json();
      setMembers((m) => ({ ...m, [gid]: j.members ?? [] }));
    }
  };

  const addMember = async (gid: string) => {
    if (!newMember.trim()) return;
    const res = await api(`/api/admin/groups/${gid}/members`, {
      method: "POST",
      body: JSON.stringify({ name: newMember.trim() }),
    });
    if (res.ok) {
      setNewMember("");
      const list = await api(`/api/admin/groups/${gid}/members`);
      if (list.ok) {
        const j = await list.json();
        setMembers((m) => ({ ...m, [gid]: j.members ?? [] }));
      }
    }
  };

  const removeMember = async (gid: string, memberId: string) => {
    const res = await api(
      `/api/admin/groups/${gid}/members?member_id=${memberId}`,
      { method: "DELETE" }
    );
    if (res.ok)
      setMembers((m) => ({
        ...m,
        [gid]: (m[gid] ?? []).filter((x) => x.id !== memberId),
      }));
  };

  const deleteWaiting = async (id: string) => {
    const res = await api(`/api/admin/waiting/${id}`, { method: "DELETE" });
    if (res.ok) setWaiting((w) => w.filter((x) => x.id !== id));
  };

  const notifyWaiting = async (id?: string) => {
    setNotice(null);
    setError(null);
    const who = id ? "선택한 대기자" : `대기자 ${waiting.length}명`;
    if (!confirm(`${who}에게 빈자리 안내 SMS를 보낼까요?`)) return;
    const res = await api("/api/admin/waiting/notify", {
      method: "POST",
      body: JSON.stringify(id ? { id } : {}),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "알림 발송 실패");
    setNotice(
      j.skipped
        ? `${j.count}명 대상 — SMS는 솔라피 키 미설정으로 미발송(로그만).`
        : `${j.sent}/${j.count}명에게 빈자리 안내 SMS 발송 완료.`
    );
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // 캘린더용: 날짜 → 활성(취소 제외) 신청
  const byDate = useMemo(() => {
    const m: Record<string, Delivery> = {};
    for (const r of allRows) if (r.status !== "취소") m[r.date] = r;
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="관리자 비밀번호"
            className="w-full p-3 border border-wedding-gold/25 bg-transparent focus:outline-none focus:border-sage-600 text-sm text-sage-700 rounded-none"
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
              ["orders", "주문"],
              ["calendar", "캘린더"],
              ["groups", "그룹"],
              ["waiting", "대기자"],
              ["messages", "방명록"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if (v === "orders") loadOrders();
                if (v === "calendar") loadCalendar();
                if (v === "groups") loadGroups();
                if (v === "waiting") loadWaiting();
                if (v === "messages") loadMessages();
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

        {notice && (
          <p className="text-xs text-center text-sage-700 bg-sage-50 py-2 border border-sage-200">
            {notice}
          </p>
        )}
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        {loading && (
          <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
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

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 · 연락처 검색"
              className="w-full p-2.5 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
            />

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
                          {r.name}{" "}
                          <span className="text-xs text-neutral-400 font-normal">
                            {r.phone}
                          </span>
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatYmdKo(r.date)} · {r.time_slot} · {r.location}
                        </p>
                        <p className="text-[11px] text-neutral-400">
                          👥 {r.party_size ?? 1}명 · 📦 {groupName(r.group_id)}
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

                    {/* 리뷰 (배송 완료 후) */}
                    {r.review_rating != null && (
                      <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-sm">
                        <p className="text-xs text-amber-600">
                          {"⭐".repeat(r.review_rating)}
                          {r.review_text && (
                            <span className="text-neutral-500">
                              {" "}
                              “{r.review_text}”
                            </span>
                          )}
                        </p>
                      </div>
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

                    {(nextAction || cancelable) && (
                      <div className="flex justify-end gap-2">
                        {cancelable && (
                          <button
                            onClick={() => changeStatus(r.id, "취소")}
                            className="px-3 py-1.5 text-xs border border-red-200 text-red-400"
                          >
                            취소 (SMS)
                          </button>
                        )}
                        {nextAction && (
                          <button
                            onClick={() => changeStatus(r.id, nextAction)}
                            className="px-3 py-1.5 text-xs bg-sage-600 text-white tracking-wide"
                          >
                            {nextAction}으로 변경
                            {nextAction === "확정" ? " (SMS)" : ""}
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
                          {formatYmdKo(r.date)} · {r.time_slot} · {r.name} ({r.status})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-center gap-3 text-[11px] text-neutral-500">
              <Legend color="bg-amber-300" label="대기중" />
              <Legend color="bg-sage-500" label="확정" />
              <Legend color="bg-neutral-300" label="완료" />
            </div>
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
                          const r = byDate[ymd];
                          const color = !r
                            ? "bg-transparent text-neutral-300"
                            : r.status === "대기중"
                            ? "bg-amber-300 text-white"
                            : r.status === "확정"
                            ? "bg-sage-500 text-white"
                            : "bg-neutral-300 text-white";
                          return (
                            <div
                              key={ymd}
                              title={r ? `${r.name} · ${r.time_slot} · ${r.status}` : ""}
                              className={`aspect-square rounded-md text-[11px] flex items-center justify-center ${color}`}
                            >
                              {Number(ymd.slice(-2))}
                            </div>
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

        {/* ===== 그룹 ===== */}
        {view === "groups" && (
          <>
            <div className="flex gap-2">
              <input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="새 그룹명 (예: 대학 친구들)"
                className="flex-1 p-3 border border-wedding-gold/25 bg-white text-sm rounded-none focus:outline-none focus:border-sage-600"
              />
              <button
                onClick={createGroup}
                className="px-4 bg-sage-700 text-white text-xs tracking-wider"
              >
                생성
              </button>
            </div>

            {groups.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-8">
                아직 그룹이 없습니다.
              </p>
            )}

            <div className="space-y-3">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="bg-white border border-wedding-gold/15 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sage-700 text-sm">{g.name}</p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        /delivery/group/{g.slug}
                      </p>
                    </div>
                    <div className="flex gap-2 whitespace-nowrap">
                      <button
                        onClick={() => toggleMembers(g.id)}
                        className="px-3 py-1.5 text-xs border border-wedding-gold/30 text-neutral-500"
                      >
                        명단 {openGroup === g.id ? "▲" : "▼"}
                      </button>
                      <button
                        onClick={() => copyLink(g.slug)}
                        className="px-3 py-1.5 text-xs border border-sage-300 text-sage-600"
                      >
                        링크 복사
                      </button>
                    </div>
                  </div>

                  {openGroup === g.id && (
                    <div className="border-t border-wedding-gold/10 pt-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={newMember}
                          onChange={(e) => setNewMember(e.target.value)}
                          placeholder="멤버 이름 추가"
                          className="flex-1 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                        />
                        <button
                          onClick={() => addMember(g.id)}
                          className="px-3 bg-sage-600 text-white text-xs"
                        >
                          추가
                        </button>
                      </div>
                      <ul className="space-y-1">
                        {(members[g.id] ?? []).map((mem) => (
                          <li
                            key={mem.id}
                            className="flex items-center justify-between text-sm text-neutral-600 px-1"
                          >
                            <span>{mem.name}</span>
                            <button
                              onClick={() => removeMember(g.id, mem.id)}
                              className="text-xs text-red-400"
                            >
                              삭제
                            </button>
                          </li>
                        ))}
                        {(members[g.id] ?? []).length === 0 && (
                          <li className="text-xs text-neutral-400 px-1">
                            명단 없음 (등록 시 그룹 페이지에 미신청 표시)
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 대기자 ===== */}
        {view === "waiting" && (
          <>
            {!loading && waiting.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                대기자가 없습니다.
              </p>
            )}
            {waiting.length > 0 && (
              <button
                onClick={() => notifyWaiting()}
                className="w-full py-2.5 text-xs tracking-wider bg-delivery text-white rounded-sm"
              >
                📣 대기자 전체에게 빈자리 안내 SMS
              </button>
            )}
            <div className="space-y-2">
              {waiting.map((w, i) => (
                <div
                  key={w.id}
                  className="bg-white border border-wedding-gold/15 p-3 flex items-center gap-3 text-sm"
                >
                  <span className="text-xs text-neutral-400 w-6 text-center">
                    {i + 1}
                  </span>
                  <span className="font-medium text-sage-700">{w.name}</span>
                  <span className="text-xs text-neutral-400 ml-auto">
                    {w.phone}
                  </span>
                  <button
                    onClick={() => notifyWaiting(w.id)}
                    className="text-xs text-delivery"
                  >
                    알림
                  </button>
                  <button
                    onClick={() => deleteWaiting(w.id)}
                    className="text-xs text-red-400"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 방명록(마음 배송) ===== */}
        {view === "messages" && (
          <>
            {!loading && messages.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                받은 메시지가 없습니다.
              </p>
            )}
            <div className="space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="bg-white border border-wedding-gold/15 p-3 flex gap-3 text-sm"
                >
                  <span className="text-xl shrink-0">{m.stamp ?? "💌"}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sage-700">
                      {m.name}{" "}
                      <span className="text-[11px] text-neutral-400 font-normal">
                        {groupName(m.group_id)}
                      </span>
                    </p>
                    {m.message && (
                      <p className="text-xs text-neutral-500 break-words">{m.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-3 h-3 rounded-sm ${color}`} /> {label}
    </span>
  );
}
