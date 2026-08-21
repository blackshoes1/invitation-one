"use client";

import { useState } from "react";
import { useFieldOps } from "./fieldops/useFieldOps";
import CheckinWindowCard from "./fieldops/CheckinWindowCard";
import WalkinForm from "./fieldops/WalkinForm";
import RsvpList from "./fieldops/RsvpList";
import SeatingTab from "./fieldops/SeatingTab";
import { Metric } from "./fieldops/ui";
import { FILTERS, type Filter } from "./fieldops/types";

/**
 * 관리자 — 현장 운영 탭 (docs/CHECKIN_SEATING_SPEC.md §6, §5.2, §13)
 * 예식 당일 안내데스크·관리자용: 통계 / 검색·필터 / 수동 체크인 / 인원 수정 /
 * 취소 / 현장 등록 / 좌석 배정 / QR 재발급 / CSV.
 * 모바일 우선 · 검색창 상단 고정 · 15초 자동 새로고침.
 */
export default function FieldOps() {
  const {
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
  } = useFieldOps();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [seatTab, setSeatTab] = useState(false);

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
      <CheckinWindowCard busy={busy} setBusy={setBusy} flash={flash} />

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
          {commonUrl && (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(commonUrl);
                  flash("공용 QR 링크를 복사했어요 (인쇄용)");
                } catch {
                  prompt("공용 QR 링크", commonUrl);
                }
              }}
              className="px-3 py-1.5 text-[11px] border border-wedding-gold/25 text-neutral-500 bg-white"
            >
              공용 QR 링크
            </button>
          )}
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
          <WalkinForm busy={busy} act={act} flash={flash} />

          {/* ===== RSVP 목록 + 현장 등록·레거시 체크인 목록 ===== */}
          <RsvpList
            attending={attending}
            walkins={walkins}
            filter={filter}
            search={search}
            tableName={tableName}
            manualCheckin={manualCheckin}
            editParty={editParty}
            cancelCheckin={cancelCheckin}
            assignSeat={assignSeat}
            issuePass={issuePass}
          />
        </>
      ) : (
        <SeatingTab
          tables={tables}
          attending={attending}
          busy={busy}
          act={act}
          flash={flash}
          assignSeat={assignSeat}
        />
      )}
    </div>
  );
}
