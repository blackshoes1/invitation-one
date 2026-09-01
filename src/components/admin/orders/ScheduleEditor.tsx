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
  notify,
  setNotify,
}: {
  editSched: EditSched;
  setEditSched: Dispatch<SetStateAction<EditSched | null>>;
  onSave: () => void;
  /** 참여자 변경 안내 문자 발송 여부 (폼에서 직접 선택 — 확인창 사용 안 함) */
  notify: boolean;
  setNotify: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="border-t border-wedding-gold/10 pt-2.5 space-y-2">
      <p className="text-[10px] text-neutral-400">
        일정 수정 — 아래 값을 고치고 &lsquo;변경 저장&rsquo;을 누르세요
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* 문자 발송 여부는 확인창(취소=작업 취소로 오해) 대신 여기서 선택 */}
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="accent-sage-600"
          />
          참여자에게 변경 안내 문자 보내기
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setEditSched(null)}
            className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-400"
          >
            닫기
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-xs bg-sage-700 text-white"
          >
            변경 저장
          </button>
        </div>
      </div>
    </div>
  );
}
