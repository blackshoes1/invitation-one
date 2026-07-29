"use client";

import { useEffect, useMemo, useState } from "react";
import { formatYmdKo, toYmd } from "@/lib/wedding";
import {
  type AdminDelivery,
  type TabCtx,
  ownerName,
  thisWeekRange,
  buildIcs,
  CAL_MONTHS,
  CAL_YEAR,
  WEEK,
} from "@/app/admin/shared";
import { Legend } from "@/components/admin/ui";

/** 캘린더 탭 — 월별 주문 현황 + 날짜 일괄 마감/해제 + 이번 주 .ics. 마운트 시 자체 로드. */
export default function CalendarTab({ api, setError, setNotice }: TabCtx) {
  const [allRows, setAllRows] = useState<AdminDelivery[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, blockedRes] = await Promise.all([
          api("/api/admin/deliveries"),
          api("/api/admin/blocked"),
        ]);
        if (!alive) return;
        if (res.ok) setAllRows((await res.json()).deliveries ?? []);
        if (blockedRes.ok)
          setBlocked(new Set(((await blockedRes.json()).dates ?? []) as string[]));
      } catch {
        if (alive) setError("캘린더를 불러오지 못했습니다. 네트워크를 확인해주세요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try {
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
    } catch {
      setError("마감 처리 요청이 실패했습니다. 네트워크를 확인해주세요.");
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

  // 캘린더용: 날짜 → 활성(취소 제외) 주문 목록 (같은 날 여러 팀 가능)
  const byDate = useMemo(() => {
    const m: Record<string, AdminDelivery[]> = {};
    for (const r of allRows)
      if (r.status !== "취소") m[r.date] = [...(m[r.date] ?? []), r];
    return m;
  }, [allRows]);

  return (
    <div className="space-y-6">
      {loading && (
        <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
      )}

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
  );
}
