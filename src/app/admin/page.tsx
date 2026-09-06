"use client";

import { useEffect, useState } from "react";
import type { Group } from "@/lib/supabase";
import FieldOps from "@/components/admin/FieldOps";
import OrdersTab from "@/components/admin/OrdersTab";
import CalendarTab from "@/components/admin/CalendarTab";
import RouteTab from "@/components/admin/RouteTab";
import WaitingTab from "@/components/admin/WaitingTab";
import MessagesTab from "@/components/admin/MessagesTab";
import SnapTab from "@/components/admin/SnapTab";
import ContentTab from "@/components/admin/ContentTab";
import GroupsTab from "@/components/admin/GroupsTab";
import { Metric } from "@/components/admin/ui";
import { type AdminStats, type View } from "@/app/admin/shared";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<View>("orders");

  const [groups, setGroups] = useState<Group[]>([]);
  /** 전체 등록인원 (취소 주문 참여자 제외, 그룹 미지정 포함) */
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 알림 채널 연결 상태 — 채널마다 실패 값이 다르다 (카카오 expired / 텔레그램 error) */
  const [notify, setNotify] = useState<{
    status: "ok" | "expired" | "error" | "unconfigured" | null;
    channel: string;
  } | null>(null);

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

  /** 로그인 성공/세션 확인 후 공통 진입 처리 */
  const enter = async () => {
    setAuthed(true);
    await loadGroups(); // 주문 필터·그룹명 표시 공용 (주문 목록은 OrdersTab 이 자체 로드)
    // 알림 채널 연결 상태 (고장 사전 경고)
    api("/api/admin/kakao-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setNotify({ status: j.status, channel: j.channel }));
  };

  // 새로고침 시 세션 쿠키(8시간)가 살아 있으면 재로그인 없이 바로 진입
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // api() 는 401 에 "세션 만료" 안내를 띄우므로 최초 확인은 raw fetch
        const res = await fetch("/api/admin/login");
        if (alive && res.ok) await enter();
      } catch {
        /* 미로그인/네트워크 오류 → 로그인 화면 유지 */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "비밀번호가 올바르지 않습니다.");
        return;
      }
      await enter();
    } finally {
      setLoading(false);
    }
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
                // 주문·캘린더·경로·대기자·방명록·스냅·콘텐츠 탭은 마운트 시 자체 로드
                if (v === "dashboard") loadStats();
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

        {(notify?.status === "expired" || notify?.status === "error") && (
          <p className="text-xs text-center text-red-600 bg-red-50 py-2 border border-red-200">
            🔔 알림 연결이 끊겼어요 — 새 주문 알림이 오지 않습니다.{" "}
            {notify.channel === "kakao"
              ? "카카오 refresh token 재발급이 필요해요 (src/lib/kakao.ts 참고)."
              : "봇 토큰을 확인해주세요 (src/lib/telegram.ts 참고)."}
          </p>
        )}
        {notify?.status === "unconfigured" && (
          <p className="text-xs text-center text-red-600 bg-red-50 py-2 border border-red-200">
            🔔 알림 채널이 설정되지 않았어요 — 새 주문 알림이 발송되지 않습니다.
          </p>
        )}
        {notify?.status === "ok" && (
          <p className="text-[11px] text-center text-sage-500">
            🔔 {notify.channel === "telegram" ? "텔레그램" : "카카오"} 알림 연결됨
          </p>
        )}

        {/* 알림 배너 — 목록을 내려본 상태에서 작업해도 보이도록 화면 상단에 고정.
            (기존에는 페이지 최상단 고정 위치라 스크롤 후 작업하면 화면 밖이었다) */}
        {(notice || error) && (
          <div className="sticky top-2 z-40 space-y-1">
            {notice && (
              <p className="flex items-start gap-2 text-xs text-sage-700 bg-sage-50 py-2 px-3 border border-sage-200 shadow-sm">
                <span className="flex-1">{notice}</span>
                <button
                  onClick={() => setNotice(null)}
                  aria-label="알림 닫기"
                  className="shrink-0 text-sage-400 leading-none"
                >
                  ✕
                </button>
              </p>
            )}
            {error && (
              <p className="flex items-start gap-2 text-xs text-red-600 bg-red-50 py-2 px-3 border border-red-200 shadow-sm">
                <span className="flex-1">⚠️ {error}</span>
                <button
                  onClick={() => setError(null)}
                  aria-label="오류 닫기"
                  className="shrink-0 text-red-400 leading-none"
                >
                  ✕
                </button>
              </p>
            )}
          </div>
        )}
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
          <OrdersTab
            api={api}
            setError={setError}
            setNotice={setNotice}
            groups={groups}
            groupName={groupName}
          />
        )}

        {/* ===== 캘린더 ===== */}
        {view === "calendar" && (
          <CalendarTab api={api} setError={setError} setNotice={setNotice} />
        )}

        {/* ===== 배송경로 ===== */}
        {view === "route" && (
          <RouteTab api={api} setError={setError} setNotice={setNotice} />
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

