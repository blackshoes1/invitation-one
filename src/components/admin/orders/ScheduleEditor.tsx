"use client";

import type { Dispatch, SetStateAction } from "react";
import { slotsForDate } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";
import type { EditSched } from "./types";

/** 일정 수정 폼 — 그룹 담당자가 신청한 일자·시간·장소를 관리자가 조정 */
export default function ScheduleEditor({
  editSched,
  setEditSched,
  onSave,
}: {
  editSched: EditSched;
  setEditSched: Dispatch<SetStateAction<EditSched | null>>;
  onSave: () => void;
}) {
  return (
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
          onClick={onSave}
          className="px-3 py-1.5 text-xs bg-sage-700 text-white"
        >
          변경 저장
        </button>
      </div>
    </div>
  );
}
