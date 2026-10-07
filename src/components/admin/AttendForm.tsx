"use client";

import { useState } from "react";
import type { GroupMemberRow } from "@/lib/supabase";
import { formatPhone } from "@/lib/wedding";
import { MAX_COMPANIONS, clampCompanionCount, resizeCompanions } from "@/lib/groupCompanions";
import type { TabCtx } from "@/app/admin/shared";

export type AttendResult = "created" | "linked" | "updated";

/** 등록·수정 직후 안내 문구 — 그룹 명단과 개별 초대가 같이 쓴다 */
export function attendNotice(result: AttendResult): string {
  if (result === "created") return "참석자로 등록했어요 ✓ 현장운영 탭에서 볼 수 있어요.";
  if (result === "updated") return "참석 정보를 수정했어요.";
  return "같은 이름·연락처의 RSVP 가 이미 있어 연결만 했어요 (기존 응답은 그대로예요).";
}

/**
 * 명단 사람의 참석 등록(create) / 수정(update) 입력 영역.
 * 측(필수) · 연락처(등록 때만, 선택) · 동반 인원수 + 동반자 이름(선택). 동반 인원수가 이름 칸 수를 정한다.
 * 수정은 연락처를 바꾸지 않는다 — 이름+연락처가 RSVP 식별 키라 바꾸면 하객 재제출과 중복될 수 있다.
 */
export default function AttendForm({
  api,
  setError,
  endpoint,
  member,
  mode = "create",
  defaultPhone = "",
  onDone,
  onCancel,
}: Pick<TabCtx, "api" | "setError"> & {
  /** POST(등록)/PATCH(수정) 주소 — 그룹 명단과 개별 초대가 다르다 */
  endpoint: string;
  member: GroupMemberRow;
  mode?: "create" | "update";
  /** 등록: 행에 이미 적혀 있는 연락처 (저장 전 초안 포함) */
  defaultPhone?: string;
  onDone: (result: AttendResult) => void;
  onCancel: () => void;
}) {
  const editing = mode === "update";
  const current = editing ? member.rsvp : null;
  const initialCount = clampCompanionCount(current?.companion_count ?? 0);

  const [side, setSide] = useState<"" | "groom" | "bride">(
    current?.side === "groom" || current?.side === "bride" ? current.side : ""
  );
  const [phone, setPhone] = useState(defaultPhone);
  /** 입력 중에는 빈 칸도 허용해야 지우고 다시 쓸 수 있다 — 실제 인원은 clamp 한 값 */
  const [countText, setCountText] = useState(String(initialCount));
  const [names, setNames] = useState<string[]>(() =>
    resizeCompanions(current?.companion_names ?? [], initialCount)
  );
  const [saving, setSaving] = useState(false);

  const count = clampCompanionCount(countText);

  const applyCount = (n: number) => {
    const c = clampCompanionCount(n);
    setCountText(String(c));
    setNames((cur) => resizeCompanions(cur, c));
  };

  const typeCount = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    setCountText(digits);
    setNames((cur) => resizeCompanions(cur, clampCompanionCount(digits)));
  };

  const submit = async () => {
    if (saving) return;
    if (!side) return setError("신랑측/신부측을 선택해주세요.");
    setError(null);
    setSaving(true);
    try {
      const res = await api(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side,
          ...(editing ? {} : { phone }),
          companionCount: count,
          companionNames: names,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        result?: AttendResult;
        error?: string;
      };
      if (!res.ok || !j.result) {
        if (res.status !== 401)
          setError(j.error ?? (editing ? "참석 정보 수정에 실패했습니다." : "참석 등록에 실패했습니다."));
        return;
      }
      onDone(j.result);
    } catch {
      setError("요청이 실패했습니다. 네트워크를 확인해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const sideBtn = (value: "groom" | "bride", label: string) => (
    <button
      type="button"
      aria-pressed={side === value}
      onClick={() => setSide(value)}
      className={`px-3 py-2 text-xs border ${
        side === value
          ? "border-sage-600 bg-sage-600 text-white"
          : "border-neutral-200 text-neutral-500"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full space-y-2 border border-sage-300 bg-sage-50/40 p-3">
      <p className="text-xs font-medium text-sage-700">
        {editing ? "참석 인원 수정" : "참석 등록"}{" "}
        <span className="font-normal text-neutral-500">· {member.name}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-neutral-500">측</span>
        {sideBtn("groom", "신랑측")}
        {sideBtn("bride", "신부측")}
      </div>

      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-neutral-500">연락처</span>
          <input
            type="tel"
            inputMode="tel"
            aria-label={`${member.name} 참석 연락처`}
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="010-0000-0000 (선택)"
            className="min-w-[140px] flex-1 border border-neutral-200 bg-white px-2 py-2 text-sm"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-neutral-500">동반 인원</span>
        <button
          type="button"
          aria-label="동반 인원 줄이기"
          disabled={count <= 0}
          onClick={() => applyCount(count - 1)}
          className="h-9 w-9 border border-neutral-200 bg-white text-base text-neutral-600 disabled:opacity-40"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label="동반 인원수"
          value={countText}
          onChange={(e) => typeCount(e.target.value)}
          onBlur={() => applyCount(count)}
          className="h-9 w-14 border border-neutral-200 bg-white text-center text-sm"
        />
        <button
          type="button"
          aria-label="동반 인원 늘리기"
          disabled={count >= MAX_COMPANIONS}
          onClick={() => applyCount(count + 1)}
          className="h-9 w-9 border border-neutral-200 bg-white text-base text-neutral-600 disabled:opacity-40"
        >
          +
        </button>
        <span className="text-[11px] text-neutral-500">명 (본인 제외)</span>
      </div>

      {names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {names.map((v, i) => (
            <input
              key={i}
              aria-label={`동반자 ${i + 1} 이름`}
              value={v}
              maxLength={40}
              onChange={(e) =>
                setNames((cur) => cur.map((x, k) => (k === i ? e.target.value : x)))
              }
              placeholder={`동반자 ${i + 1} (선택)`}
              className="w-32 min-w-0 border border-neutral-200 bg-white px-2 py-2 text-sm"
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-neutral-400">
          {editing
            ? `총 ${count + 1}명 · 이미 체크인한 인원은 바뀌지 않아요 (현장운영 탭의 '인원'에서 수정)`
            : <>총 {count + 1}명 · 식사는 &lsquo;먹음&rsquo;으로 등록돼요</>}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-neutral-200 px-3 py-2 text-xs text-neutral-500"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="bg-sage-600 px-3 py-2 text-xs text-white disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? (editing ? "저장 중…" : "등록 중…") : editing ? "저장" : "참석자로 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
