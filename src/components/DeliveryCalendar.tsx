"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DELIVERY_START, DELIVERY_END, toYmd } from "@/lib/wedding";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const FIRST_MONTH = 6; // 7월 (0-base)
const LAST_MONTH = 9; // 10월
const YEAR = 2026;

export default function DeliveryCalendar({
  selected,
  booked,
  onSelect,
  selectedClass = "bg-sage-600 text-white font-medium",
  allowPast = false,
}: {
  selected: string | null;
  booked: Set<string>;
  onSelect: (ymd: string) => void;
  /** 선택된 날짜 강조 스타일 (톤에 맞게 교체) */
  selectedClass?: string;
  /** 과거 날짜 선택 허용 — "내 신청 찾기"처럼 지난 배송일을 조회할 때 사용 */
  allowPast?: boolean;
}) {
  // 마운트 시점 기준 오늘 (모듈 스코프에 두면 탭을 오래 열어두거나
  // 서버 모듈 재사용 시 stale 해지므로 컴포넌트 마운트마다 계산)
  const [todayYmd] = useState(() => toYmd(new Date()));
  /**
   * 접속일이 속한 달부터 보여준다 (지난 달을 먼저 띄우면 매번 넘겨야 함).
   * 배달 기간을 벗어난 시점(기간 전/후)에는 각각 첫 달·마지막 달로 맞춘다.
   * allowPast(내 신청 찾기)는 과거 조회가 목적이므로 첫 달부터.
   */
  const [month, setMonth] = useState(() => {
    if (allowPast) return FIRST_MONTH;
    const now = new Date();
    const m = now.getFullYear() === YEAR ? now.getMonth() : now.getFullYear() < YEAR ? FIRST_MONTH : LAST_MONTH;
    return Math.min(LAST_MONTH, Math.max(FIRST_MONTH, m));
  });

  const cells = useMemo(() => {
    const offset = new Date(YEAR, month, 1).getDay();
    const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
    const arr: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(toYmd(new Date(YEAR, month, d)));
    return arr;
  }, [month]);

  const isDisabled = (ymd: string) =>
    ymd < DELIVERY_START ||
    ymd > DELIVERY_END ||
    (!allowPast && ymd < todayYmd) ||
    booked.has(ymd);

  return (
    <div className="border border-wedding-gold/15 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          aria-label="이전 달"
          disabled={month <= FIRST_MONTH}
          onClick={() => setMonth((m) => Math.max(FIRST_MONTH, m - 1))}
          className="w-7 h-7 flex items-center justify-center text-sage-600 disabled:opacity-25"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-serif text-sm tracking-widest text-sage-700">
          {YEAR}. {String(month + 1).padStart(2, "0")}
        </span>
        <button
          type="button"
          aria-label="다음 달"
          disabled={month >= LAST_MONTH}
          onClick={() => setMonth((m) => Math.min(LAST_MONTH, m + 1))}
          className="w-7 h-7 flex items-center justify-center text-sage-600 disabled:opacity-25"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w, i) => (
          <div
            key={w}
            className={`text-[10px] py-1 ${i === 0 ? "text-red-400" : "text-neutral-500"}`}
          >
            {w}
          </div>
        ))}
        {cells.map((ymd, i) =>
          ymd === null ? (
            <div key={`b${i}`} />
          ) : (
            (() => {
              const disabled = isDisabled(ymd);
              const isBooked = booked.has(ymd);
              const isSel = selected === ymd;
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(ymd)}
                  className={`aspect-square text-xs rounded-full flex items-center justify-center transition-colors ${
                    isSel
                      ? selectedClass
                      : isBooked
                      ? // 마감된 날짜도 여전히 누를 수 있는 버튼이다 — 어느 날이
                        // 마감인지 읽히려면 취소선만으로는 부족하다
                        "text-neutral-500 line-through"
                      : disabled
                      ? "text-neutral-200"
                      : "text-sage-700 hover:bg-sage-50"
                  }`}
                >
                  {Number(ymd.slice(-2))}
                </button>
              );
            })()
          )
        )}
      </div>

      <p className="text-[10px] text-neutral-500 mt-3 text-center tracking-wide">
        취소선 표시된 날짜는 이미 신청되었습니다.
      </p>
    </div>
  );
}
