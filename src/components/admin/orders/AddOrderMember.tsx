"use client";

import { useRef, useState } from "react";
import type { AdminApi } from "@/app/admin/shared";
import type { Group } from "@/lib/supabase";

type Member = { id: string; name: string; phone: string | null; applied: boolean };
export default function AddOrderMember({ orderId, groupId, groups, api, onAdded }: {
  orderId: string; groupId: string | null; groups: Group[]; api: AdminApi; onAdded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(groupId ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const request = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(id: string) {
    const version = ++request.current;
    setSelectedGroup(id); setMembers([]); setError(null); setQuery("");
    setLoading(!!id);
    if (!id) return;
    try {
      const res = await api(`/api/admin/groups/${id}/members`);
      const j = await res.json();
      if (version !== request.current) return;
      if (!res.ok) throw new Error(j.error ?? "명단을 불러오지 못했습니다.");
      setMembers(j.members ?? []);
    } catch (e) {
      if (version === request.current) setError(e instanceof Error ? e.message : "명단 조회 실패. 다시 시도해주세요.");
    } finally { if (version === request.current) setLoading(false); }
  }
  async function add(member: Member) {
    if (lock.current) return;
    lock.current = true; setBusy(member.id); setError(null); setNotice(null);
    try {
      const res = await api(`/api/admin/deliveries/${orderId}/members`, {
        method: "POST", body: JSON.stringify({ member_id: member.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "추가하지 못했습니다.");
      setMembers(ms => ms.map(m => m.id === member.id ? { ...m, applied: true } : m));
      setNotice(j.result === "already_on_order" ? "이미 이 주문에 등록된 개인입니다." : `${member.name}님을 추가했습니다. 안내 문자는 보내지 않았습니다.`);
      await onAdded();
    } catch (e) { setError(e instanceof Error ? e.message : "요청 실패. 다시 시도해주세요."); }
    finally { lock.current = false; setBusy(null); }
  }
  const visible = members.filter(m => `${m.name} ${m.phone ?? ""}`.includes(query.trim()));
  return <div className="border-t border-wedding-gold/10 pt-2">
    <button type="button" aria-expanded={open} disabled={busy !== null} className="px-3 py-1.5 text-xs border border-sage-300 text-sage-700 disabled:opacity-40"
      onClick={() => { setOpen(!open); if (!open) { setNotice(null); void load(selectedGroup); } else { request.current++; } }}>
      {open ? "명단 닫기" : "명단에서 추가"}
    </button>
    {open && <div className="mt-3 space-y-2">
      <p className="text-xs text-neutral-500">추가할 개인을 선택해주세요. 이미 신청한 개인은 중복 추가할 수 없습니다.</p>
      {!groupId && <label className="block text-xs">그룹 선택
        <select value={selectedGroup} disabled={busy !== null} onChange={e => void load(e.target.value)} className="block w-full border p-2 mt-1">
          <option value="">그룹을 선택해주세요</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>}
      {selectedGroup && <>
        <input aria-label="추가할 개인 검색" placeholder="이름 또는 연락처 검색" value={query} onChange={e => setQuery(e.target.value)} className="w-full border p-2 text-xs" />
        {loading ? <p role="status">명단을 불러오는 중…</p> : <ul className="max-h-64 overflow-y-auto space-y-2">
          {visible.map(m => <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
            <span>{m.name} <span className="text-neutral-400">{m.phone ?? "연락처 없음"}</span></span>
            <button type="button" disabled={m.applied || busy !== null} aria-label={`${m.name} 추가`} onClick={() => void add(m)} className="shrink-0 border px-2 py-1 disabled:opacity-40">
              {busy === m.id ? "추가 중…" : m.applied ? "이미 신청됨" : "추가"}
            </button>
          </li>)}
          {!visible.length && <li className="text-xs text-neutral-500">{query ? "검색 결과가 없습니다." : "등록된 개인이 없습니다."}</li>}
        </ul>}
      </>}
      {error && <div role="alert" className="text-xs text-red-600">{error} <button type="button" disabled={busy !== null || loading} className="underline" onClick={() => void load(selectedGroup)}>명단 다시 불러오기</button></div>}
      {notice && <p role="status" className="text-xs text-sage-700">{notice}</p>}
    </div>}
  </div>;
}
