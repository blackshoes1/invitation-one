"use client";

import type { Dispatch, SetStateAction } from "react";
import type { DeliveryStatus, TrackingStage } from "@/lib/supabase";
import { TRACKING_STAGES } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";
import { splitRegion } from "@/lib/regions";
import { type AdminDelivery, ownerName, NEXT_ACTION } from "@/app/admin/shared";
import ScheduleEditor from "./ScheduleEditor";
import type { EditSched } from "./types";

/** 주문 1건 카드 — 참여자 명단·추적 단계·일정 수정·합치기·상태 변경 버튼 */
export default function OrderCard({
  r,
  groupName,
  acting,
  mergeSource,
  setMergeSource,
  editSched,
  setEditSched,
  onChangeStatus,
  onChangeStage,
  onMerge,
  onSaveSchedule,
  notify,
  setNotify,
  onToggleHidden,
}: {
  r: AdminDelivery;
  groupName: (id: string | null) => string;
  acting: string | null;
  mergeSource: string | null;
  setMergeSource: (id: string | null) => void;
  editSched: EditSched | null;
  setEditSched: Dispatch<SetStateAction<EditSched | null>>;
  onChangeStatus: (id: string, status: DeliveryStatus) => void;
  onChangeStage: (id: string, stage: TrackingStage) => void;
  onMerge: (targetId: string) => void;
  onSaveSchedule: () => void;
  /** 일정 변경 안내 문자 발송 여부 (ScheduleEditor 체크박스) */
  notify: boolean;
  setNotify: Dispatch<SetStateAction<boolean>>;
  /** 표시 숨김/복구 (DB 보존) */
  onToggleHidden: (id: string, hidden: boolean, active: boolean) => void;
}) {
  const nextAction = NEXT_ACTION[r.status];
  const cancelable = r.status !== "취소" && r.status !== "완료";
  return (
    <div
      className="bg-white border border-wedding-gold/15 p-4 text-sm flex flex-col gap-2"
    >
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <p className="font-medium text-sage-700">
            {ownerName(r)}
            {(r.participants?.length ?? 0) > 1 && (
              <span className="text-xs text-neutral-500 font-normal">
                {" "}
                외 {(r.participants?.length ?? 1) - 1}명
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-500">
            {formatYmdKo(r.date)} · {r.time_slot} ·{" "}
            {/* 장소가 비어 있으면 빈칸이 아니라 '미정'이라고 말한다 — 채워 넣어야 할 건임을 알아야 한다 */}
            {r.location ? r.location : <span className="text-red-400">장소 미정</span>}
            {r.rider === "신랑+신부" && (
              <span className="text-delivery font-bold"> · 💑 신랑+신부</span>
            )}
            {r.rider === "신부" && (
              <span className="text-delivery font-bold"> · 👰 신부</span>
            )}
          </p>
          <p className="text-[11px] text-neutral-400">
            👥 {r.participants?.length ?? 0}명 · 📦 {groupName(r.group_id)}
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

      {/* 참여자 명단 (참여 시스템) */}
      {(r.participants?.length ?? 0) > 0 && (
        <ul className="border-t border-wedding-gold/10 pt-2 space-y-1">
          {r.participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 text-xs text-neutral-600"
            >
              <span>
                {p.is_owner ? "👑" : "👤"} {p.name}
              </span>
              <span className="text-neutral-400">{p.phone}</span>
              {p.review_rating != null && (
                <span className="ml-auto text-amber-500">
                  {"⭐".repeat(p.review_rating)}
                  {p.review_text && (
                    <span className="text-neutral-400">
                      {" "}
                      “{p.review_text}”
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
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
                onClick={() => onChangeStage(r.id, s)}
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

      {/* 일정·장소 수정(취소 외 모든 주문 — 완료 후 정정 포함) + 합치기(활성 주문만) */}
      {r.status !== "취소" && (
        <div className="flex justify-end gap-2 flex-wrap">
          <button
            onClick={() =>
              setEditSched((cur) =>
                cur?.id === r.id
                  ? null
                  : {
                      id: r.id,
                      date: r.date,
                      time: r.time_slot,
                      // 예전 자유 입력 값도 글자를 버리지 않고 상세로 넘어온다
                      ...splitRegion(r.location),
                    }
              )
            }
            className={`px-3 py-1.5 text-xs border ${
              editSched?.id === r.id
                ? "border-sage-600 text-sage-700 bg-sage-50"
                : "border-neutral-300 text-neutral-500"
            }`}
          >
            {editSched?.id === r.id ? "수정 닫기" : "📝 일정·장소 수정"}
          </button>
          {r.status !== "완료" &&
            (mergeSource === null ? (
              <button
                onClick={() => setMergeSource(r.id)}
                className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-500"
              >
                이 주문을 다른 주문과 합치기 🔗
              </button>
            ) : mergeSource === r.id ? (
              <button
                onClick={() => setMergeSource(null)}
                className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-400"
              >
                합치기 취소
              </button>
            ) : (
              <button
                onClick={() => onMerge(r.id)}
                className="px-3 py-1.5 text-xs bg-delivery text-white font-bold"
              >
                여기로 합치기 ⤵
              </button>
            ))}
        </div>
      )}

      {/* 표시 숨김 — 데이터는 보존하고 목록에서만 감춘다 (취소 건 정리에 주로 사용) */}
      <div className="flex justify-end">
        <button
          onClick={() =>
            onToggleHidden(
              r.id,
              !r.hidden,
              r.status === "대기중" || r.status === "확정"
            )
          }
          className={`px-3 py-1.5 text-xs border ${
            r.hidden
              ? "border-sage-300 text-sage-600 bg-sage-50"
              : "border-neutral-300 text-neutral-400"
          }`}
          title={
            r.hidden
              ? "목록에 다시 표시"
              : "목록에서 숨기기 (데이터는 삭제되지 않음)"
          }
        >
          {r.hidden ? "👁 다시 표시" : "🙈 숨기기"}
        </button>
      </div>

      {/* 일정·장소 수정 폼 — 그룹 담당자가 신청한 일자·시간·장소를 관리자가 조정 */}
      {editSched?.id === r.id && (
        <ScheduleEditor
          editSched={editSched}
          setEditSched={setEditSched}
          onSave={onSaveSchedule}
          notify={notify}
          setNotify={setNotify}
        />
      )}

      {(nextAction || cancelable) && (
        <div className="flex justify-end gap-2">
          {cancelable && (
            <button
              onClick={() => onChangeStatus(r.id, "취소")}
              disabled={acting !== null}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-400 disabled:opacity-40"
            >
              취소
            </button>
          )}
          {nextAction && (
            <button
              onClick={() => onChangeStatus(r.id, nextAction)}
              disabled={acting !== null}
              className="px-3 py-1.5 text-xs bg-sage-600 text-white tracking-wide disabled:opacity-40"
            >
              {acting === r.id ? "처리 중…" : `${nextAction}으로 변경`}
              {acting !== r.id && nextAction === "확정" ? " (SMS)" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
