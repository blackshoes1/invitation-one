"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 관리자 — 현장 운영 탭 (docs/CHECKIN_SEATING_SPEC.md §6, §5.2, §13)
 * 예식 당일 안내데스크·관리자용: 통계 / 검색·필터 / 수동 체크인 / 인원 수정 /
 * 취소 / 현장 등록 / 좌석 배정 / QR 재발급 / CSV.
 * 모바일 우선 · 검색창 상단 고정 · 15초 자동 새로고침.
 */

const SIDE_LABEL: Record<string, string> = { groom: "신랑측", bride: "신부측", common: "공통" };
const SOURCE_LABEL: Record<string, string> = {
  personal_qr: "개인QR",
  common_qr: "공용QR",
  admin: "관리자",
  walk_in: "현장",
  legacy: "레거시",
};

interface CheckinRow {
  id: string;
  rsvp_id: string | null;
  name: string | null;
  side: string | null;
  expected_party_size: number | null;
  actual_party_size: number | null;
  meal_count: number | null;
  source: string | null;
  status: string;
  admin_memo: string | null;
  created_at: string;
}
interface RsvpRow {
  id: string;
  name: string;
  phone: string | null;
  side: string | null;
  attending: boolean;
  expected_party_size: number;
  eating: string | null;
  kids_meal: boolean;
  table_id: string | null;
  checkin_token_active: boolean;
  checkin: CheckinRow | null;
}
interface TableRow {
  id: string;
  name: string;
  zone: string | null;
  side: string | null;
  capacity: number;
  floor: string | null;
  location_note: string | null;
  sort_order: number;
  active: boolean;
}
interface Stats {
  expectedTeams: number;
  expectedPeople: number;
  arrivedTeams: number;
  arrivedPeople: number;
  notArrivedTeams: number;
  partyDiff: number;
  walkInPeople: number;
  legacyPeople: number;
  groomArrived: number;
  brideArrived: number;
  mealPlanned: number;
  mealUndecided: number;
  kidsMealTeams: number;
  mealActual: number;
}

type Filter =
  | "all"
  | "arrived"
  | "pending"
  | "walkin"
  | "diff"
  | "noseat"
  | "groom"
  | "bride";

const FILTERS: [Filter, string][] = [
  ["all", "전체"],
  ["pending", "미도착"],
  ["arrived", "도착"],
  ["walkin", "현장 등록"],
  ["diff", "인원 변경"],
  ["noseat", "좌석 미배정"],
  ["groom", "신랑측"],
  ["bride", "신부측"],
];

