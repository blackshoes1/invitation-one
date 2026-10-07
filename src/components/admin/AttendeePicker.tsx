"use client";

import { useMemo, useState } from "react";
import type { GroupMemberRow } from "@/lib/supabase";
import { companionSlots } from "@/lib/groupCompanions";
import { SIDE_LABEL, type RsvpRow } from "@/components/admin/fieldops/types";
import type { TabCtx } from "@/app/admin/shared";

/**
 * 그룹 명단 — RSVP 참석자 불러오기.
 * 참석(attending) 하객만 골라 명단에 저장하고, 인원이 2명 이상이면 동반자 이름 입력칸을 연다.
 * 선택값(selected): rsvpId → 동반자 이름 입력값 배열 (키가 있으면 선택된 것)
 */
export default function AttendeePicker({
  api,
  setError,
  setNotice,
  groupId,
  rsvps,
  addedRsvpIds,
  onAdded,
  onClose,
}: TabCtx & {
  groupId: string;
  /** 참석(attending) 하객만 */
  rsvps: RsvpRow[];
  /** 이 그룹 명단에 이미 있는 rsvp id */
  addedRsvpIds: Set<string>;
  onAdded: (members: GroupMemberRow[], skipped: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const t = q.trim();
    return t ? rsvps.filter((r) => r.name.includes(t)) : rsvps;
  }, [rsvps, q]);
  const selectable = visible.filter((r) => !addedRsvpIds.has(r.id));
  const allChecked = selectable.length > 0 && selectable.every((r) => selected[r.id]);
  const count = Object.keys(selected).length;

  const blank = (r: RsvpRow) => Array<string>(companionSlots(r.expected_party_size)).fill("");

  const toggle = (r: RsvpRow) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[r.id]) delete next[r.id];
      else next[r.id] = blank(r);
      return next;
    });

  const toggleAll = () =>
    setSelected((s) => {
      const next = { ...s };
      for (const r of selectable) {
        if (allChecked) delete next[r.id];
        else if (!next[r.id]) next[r.id] = blank(r);
      }
      return next;
    });

  const setCompanion = (rid: string, i: number, v: string) =>
    setSelected((s) => ({ ...s, [rid]: (s[rid] ?? []).map((x, k) => (k === i ? v : x)) }));

  const save = async () => {
    if (count === 0 || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await api(`/api/admin/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({
          attendees: Object.entries(selected).map(([rsvp_id, companions]) => ({
            rsvp_id,
            companions,
          })),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        members?: GroupMemberRow[];
        skipped?: number;
        error?: string;
      };
      if (!res.ok) {
        if (res.status !== 401)
          setError(
            res.status === 409
              ? "방금 다른 곳에서 같은 참석자가 추가됐어요. 목록을 다시 열어주세요."
              : j.error ?? "참석자 추가에 실패했습니다."
          );
        return;
      }
      onAdded(j.members ?? [], j.skipped ?? 0);
      setNotice(
        `참석자 ${j.members?.length ?? 0}명을 명단에 추가했어요` +
          (j.skipped ? ` (이미 있거나 불참인 ${j.skipped}명 제외)` : "")
      );
    } catch {
      setError("참석자 추가 요청이 실패했습니다. 네트워크를 확인해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-sage-300 bg-sage-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-sage-700 font-medium">
          참석자 불러오기 <span className="text-neutral-400 font-normal">· 참석 {rsvps.length}팀</span>
        </p>
        <button onClick={onClose} className="text-xs text-neutral-400">
          닫기
        </button>
      </div>
      <div className="flex gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 검색"
          className="flex-1 min-w-0 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
        />
        <label className="flex items-center gap-1 text-xs text-neutral-500 whitespace-nowrap">
          <input
            type="checkbox"
            checked={allChecked}
            disabled={selectable.length === 0}
            onChange={toggleAll}
          />
          전체 선택
        </label>
      </div>
      <ul className="max-h-72 overflow-y-auto space-y-1">
        {visible.map((r) => {
          const added = addedRsvpIds.has(r.id);
          const comps = selected[r.id];
          return (
            <li key={r.id} className="bg-white border border-wedding-gold/10 px-2 py-1.5">
              <label className={`flex items-center gap-2 text-sm ${added ? "text-neutral-300" : "text-neutral-600"}`}>
                <input
                  type="checkbox"
                  checked={added || !!comps}
                  disabled={added}
                  onChange={() => toggle(r)}
                />
                <span className="min-w-0 truncate">
                  <b>{r.name}</b>
                  {r.expected_party_size > 1 && ` 외 ${r.expected_party_size - 1}명`}
                  <span className="text-neutral-400 font-normal">
                    {" "}· {r.side ? SIDE_LABEL[r.side] : "-"}
                  </span>
                </span>
                {added && <span className="ml-auto text-[11px] text-neutral-400">추가됨</span>}
              </label>
              {comps && comps.length > 0 && (
                <div className="mt-1.5 pl-6 flex gap-1 flex-wrap">
                  {comps.map((v, i) => (
                    <input
                      key={i}
                      value={v}
                      maxLength={40}
                      onChange={(e) => setCompanion(r.id, i, e.target.value)}
                      placeholder={`동반자 ${i + 1}`}
                      className="w-28 p-1.5 text-xs border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="text-xs text-neutral-400 text-center py-4">
            {rsvps.length === 0 ? "참석 응답한 하객이 없어요" : "검색 결과가 없어요"}
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-neutral-400">동반자 이름은 비워 둬도 돼요 (나중에 명단에서 입력)</p>
        <button
          onClick={save}
          disabled={count === 0 || saving}
          className="px-3 py-1.5 text-xs bg-sage-600 text-white disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? "저장 중…" : `${count}명 추가`}
        </button>
      </div>
    </div>
  );
}
