"use client";

import { useEffect, useState } from "react";
import type { Participant } from "@/lib/supabase";
import type { TabCtx } from "@/app/admin/shared";

/** 방명록(마음 배송) 탭 — 메시지 목록 + 공개 답글(LC-3). 마운트 시 자체 로드. */
export default function MessagesTab({
  api,
  setError,
  setNotice: _setNotice,
  groupName,
}: TabCtx & {
  /** 그룹 id → 표시명 (그룹 목록은 부모가 보유) */
  groupName: (id: string | null) => string;
}) {
  void _setNotice; // TabCtx 시그니처 유지용 (이 탭은 notice 미사용)
  const [messages, setMessages] = useState<Participant[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySaving, setReplySaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/admin/messages");
        const j = await res.json();
        if (alive) setMessages(res.ok ? j.messages ?? [] : []);
      } catch {
        if (alive) setError("방명록을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 공개 설정 전환 (익명/한글자/실명 · 비공개) */
  const setVisibility = async (
    id: string,
    patch: { display_mode?: "anon" | "initial" | "name"; is_private?: boolean }
  ) => {
    try {
      const res = await api("/api/admin/messages", {
        method: "PATCH",
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) return setError("공개 설정 변경에 실패했습니다.");
      const j = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...j.participant } : m)));
    } catch {
      setError("공개 설정 변경 요청이 실패했습니다. 네트워크를 확인해주세요.");
    }
  };

  const att = {
    yes: messages.filter((m) => m.attendance === "yes").length,
    maybe: messages.filter((m) => m.attendance === "maybe").length,
    no: messages.filter((m) => m.attendance === "no").length,
  };

  /** 방명록 공개 답글 저장/삭제 (LC-3) — 빈 문자열이면 답글 삭제 */
  const saveReply = async (id: string, reply: string) => {
    setReplySaving(id);
    try {
      const res = await api("/api/admin/messages", {
        method: "PATCH",
        body: JSON.stringify({ id, reply }),
      });
      if (res.ok) {
        const j = await res.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, reply: j.participant?.reply ?? null, replied_at: j.participant?.replied_at ?? null }
              : m
          )
        );
      } else {
        setError("답글 저장에 실패했습니다. 다시 시도해주세요.");
      }
    } catch {
      setError("답글 저장 요청이 실패했습니다. 네트워크를 확인해주세요.");
    } finally {
      setReplySaving(null);
    }
  };

  return (
    <>
      {loading && (
        <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
      )}
      {!loading && messages.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-10">
          받은 메시지가 없습니다.
        </p>
      )}
      {!loading && messages.length > 0 && (
        <p className="text-[11px] text-neutral-400 mb-2">
          결혼식 참석(한마디 남길 때 선택): 참석 {att.yes} · 미정 {att.maybe} · 불참 {att.no}
          {" "}· 미응답 {messages.length - att.yes - att.maybe - att.no}
        </p>
      )}
      <div className="space-y-2">
        {messages.map((m) => {
          const mode = m.display_mode ?? "name";
          const modeLabel =
            mode === "anon" ? `익명 · ${m.anon_alias ?? "별명"}` : mode === "initial" ? "한 글자 가림" : "실명";
          const attLabel =
            m.attendance === "yes" ? "참석" : m.attendance === "maybe" ? "미정" : m.attendance === "no" ? "불참" : null;
          const draft = replyDrafts[m.id] ?? m.reply ?? "";
          const dirty = draft.trim() !== (m.reply ?? "").trim();
          const saving = replySaving === m.id;
          return (
            <div
              key={m.id}
              className="bg-white border border-wedding-gold/15 p-3 text-sm space-y-2"
            >
              <div className="flex gap-3">
                <span className="text-xl shrink-0">{m.stamp ?? "💌"}</span>
                <div className="min-w-0">
                  <p className="font-medium text-sage-700">
                    {m.name}{" "}
                    <span className="text-[11px] text-neutral-400 font-normal">
                      {groupName(m.group_id)}
                      {m.region ? ` · 📍 ${m.region}` : ""}
                      {m.phone ? ` · ${m.phone}` : ""}
                    </span>
                  </p>
                  {m.message && (
                    <p className="text-xs text-neutral-500 break-words">{m.message}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded-sm ${m.is_private ? "bg-neutral-200 text-neutral-600" : "bg-sage-100 text-sage-700"}`}>
                      {m.is_private ? "🔒 비공개" : `공개 · ${modeLabel}`}
                    </span>
                    {m.show_region === false && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-neutral-100 text-neutral-500">지역 숨김</span>
                    )}
                    {attLabel && (
                      <span className="px-1.5 py-0.5 rounded-sm bg-wedding-gold/15 text-sage-700">결혼식 {attLabel}</span>
                    )}
                    {!m.is_private && (
                      <button
                        type="button"
                        onClick={() => setVisibility(m.id, { display_mode: mode === "anon" ? "name" : "anon" })}
                        className="underline text-neutral-400"
                      >
                        {mode === "anon" ? "실명으로" : "익명으로"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setVisibility(m.id, { is_private: !m.is_private })}
                      className="underline text-neutral-400"
                    >
                      {m.is_private ? "공개로 전환" : "비공개로"}
                    </button>
                  </p>
                </div>
              </div>
              {/* 공개 답글 (LC-3) — 청첩장 피드에 함께 노출됨 */}
              <div className="pl-9 space-y-1.5">
                <textarea
                  value={draft}
                  onChange={(e) =>
                    setReplyDrafts((d) => ({ ...d, [m.id]: e.target.value }))
                  }
                  rows={2}
                  placeholder="💌 신랑·신부 공개 답글 남기기 (하객에게 보여요)"
                  className="w-full resize-none rounded-sm border border-wedding-gold/20 bg-wedding-cream/40 px-2.5 py-1.5 text-xs text-neutral-600 placeholder:text-neutral-400 focus:outline-none focus:border-wedding-gold/50"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!dirty || saving}
                    onClick={() => saveReply(m.id, draft)}
                    className="px-3 py-1 text-[11px] rounded-sm bg-sage-600 text-white disabled:opacity-40"
                  >
                    {saving ? "저장 중…" : m.reply ? "답글 수정" : "답글 등록"}
                  </button>
                  {m.reply && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setReplyDrafts((d) => ({ ...d, [m.id]: "" }));
                        saveReply(m.id, "");
                      }}
                      className="px-3 py-1 text-[11px] rounded-sm border border-neutral-300 text-neutral-500 disabled:opacity-40"
                    >
                      삭제
                    </button>
                  )}
                  {m.reply && !dirty && (
                    <span className="text-[10px] text-sage-500">게시됨 ✓</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
