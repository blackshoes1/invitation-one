"use client";

import { useState } from "react";
import type { GroupMemberRow } from "@/lib/supabase";
import { formatPhone } from "@/lib/wedding";
import type { TabCtx } from "@/app/admin/shared";

/**
 * 개별 초대 — 모임에 속하지 않은 사람에게 이름·연락처가 자동 입력되는 링크를 준다.
 *
 * 예전에는 링크를 주려면 그 사람만을 위한 그룹을 먼저 만들어야 했다
 * (`group_members.group_id` 가 not null 이었다). 지금은 그룹 없이 등록한다.
 * 여기 등록된 사람의 주문은 항상 **개인 주문**이다 — 그룹 페이지를 거치지 않으므로.
 */
export default function SoloInvites({ api, setError, setNotice }: TabCtx) {
  const [rows, setRows] = useState<GroupMemberRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
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

  const savePhone = async (m: GroupMemberRow, next: string) => {
    const v = next.trim();
    if ((m.phone ?? "") === v) return;
    const res = await api("/api/admin/invitees", {
      method: "PATCH",
      body: JSON.stringify({ member_id: m.id, phone: v || null }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error ?? "연락처 저장에 실패했습니다.");
    setRows((r) => (r ?? []).map((x) => (x.id === m.id ? (j.member as GroupMemberRow) : x)));
  };

  const remove = async (m: GroupMemberRow) => {
    if (!confirm(`${m.name} 님을 개별 초대에서 삭제할까요?`)) return;
    const res = await api(`/api/admin/invitees?member_id=${m.id}`, { method: "DELETE" });
    if (!res.ok) return setError("삭제에 실패했습니다.");
    setRows((r) => (r ?? []).filter((x) => x.id !== m.id));
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
            입력되는 링크</b>를 보낼 때 씁니다. 그룹을 만들 필요가 없어요. 여기 등록한
            분의 신청은 항상 <b className="text-neutral-600">개인 주문</b>으로 잡힙니다.
          </p>

          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-28 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
            />
            <input
              type="tel"
              inputMode="tel"
              value={phone}
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

          <ul className="space-y-1">
            {(rows ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm text-neutral-600 px-1">
                <span className="shrink-0 min-w-[3.5rem]">{m.name}</span>
                <input
                  key={`${m.id}-${m.phone ?? ""}`}
                  type="tel"
                  inputMode="tel"
                  defaultValue={m.phone ?? ""}
                  placeholder="010-0000-0000"
                  onBlur={(e) => savePhone(m, formatPhone(e.target.value))}
                  className="flex-1 min-w-0 border border-neutral-200 px-2 py-1 text-xs"
                />
                {m.applied && (
                  <span className="text-[10px] whitespace-nowrap text-sage-700">신청</span>
                )}
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
                <button onClick={() => remove(m)} className="text-xs text-red-600">
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
