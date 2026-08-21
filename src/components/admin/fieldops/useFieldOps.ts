"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Act, CheckinRow, RsvpRow, Stats, TableRow } from "./types";

/**
 * 현장 운영 탭 — 데이터 로드(15초 자동 새로고침) · busy/notice · 공용 액션
 * (수동 체크인 / 인원 수정 / 취소 / QR 재발급 / 좌석 배정)
 */
export function useFieldOps() {
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [commonUrl, setCommonUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/checkins");
    if (!res.ok) return;
    const j = await res.json();
    setRsvps(j.rsvps ?? []);
    setCheckins(j.checkins ?? []);
    setTables(j.tables ?? []);
    setStats(j.stats ?? null);
    setCommonUrl(j.commonCheckinUrl ?? null);
  }, []);

  useEffect(() => {
    // 마운트 즉시 1회 로드 (외부 데이터 → 상태 동기화)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 15000); // 새로고침 없이 통계 반영 (§13)
    return () => clearInterval(t);
  }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  };

  const act: Act = async (key, fn, okMsg) => {
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

  return {
    tables,
    stats,
    busy,
    setBusy,
    notice,
    commonUrl,
    flash,
    act,
    tableName,
    attending,
    walkins,
    manualCheckin,
    editParty,
    cancelCheckin,
    issuePass,
    assignSeat,
  };
}
