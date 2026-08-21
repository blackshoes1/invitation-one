"use client";

import { useMemo, useState } from "react";
import { SIDE_LABEL, type Act, type Flash, type RsvpRow, type TableRow } from "./types";
import { ActionBtn } from "./ui";

/** 좌석 관리 (§5) — 테이블 생성/숨김/삭제 + 테이블별 집계(§5.2) + 미배정 팀 바로 배정 */
export default function SeatingTab({
  tables,
  attending,
  busy,
  act,
  flash,
  assignSeat,
}: {
  tables: TableRow[];
  attending: RsvpRow[];
  busy: string | null;
  act: Act;
  flash: Flash;
  assignSeat: (r: RsvpRow) => void;
}) {
  // 테이블 생성 폼
  const [tName, setTName] = useState("");
  const [tZone, setTZone] = useState("");
  const [tSide, setTSide] = useState<string>("");
  const [tCap, setTCap] = useState(10);
  const [tNote, setTNote] = useState("");

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

  return (
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
  );
}
