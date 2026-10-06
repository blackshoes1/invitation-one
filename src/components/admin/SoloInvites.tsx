"use client";

import { useRef, useState } from "react";
import type { Group, GroupMemberRow } from "@/lib/supabase";
import { formatPhone } from "@/lib/wedding";
import type { TabCtx } from "@/app/admin/shared";
import SoloOrderForm from "./SoloOrderForm";

/**
 * 개별 초대 — 모임에 속하지 않은 사람에게 이름·연락처가 자동 입력되는 링크를 준다.
 *
 * 예전에는 링크를 주려면 그 사람만을 위한 그룹을 먼저 만들어야 했다
 * (`group_members.group_id` 가 not null 이었다). 지금은 그룹 없이 등록한다.
 * 여기 등록된 사람의 주문은 항상 **개인 주문**이다 — 그룹 페이지를 거치지 않으므로.
 */
export default function SoloInvites({ api, setError, setNotice, groups, onGrouped }: TabCtx & {
  groups: Group[];
  onGrouped: (groupId: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<GroupMemberRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderMember, setOrderMember] = useState<GroupMemberRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [grouping, setGrouping] = useState(false);
  const [target, setTarget] = useState("new");
  const [groupName, setGroupName] = useState("");
  const requestId = useRef<string | null>(null);
  const groupingLock = useRef(false);
  const [phoneValues, setPhoneValues] = useState<Record<string, string>>({});
  const phoneDrafts = useRef(new Map<string, string>());
  const phoneSaves = useRef(new Map<string, Promise<boolean>>());
  /** 이번 세션에 발급한 링크 — 재발급 없이 다시 복사용 */
  const [issued, setIssued] = useState<Record<string, string>>({});

  const load = async () => {
    const res = await api("/api/admin/invitees");
    if (!res.ok) return;
    const j = (await res.json()) as { members?: GroupMemberRow[] };
    setRows(j.members ?? []);
  };

  /** 펼칠 때 처음 한 번만 조회 — 효과(effect) 대신 사용자 동작에 붙인다 */
  const toggle = () => {
    setOpen((v) => {
      if (!v && rows === null) void load();
      return !v;
    });
  };

  const add = async () => {
    if (name.trim().length < 1) return setError("이름을 입력해주세요.");
    setBusy(true);
    const res = await api("/api/admin/invitees", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error ?? "등록에 실패했습니다.");
    setName("");
    setPhone("");
    setRows((r) => [...(r ?? []), j.member as GroupMemberRow]);
  };

  const savePhone = (m: GroupMemberRow, next: string): Promise<boolean> => {
    const v = next.trim();
    const previous = phoneSaves.current.get(m.id);
    if (!previous && !phoneDrafts.current.has(m.id) && (m.phone ?? "") === v)
      return Promise.resolve(true);
    const saving = (async () => {
      if (previous) await previous;
      try {
        const res = await api("/api/admin/invitees", {
          method: "PATCH",
          body: JSON.stringify({ member_id: m.id, phone: v || null }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(j.error ?? "연락처 저장에 실패했습니다.");
          return false;
        }
        if (phoneDrafts.current.get(m.id) === v) {
          phoneDrafts.current.delete(m.id);
          setPhoneValues((current) => { const next = { ...current }; delete next[m.id]; return next; });
        }
        setRows((r) => (r ?? []).map((x) => (x.id === m.id ? { ...x, ...j.member } : x)));
        return true;
      } catch {
        setError("연락처 저장에 실패했습니다. 다시 시도해주세요.");
        return false;
      }
    })();
    phoneSaves.current.set(m.id, saving);
    void saving.then(() => {
      if (phoneSaves.current.get(m.id) === saving) phoneSaves.current.delete(m.id);
    });
    return saving;
  };

  const selectMember = (id: string) => {
    requestId.current = null;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const groupSelected = async () => {
    if (groupingLock.current || busy || selected.size === 0) return;
    if (selected.size > 500) return setError("한 번에 500명까지 그룹화할 수 있어요.");
    if (target === "new" && !groupName.trim()) return setError("새 그룹 이름을 입력해주세요.");
    groupingLock.current = true;
    setBusy(true);
    setError("");
    try {
      // Phone blur can still be saving when the grouping button is clicked.
      const saved = await Promise.all((rows ?? []).filter((m) => selected.has(m.id)).map((m) =>
        savePhone(m, phoneDrafts.current.get(m.id) ?? m.phone ?? "")
      ));
      if (saved.some((ok) => !ok)) return;
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const res = await api("/api/admin/invitees/group", {
        method: "POST",
        body: JSON.stringify({
          member_ids: [...selected],
          ...(target === "new"
            ? { new_group_name: groupName.trim(), request_id: requestId.current }
            : { group_id: target }),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setError(j.error ?? "그룹화에 실패했습니다.");
      setRows((current) => (current ?? []).filter((m) => !selected.has(m.id)));
      setSelected(new Set());
      setGrouping(false);
      setGroupName("");
      requestId.current = null;
      setNotice(`${j.group.name} 그룹에 ${j.assigned_count}명을 추가했어요. 기존 개인 링크는 그대로 사용할 수 있어요.`);
      try {
        await onGrouped(j.group.id);
      } catch {
        setError("그룹화는 완료됐지만 목록을 불러오지 못했어요. 페이지를 새로고침해주세요.");
      }
    } catch {
      setError("응답을 확인하지 못했어요. 다시 시도하면 중복 없이 처리됩니다.");
    } finally {
      groupingLock.current = false;
      setBusy(false);
    }
  };

  const remove = async (m: GroupMemberRow) => {
    if (!confirm(`${m.name} 님을 개별 초대에서 삭제할까요?`)) return;
    const res = await api(`/api/admin/invitees?member_id=${m.id}`, { method: "DELETE" });
    if (!res.ok) return setError("삭제에 실패했습니다.");
    setRows((r) => (r ?? []).filter((x) => x.id !== m.id));
    setSelected((current) => { const next = new Set(current); next.delete(m.id); return next; });
    requestId.current = null;
  };

  /** 링크 발급 + 클립보드 복사 (m 없으면 전체) */
  const issue = async (m?: GroupMemberRow) => {
    const cached = m ? issued[m.id] : null;
    if (cached) {
      await copy(cached, `${m!.name} 님 링크를 복사했어요`);
      return;
    }
    if (m?.invited_at && !confirm(`${m.name} 님 링크를 다시 만들까요? 이전에 보낸 링크는 무효가 됩니다.`))
      return;
    if (!m && !confirm("개별 초대 전체의 링크를 (다시) 만들까요? 이전에 보낸 링크는 모두 무효가 됩니다."))
      return;

    setBusy(true);
    const res = await api("/api/admin/invitees/invite", {
      method: "POST",
      body: JSON.stringify(m ? { member_id: m.id } : { all: true }),
    });
    setBusy(false);
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      links?: { id: string; name: string; personalUrl: string }[];
    };
    if (!res.ok || !j.links) return setError(j.error ?? "링크 발급에 실패했습니다.");

    const next = { ...issued };
    for (const l of j.links) next[l.id] = l.personalUrl;
    setIssued(next);
    await copy(
      m ? j.links[0].personalUrl : j.links.map((l) => `${l.name}: ${l.personalUrl}`).join("\n"),
      m ? `${m.name} 님 링크를 복사했어요 (1:1 로 보내주세요)` : `${j.links.length}명 링크를 복사했어요 (이름: 링크)`
    );
    void load(); // invited_at 갱신
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(msg);
    } catch {
      setNotice("복사가 막혀 있어요. 링크: " + text);
    }
  };

  return (
    <section className="border border-wedding-gold/20 bg-white p-4 space-y-3">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="font-serif text-sm font-bold text-neutral-700">
          개별 초대 {rows ? `(${rows.length}명)` : ""}
        </span>
        <span className="text-xs text-neutral-400">{open ? "닫기" : "열기"}</span>
      </button>

      {open && (
        <div className="space-y-3">
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            모임에 속하지 않은 분께 <b className="text-neutral-600">이름·연락처가 자동
            입력되는 링크</b>를 보낼 때 씁니다. 나중에 인원을 선택해 그룹으로 묶을 수 있어요.
            그룹화해도 기존 개인 링크와 신청 내역은 유지됩니다.
          </p>

          <div className="flex gap-2">
            <input
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-28 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
            />
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              disabled={busy}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && add()}
              enterKeyHint="done"
              placeholder="010-0000-0000 (선택)"
              className="flex-1 min-w-0 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
            />
            <button
              onClick={add}
              disabled={busy}
              className="px-3 bg-sage-600 text-white text-xs disabled:opacity-60"
            >
              추가
            </button>
          </div>

          {rows && rows.length > 0 && (
            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
              <span>연락처를 넣어야 번호까지 자동 입력돼요</span>
              <button
                onClick={() => issue()}
                disabled={busy}
                className="text-sage-700 underline underline-offset-2 whitespace-nowrap disabled:opacity-60"
              >
                전체 링크 복사
              </button>
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3 text-xs">
              <label className="flex items-center gap-2 py-2">
                <input type="checkbox" aria-label="개별 초대 전체 선택" disabled={busy}
                  checked={selected.size === rows.length}
                  ref={(node) => { if (node) node.indeterminate = selected.size > 0 && selected.size < rows.length; }}
                  onChange={(e) => { requestId.current = null; setSelected(new Set(e.target.checked ? rows.map((m) => m.id) : [])); }} />
                전체 선택
              </label>
              <button type="button" disabled={busy || selected.size === 0}
                onClick={() => setGrouping(true)}
                className="px-3 py-2 bg-sage-600 text-white disabled:opacity-40">
                선택 {selected.size}명 그룹화
              </button>
              <button type="button" disabled={busy} className="ml-auto text-neutral-500 underline"
                onClick={async () => { await load(); setSelected(new Set()); requestId.current = null; }}>
                목록 새로고침
              </button>
            </div>
          )}

          {grouping && selected.size > 0 && (
            <div className="space-y-3 border border-sage-600/20 bg-sage-50 p-3" aria-label="선택 인원 그룹화">
              <p className="text-sm font-medium text-neutral-700">{selected.size}명을 어느 그룹에 추가할까요?</p>
              <p className="text-xs text-neutral-500 break-words">
                {(rows ?? []).filter((m) => selected.has(m.id)).map((m) => m.name).join(", ")}
              </p>
              <select aria-label="그룹 지정" value={target} disabled={busy}
                onChange={(e) => { setTarget(e.target.value); requestId.current = null; }}
                className="w-full min-w-0 border border-neutral-200 bg-white p-2 text-sm">
                <option value="new">새 그룹 만들기</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {target === "new" && <input aria-label="새 그룹 이름" placeholder="예: 대학 친구들"
                value={groupName} maxLength={100} disabled={busy}
                onChange={(e) => { setGroupName(e.target.value); requestId.current = null; }}
                className="w-full border border-neutral-200 bg-white p-2 text-sm" />}
              <p className="text-xs text-neutral-500">기존 링크를 다시 보낼 필요 없어요. 접수된 개인 주문도 그대로 유지돼요.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={groupSelected} disabled={busy || (target === "new" && !groupName.trim())}
                  className="px-3 py-2 bg-sage-600 text-white text-xs disabled:opacity-50">
                  {busy ? "저장 중…" : target === "new" ? `새 그룹 만들고 ${selected.size}명 추가` : `그룹에 ${selected.size}명 추가`}
                </button>
                <button type="button" onClick={() => setGrouping(false)} disabled={busy} className="px-3 py-2 text-xs text-neutral-500">취소</button>
              </div>
            </div>
          )}

          {orderMember && <SoloOrderForm key={orderMember.id} member={orderMember}
            api={api} setError={setError} setNotice={setNotice}
            onClose={() => setOrderMember(null)} onCreated={load} />}

          <ul className="space-y-2">
            {(rows ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 px-1">
                <label className="flex items-center gap-2 py-2 min-w-0 max-w-full">
                  <input type="checkbox" aria-label={`${m.name} 선택`} checked={selected.has(m.id)}
                    disabled={busy} onChange={() => selectMember(m.id)} />
                  <span className="break-all">{m.name}</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  aria-label={`${m.name} 연락처`}
                  disabled={busy}
                  value={phoneValues[m.id] ?? m.phone ?? ""}
                  placeholder="010-0000-0000"
                  onChange={(e) => {
                    const value = formatPhone(e.target.value);
                    phoneDrafts.current.set(m.id, value);
                    setPhoneValues((current) => ({ ...current, [m.id]: value }));
                  }}
                  onBlur={(e) => savePhone(m, formatPhone(e.target.value))}
                  className="flex-1 min-w-24 border border-neutral-200 px-2 py-1 text-xs"
                />
                {m.applied && (
                  <span className="text-[10px] whitespace-nowrap text-sage-700">신청</span>
                )}
                <button type="button" disabled={busy || Boolean(m.applied)}
                  aria-label={`${m.name} 주문 생성`}
                  onClick={async () => {
                    if (await savePhone(m, phoneDrafts.current.get(m.id) ?? m.phone ?? ""))
                      setOrderMember({ ...m, phone: phoneValues[m.id] ?? m.phone });
                  }}
                  className="text-xs text-sage-700 whitespace-nowrap disabled:opacity-40">주문 생성</button>
                <button
                  onClick={() => issue(m)}
                  disabled={busy}
                  className={`text-xs whitespace-nowrap disabled:opacity-60 ${
                    m.invited_at ? "text-neutral-400" : "text-sage-700"
                  }`}
                  title="개인 주문 링크 — 이름·연락처가 자동 입력됩니다"
                >
                  {m.invited_at ? "링크 ✓" : "링크"}
                </button>
                <button onClick={() => remove(m)} disabled={busy} className="text-xs text-red-600 disabled:opacity-50">
                  삭제
                </button>
              </li>
            ))}
            {rows !== null && rows.length === 0 && (
              <li className="text-xs text-neutral-400 px-1">
                아직 없어요. 이름만 넣어도 등록됩니다.
              </li>
            )}
            {rows === null && (
              <li className="text-xs text-neutral-400 px-1">불러오는 중…</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