export default function FieldOps() {
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seatTab, setSeatTab] = useState(false);

  // 현장 등록 폼
  const [wOpen, setWOpen] = useState(false);
  const [wName, setWName] = useState("");
  const [wSide, setWSide] = useState<"groom" | "bride" | null>(null);
  const [wParty, setWParty] = useState(1);

  // 체크인 운영 시간 (§10 — 서버 전용 site_settings 키)
  const [ckEnabled, setCkEnabled] = useState(false);
  const [ckOpen, setCkOpen] = useState("");
  const [ckClose, setCkClose] = useState("");
  const [ckLoaded, setCkLoaded] = useState(false);

  // 테이블 생성 폼
  const [tName, setTName] = useState("");
  const [tZone, setTZone] = useState("");
  const [tSide, setTSide] = useState<string>("");
  const [tCap, setTCap] = useState(10);
  const [tNote, setTNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/checkins");
    if (!res.ok) return;
    const j = await res.json();
    setRsvps(j.rsvps ?? []);
    setCheckins(j.checkins ?? []);
    setTables(j.tables ?? []);
    setStats(j.stats ?? null);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // 새로고침 없이 통계 반영 (§13)
    return () => clearInterval(t);
  }, [load]);

  // 운영 시간 설정 로드 (1회)
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) return;
      const j = await res.json();
      const s = j.settings ?? {};
      setCkEnabled(s.checkin_enabled === true);
      // datetime-local 형식 (로컬 기준 YYYY-MM-DDTHH:mm)
      const toLocal = (v: unknown) => {
        if (typeof v !== "string") return "";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "";
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
      };
      setCkOpen(toLocal(s.checkin_open_at));
      setCkClose(toLocal(s.checkin_close_at));
      setCkLoaded(true);
    })();
  }, []);

  const saveWindow = async () => {
    if (busy) return;
    setBusy("window");
    try {
      const put = (key: string, value: unknown) =>
        fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
      const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
      const results = await Promise.all([
        put("checkin_enabled", ckEnabled),
        put("checkin_open_at", toIso(ckOpen)),
        put("checkin_close_at", toIso(ckClose)),
      ]);
      flash(results.every((r) => r.ok) ? "운영 시간을 저장했어요" : "⚠ 일부 저장 실패");
    } finally {
      setBusy(null);
    }
  };

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  };

  const act = async (key: string, fn: () => Promise<Response>, okMsg: string) => {
    if (busy) return;
    setBusy(key);
    try {
      const res = await fn();
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        flash(okMsg);
        await load();
      } else {
        flash(`⚠ ${j.error ?? "실패했어요"}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const tableName = (id: string | null) =>
    id ? tables.find((t) => t.id === id)?.name ?? "?" : null;

  /* ----- 목록 필터링 (§6) ----- */
  const attending = useMemo(() => rsvps.filter((r) => r.attending), [rsvps]);
  const walkins = useMemo(
    () => checkins.filter((c) => !c.rsvp_id && c.status === "active"),
    [checkins]
  );

  const list = useMemo(() => {
    const q = search.trim();
    const qDigits = q.replace(/\D/g, "");
    const match = (name: string | null, phone?: string | null) =>
      (name ?? "").includes(q) ||
      (qDigits.length >= 2 &&
        (phone ?? "").replace(/\D/g, "").includes(qDigits));

    let rows = attending;
    if (filter === "arrived") rows = rows.filter((r) => r.checkin);
    if (filter === "pending") rows = rows.filter((r) => !r.checkin);
    if (filter === "diff")
      rows = rows.filter(
        (r) =>
          r.checkin &&
          (r.checkin.actual_party_size ?? 0) !==
            (r.checkin.expected_party_size ?? r.expected_party_size)
      );
    if (filter === "noseat") rows = rows.filter((r) => !r.table_id);
    if (filter === "groom") rows = rows.filter((r) => r.side === "groom");
    if (filter === "bride") rows = rows.filter((r) => r.side === "bride");
    if (q) rows = rows.filter((r) => match(r.name, r.phone));
    return rows;
  }, [attending, filter, search]);

  const shownWalkins = useMemo(() => {
    if (filter !== "all" && filter !== "walkin") return [];
    const q = search.trim();
    return q ? walkins.filter((c) => (c.name ?? "").includes(q)) : walkins;
  }, [walkins, filter, search]);

  /* ----- 액션 ----- */
  const manualCheckin = (r: RsvpRow) => {
    const input = prompt(
      `${r.name}님 수동 체크인 — 실제 인원을 입력하세요 (예상 ${r.expected_party_size}명)`,
      String(r.expected_party_size)
    );
    if (input === null) return;
    const n = Math.trunc(Number(input));
    if (!Number.isFinite(n) || n < 1 || n > 20) return flash("⚠ 1~20 사이로 입력해 주세요");
    act(
      `ck-${r.id}`,
      () =>
        fetch("/api/admin/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rsvpId: r.id, actualPartySize: n }),
        }),
      `${r.name}님 체크인 완료`
    );
  };

  const editParty = (c: CheckinRow) => {
    const input = prompt("실제 인원 수정", String(c.actual_party_size ?? 1));
    if (input === null) return;
    const n = Math.trunc(Number(input));
    if (!Number.isFinite(n) || n < 1 || n > 20) return flash("⚠ 1~20 사이로 입력해 주세요");
    act(
      `edit-${c.id}`,
      () =>
        fetch(`/api/admin/checkins/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actualPartySize: n, mealCount: Math.min(c.meal_count ?? n, n) }),
        }),
      "인원을 수정했어요"
    );
  };

  const cancelCheckin = (c: CheckinRow, label: string) => {
    // 위험 작업 — 확인 절차 (§13)
    if (!confirm(`${label} 체크인을 취소할까요?\n기록은 삭제되지 않고 취소 상태로 보존됩니다.`)) return;
    act(
      `cancel-${c.id}`,
      () => fetch(`/api/admin/checkins/${c.id}`, { method: "DELETE" }),
      "체크인을 취소했어요"
    );
  };

  const issuePass = async (r: RsvpRow) => {
    if (r.checkin && !confirm("이미 체크인한 하객입니다.\nQR 을 재발급해도 기존 체크인 기록은 유지됩니다.\n재발급할까요?"))
      return;
    if (busy) return;
    setBusy(`pass-${r.id}`);
    try {
      const res = await fetch(`/api/admin/rsvp/${r.id}/issue-pass`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.passUrl) {
        const abs = `${window.location.origin}${j.passUrl}`;
        try {
          await navigator.clipboard.writeText(abs);
          flash("새 QR 링크를 복사했어요 (기존 링크는 무효화됨)");
        } catch {
          prompt("새 QR 링크 (기존 링크는 무효화됨)", abs);
        }
        await load();
      } else flash(`⚠ ${j.error ?? "재발급 실패"}`);
    } finally {
      setBusy(null);
    }
  };

  const assignSeat = (r: RsvpRow) => {
    const activeTables = tables.filter((t) => t.active);
    if (activeTables.length === 0) return flash("⚠ 먼저 테이블을 만들어 주세요");
    const menu = activeTables
      .map((t, i) => `${i + 1}. ${t.name}${t.zone ? ` (${t.zone})` : ""}`)
      .join("\n");
    const input = prompt(
      `${r.name}님 좌석 배정 — 번호 입력 (0 = 배정 해제)\n${menu}`,
      ""
    );
    if (input === null) return;
    const n = Math.trunc(Number(input));
    if (!Number.isFinite(n) || n < 0 || n > activeTables.length)
      return flash("⚠ 목록의 번호를 입력해 주세요");
    const tableId = n === 0 ? null : activeTables[n - 1].id;
    act(
      `seat-${r.id}`,
      () =>
        fetch(`/api/admin/rsvp/${r.id}/seat`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableId }),
        }).then(async (res) => {
          const j = await res.clone().json().catch(() => ({}));
          if (res.ok && j.overCapacity) flash("⚠ 배정 완료 — 정원 초과 상태예요");
          return res;
        }),
      tableId ? "좌석을 배정했어요" : "배정을 해제했어요"
    );
  };

  const addWalkin = () => {
    if (wName.trim().length < 2) return flash("⚠ 성함을 입력해 주세요");
    act(
      "walkin",
      () =>
        fetch("/api/admin/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: wName.trim(),
            side: wSide,
            actualPartySize: wParty,
          }),
        }),
      "현장 하객을 등록했어요"
    ).then(() => {
      setWName("");
      setWSide(null);
      setWParty(1);
      setWOpen(false);
    });
  };

  const addTable = () => {
    if (!tName.trim()) return flash("⚠ 테이블명을 입력해 주세요");
    act(
      "table-add",
      () =>
        fetch("/api/admin/seating", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tName.trim(),
            zone: tZone.trim(),
            side: tSide || undefined,
            capacity: tCap,
            locationNote: tNote.trim(),
            sortOrder: tables.length,
          }),
        }),
      "테이블을 만들었어요"
    ).then(() => {
      setTName("");
      setTZone("");
      setTSide("");
      setTNote("");
    });
  };

  const deleteTable = (t: TableRow) => {
    if (!confirm(`'${t.name}' 테이블을 삭제할까요?`)) return;
    act(
      `table-del-${t.id}`,
      () => fetch(`/api/admin/seating/${t.id}`, { method: "DELETE" }),
      "테이블을 삭제했어요"
    );
  };

  const toggleTable = (t: TableRow) =>
    act(
      `table-tgl-${t.id}`,
      () =>
        fetch(`/api/admin/seating/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !t.active }),
        }),
      t.active ? "운영에서 숨겼어요" : "운영에 표시했어요"
    );

  /* ----- 테이블별 집계 (§5.2) ----- */
  const tableSummary = useMemo(
    () =>
      tables.map((t) => {
        const teams = attending.filter((r) => r.table_id === t.id);
        const assignedPeople = teams.reduce((s, r) => s + r.expected_party_size, 0);
        const arrivedPeople = teams.reduce(
          (s, r) => s + (r.checkin?.actual_party_size ?? 0),
          0
        );
        return { ...t, teams, assignedPeople, arrivedPeople };
      }),
    [tables, attending]
  );

  const arriveRate =
    stats && stats.expectedPeople > 0
      ? Math.round((stats.arrivedPeople / stats.expectedPeople) * 1000) / 10
      : 0;

  return (
    <div className="space-y-4">
      {notice && (
        <p className="text-xs text-center text-sage-700 bg-sage-50 py-2 border border-sage-200 sticky top-0 z-20">
          {notice}
        </p>
      )}

      {/* ===== 상단 지표 (§6) ===== */}
      {stats && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <Metric label="예정" value={`${stats.expectedPeople}명`} sub={`${stats.expectedTeams}팀`} />
            <Metric label="도착" value={`${stats.arrivedPeople}명`} sub={`${stats.arrivedTeams}팀 · ${arriveRate}%`} strong />
            <Metric label="미도착" value={`${stats.notArrivedTeams}팀`} />
            <Metric
              label="현장 추가"
              value={`+${stats.walkInPeople}명`}
              sub={stats.legacyPeople > 0 ? `레거시 ${stats.legacyPeople}명 별도` : undefined}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Metric label="신랑측 도착" value={`${stats.groomArrived}명`} />
            <Metric label="신부측 도착" value={`${stats.brideArrived}명`} />
            <Metric
              label="인원 차이"
              value={`${stats.partyDiff > 0 ? "+" : ""}${stats.partyDiff}명`}
              warn={stats.partyDiff !== 0}
            />
            <Metric label="실제 식수" value={`${stats.mealActual}명`} sub={`예정 ${stats.mealPlanned} · 미정 ${stats.mealUndecided}`} />
          </div>
        </div>
      )}

      {/* ===== 체크인 운영 시간 (§10) ===== */}
      {ckLoaded && (
        <div className="bg-white border border-wedding-gold/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-neutral-400">공개 체크인 운영</p>
            <button
              onClick={() => setCkEnabled((v) => !v)}
              className={`px-3 py-1 text-[11px] border rounded-full ${
                ckEnabled
                  ? "bg-sage-600 text-white border-sage-600"
                  : "bg-white text-neutral-400 border-wedding-gold/25"
              }`}
            >
              {ckEnabled ? "운영 중" : "닫힘"}
            </button>
          </div>
          <div className="flex gap-2 items-center text-[11px] text-neutral-400 flex-wrap">
            <label className="flex items-center gap-1">
              오픈
              <input
                type="datetime-local"
                value={ckOpen}
                onChange={(e) => setCkOpen(e.target.value)}
                className="p-1.5 border border-wedding-gold/20 rounded-md text-xs text-neutral-600"
              />
            </label>
            <label className="flex items-center gap-1">
              종료
              <input
                type="datetime-local"
                value={ckClose}
                onChange={(e) => setCkClose(e.target.value)}
                className="p-1.5 border border-wedding-gold/20 rounded-md text-xs text-neutral-600"
              />
            </label>
            <button
              onClick={saveWindow}
              disabled={busy === "window"}
              className="ml-auto px-3 py-1.5 bg-sage-700 text-white text-[11px] rounded-md disabled:opacity-60"
            >
              저장
            </button>
          </div>
          <p className="text-[10px] text-neutral-300">
            관리자 수동 체크인은 운영 시간과 무관하게 항상 가능해요.
          </p>
        </div>
      )}

      {/* ===== 보기 전환 + CSV ===== */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => setSeatTab(false)}
            className={`px-3 py-1.5 text-xs border ${!seatTab ? "bg-sage-700 text-white border-sage-700" : "bg-white text-neutral-500 border-wedding-gold/20"}`}
          >
            하객 체크인
          </button>
          <button
            onClick={() => setSeatTab(true)}
            className={`px-3 py-1.5 text-xs border ${seatTab ? "bg-sage-700 text-white border-sage-700" : "bg-white text-neutral-500 border-wedding-gold/20"}`}
          >
            좌석 관리
          </button>
        </div>
        <div className="flex gap-1.5">
          <a href="/api/admin/rsvp-export?type=full" className="px-3 py-1.5 text-[11px] border border-wedding-gold/25 text-neutral-500 bg-white">
            CSV
          </a>
          <a href="/api/admin/rsvp-export?type=pass" className="px-3 py-1.5 text-[11px] border border-wedding-gold/25 text-neutral-500 bg-white">
            QR 발송 목록
          </a>
        </div>
      </div>

      {!seatTab ? (
        <>
          {/* ===== 검색 (상단 고정 §13) + 필터 ===== */}
          <div className="sticky top-0 z-10 bg-wedding-cream pt-1 pb-2 space-y-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 또는 연락처 검색"
              className="w-full p-3 text-base border border-wedding-gold/25 bg-white rounded-md focus:outline-none focus:border-sage-600"
            />
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-[11px] border rounded-full ${
                    filter === f
                      ? "bg-sage-700 text-white border-sage-700"
                      : "bg-white text-neutral-500 border-wedding-gold/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ===== 현장 등록 ===== */}
          <div className="border border-wedding-gold/20 bg-white">
            <button
              onClick={() => setWOpen((o) => !o)}
              className="w-full py-2.5 text-xs text-sage-700 font-medium"
            >
              {wOpen ? "▲ 닫기" : "＋ 현장 하객 등록 (QR 없이 방문)"}
            </button>
            {wOpen && (
              <div className="p-3 pt-0 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={wName}
                    onChange={(e) => setWName(e.target.value)}
                    placeholder="성함"
                    className="flex-1 p-2.5 text-sm border border-wedding-gold/20 rounded-md focus:outline-none"
                  />
                  {(["groom", "bride"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setWSide((c) => (c === s ? null : s))}
                      className={`px-3 text-xs border rounded-md ${wSide === s ? "bg-sage-600 text-white border-sage-600" : "text-neutral-500 border-wedding-gold/20"}`}
                    >
                      {SIDE_LABEL[s]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-400">인원</span>
                  <button onClick={() => setWParty((p) => Math.max(1, p - 1))} className="w-8 h-8 border border-wedding-gold/25 rounded-full">−</button>
                  <b className="text-sage-700">{wParty}</b>
                  <button onClick={() => setWParty((p) => Math.min(20, p + 1))} className="w-8 h-8 border border-wedding-gold/25 rounded-full">＋</button>
                  <button
                    onClick={addWalkin}
                    disabled={busy === "walkin"}
                    className="ml-auto px-4 py-2 bg-sage-700 text-white text-xs rounded-md disabled:opacity-60"
                  >
                    등록
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ===== RSVP 목록 ===== */}
          <div className="space-y-1.5">
            {list.map((r) => {
              const ck = r.checkin;
              const diff =
                ck != null
                  ? (ck.actual_party_size ?? 0) - (ck.expected_party_size ?? r.expected_party_size)
                  : 0;
              return (
                <div key={r.id} className="bg-white border border-wedding-gold/15 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-sage-700 truncate">
                        <b>{r.name}</b>
                        {r.expected_party_size > 1 && ` 외 ${r.expected_party_size - 1}명`}
                        <span className="text-neutral-400 font-normal">
                          {" "}· {r.side ? SIDE_LABEL[r.side] : "-"}
                          {r.table_id && ` · ${tableName(r.table_id)}`}
                        </span>
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {ck ? (
                          <>
                            <span className="text-sage-600 font-medium">✓ 도착</span>
                            {" "}{ck.actual_party_size}명
                            {diff !== 0 && (
                              <span className="text-amber-600"> ({diff > 0 ? "+" : ""}{diff})</span>
                            )}
                            {" "}· {SOURCE_LABEL[ck.source ?? ""] ?? ""}
                            {" "}· {new Date(ck.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                          </>
                        ) : (
                          <span className="text-neutral-400">미도착</span>
                        )}
                        {!r.checkin_token_active && r.attending && (
                          <span className="text-red-400"> · QR 비활성</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!ck ? (
                        <ActionBtn onClick={() => manualCheckin(r)} primary>
                          체크인
                        </ActionBtn>
                      ) : (
                        <>
                          <ActionBtn onClick={() => editParty(ck)}>인원</ActionBtn>
                          <ActionBtn onClick={() => cancelCheckin(ck, `${r.name}님`)} danger>
                            취소
                          </ActionBtn>
                        </>
                      )}
                      <ActionBtn onClick={() => assignSeat(r)}>좌석</ActionBtn>
                      <ActionBtn onClick={() => issuePass(r)}>QR</ActionBtn>
                    </div>
                  </div>
                </div>
              );
            })}
            {list.length === 0 && shownWalkins.length === 0 && (
              <p className="text-xs text-neutral-400 text-center py-6">표시할 하객이 없어요</p>
            )}
          </div>

          {/* ===== 현장 등록·레거시 체크인 목록 ===== */}
          {shownWalkins.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-neutral-400">현장 등록 · RSVP 미연결</p>
              {shownWalkins.map((c) => (
                <div key={c.id} className="bg-white border border-wedding-gold/15 p-3 flex items-center justify-between gap-2">
                  <p className="text-sm text-sage-700 min-w-0 truncate">
                    <b>{c.name ?? "이름 없음"}</b>
                    <span className="text-neutral-400 font-normal">
                      {" "}· {c.actual_party_size}명 · {SOURCE_LABEL[c.source ?? ""] ?? ""}
                      {" "}· {new Date(c.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                  <div className="flex gap-1 shrink-0">
                    <ActionBtn onClick={() => editParty(c)}>인원</ActionBtn>
                    <ActionBtn onClick={() => cancelCheckin(c, c.name ?? "현장 등록")} danger>
                      취소
                    </ActionBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* ===== 좌석 관리 (§5) ===== */}
          <div className="bg-white border border-wedding-gold/20 p-3 space-y-2">
            <p className="text-[11px] text-neutral-400">새 테이블</p>
            <div className="flex gap-2">
              <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="테이블명 (A-07)" className="flex-1 min-w-0 p-2.5 text-sm border border-wedding-gold/20 rounded-md focus:outline-none" />
              <input value={tZone} onChange={(e) => setTZone(e.target.value)} placeholder="구역" className="w-24 p-2.5 text-sm border border-wedding-gold/20 rounded-md focus:outline-none" />
            </div>
            <div className="flex gap-2 items-center">
              <select value={tSide} onChange={(e) => setTSide(e.target.value)} className="p-2 text-xs border border-wedding-gold/20 rounded-md bg-white">
                <option value="">측 구분 없음</option>
                <option value="groom">신랑측</option>
                <option value="bride">신부측</option>
                <option value="common">공통</option>
              </select>
              <span className="text-xs text-neutral-400">정원</span>
              <input
                type="number"
                value={tCap}
                min={1}
                max={50}
                onChange={(e) => setTCap(Math.trunc(Number(e.target.value)) || 10)}
                className="w-16 p-2 text-sm border border-wedding-gold/20 rounded-md text-center"
              />
              <button onClick={addTable} disabled={busy === "table-add"} className="ml-auto px-4 py-2 bg-sage-700 text-white text-xs rounded-md disabled:opacity-60">
                추가
              </button>
            </div>
            <input value={tNote} onChange={(e) => setTNote(e.target.value)} placeholder="위치 안내 (연회장 입구 오른쪽 두 번째 줄)" className="w-full p-2.5 text-sm border border-wedding-gold/20 rounded-md focus:outline-none" />
          </div>

          <div className="space-y-2">
            {tableSummary.map((t) => (
              <div key={t.id} className={`bg-white border p-3 space-y-1.5 ${t.assignedPeople > t.capacity ? "border-amber-400" : "border-wedding-gold/15"} ${!t.active ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-sage-700">
                    <b>{t.name}</b>
                    <span className="text-neutral-400 font-normal">
                      {t.zone && ` · ${t.zone}`}
                      {t.side && ` · ${SIDE_LABEL[t.side]}`}
                      {!t.active && " · 숨김"}
                    </span>
                  </p>
                  <div className="flex gap-1 shrink-0">
                    <ActionBtn onClick={() => toggleTable(t)}>{t.active ? "숨기기" : "표시"}</ActionBtn>
                    <ActionBtn onClick={() => deleteTable(t)} danger disabled={t.teams.length > 0}>
                      삭제
                    </ActionBtn>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-400">
                  {t.assignedPeople} / {t.capacity}명 배정
                  {t.assignedPeople > t.capacity && (
                    <span className="text-amber-600 font-medium"> ⚠ 정원 초과</span>
                  )}
                  {" "}· {t.arrivedPeople} / {t.capacity}명 도착
                  {t.location_note && ` · ${t.location_note}`}
                </p>
                {t.teams.length > 0 && (
                  <div className="text-[11px] text-neutral-500 space-y-0.5 pt-0.5">
                    {t.teams.map((r) => (
                      <p key={r.id} className="flex justify-between">
                        <span>
                          {r.name}
                          {r.expected_party_size > 1 && ` 외 ${r.expected_party_size - 1}명`}
                        </span>
                        <span className={r.checkin ? "text-sage-600" : "text-neutral-300"}>
                          {r.checkin ? "도착" : "미도착"}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {tables.length === 0 && (
              <p className="text-xs text-neutral-400 text-center py-6">
                아직 테이블이 없어요. 위에서 만들어 주세요.
              </p>
            )}
          </div>

          {/* 미배정 팀 바로 배정 */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-neutral-400">
              좌석 미배정 ({attending.filter((r) => !r.table_id).length}팀)
            </p>
            {attending
              .filter((r) => !r.table_id)
              .map((r) => (
                <div key={r.id} className="bg-white border border-wedding-gold/15 p-3 flex items-center justify-between gap-2">
                  <p className="text-sm text-sage-700 min-w-0 truncate">
                    <b>{r.name}</b>
                    {r.expected_party_size > 1 && ` 외 ${r.expected_party_size - 1}명`}
                    <span className="text-neutral-400 font-normal">
                      {" "}· {r.side ? SIDE_LABEL[r.side] : "-"}
                    </span>
                  </p>
                  <ActionBtn onClick={() => assignSeat(r)} primary>
                    배정
                  </ActionBtn>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  strong,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`border p-2 text-center bg-white ${strong ? "border-sage-600" : "border-wedding-gold/15"}`}>
      <p className="text-[10px] text-neutral-400">{label}</p>
      <p className={`text-sm font-bold ${warn ? "text-amber-600" : "text-sage-700"}`}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-400">{sub}</p>}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1.5 text-[11px] border rounded-md disabled:opacity-40 ${
        primary
          ? "bg-sage-700 text-white border-sage-700"
          : danger
            ? "text-red-500 border-red-200"
            : "text-neutral-500 border-wedding-gold/25"
      }`}
    >
      {children}
    </button>
  );
}
