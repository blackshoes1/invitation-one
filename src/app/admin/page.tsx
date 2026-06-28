"use client";

import { useState } from "react";
import type { Delivery, DeliveryStatus } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";

const TABS: DeliveryStatus[] = ["대기중", "확정", "완료"];
const NEXT_ACTION: Record<DeliveryStatus, DeliveryStatus | null> = {
  대기중: "확정",
  확정: "완료",
  완료: null,
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<DeliveryStatus>("대기중");
  const [rows, setRows] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (status: DeliveryStatus, pw = password) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/deliveries?status=${encodeURIComponent(status)}`, {
        headers: { "x-admin-password": pw },
      });
      if (res.status === 401) {
        setError("비밀번호가 올바르지 않습니다.");
        setAuthed(false);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "불러오기 실패");
        return;
      }
      setAuthed(true);
      setRows(json.deliveries ?? []);
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (id: string, status: DeliveryStatus) => {
    setNotice(null);
    const res = await fetch(`/api/admin/deliveries/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "변경 실패");
      return;
    }
    if (status === "확정") {
      const sms = json.sms;
      setNotice(
        sms?.skipped
          ? "확정됨 — SMS는 솔라피 키 미설정으로 발송되지 않았습니다."
          : sms?.ok
          ? "확정 및 SMS 발송 완료."
          : `확정됨 — SMS 발송 실패: ${sms?.error ?? ""}`
      );
    }
    load(tab);
  };

  const switchTab = (t: DeliveryStatus) => {
    setTab(t);
    load(t);
  };

  /* ----------------------------- 로그인 ----------------------------- */
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-wedding-cream px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load("대기중");
          }}
          className="w-full max-w-xs space-y-4 bg-white p-8 border border-wedding-gold/20"
        >
          <h1 className="font-serif text-lg text-sage-700 text-center tracking-widest">
            배달 신청 관리
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="관리자 비밀번호"
            className="w-full p-3 border border-wedding-gold/25 bg-transparent focus:outline-none focus:border-sage-600 text-sm text-sage-700 rounded-none"
          />
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sage-700 text-white text-xs tracking-[0.2em] disabled:opacity-60"
          >
            {loading ? "확인 중…" : "입장"}
          </button>
        </form>
      </main>
    );
  }

  /* ----------------------------- 목록 ----------------------------- */
  return (
    <main className="min-h-screen bg-wedding-cream px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="font-serif text-xl text-sage-700 tracking-widest text-center">
          배달 신청 관리
        </h1>

        <div className="flex justify-center gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`px-4 py-2 text-xs tracking-wider border ${
                tab === t
                  ? "bg-sage-700 text-white border-sage-700"
                  : "bg-white text-neutral-500 border-wedding-gold/20"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {notice && (
          <p className="text-xs text-center text-sage-700 bg-sage-50 py-2 border border-sage-200">
            {notice}
          </p>
        )}
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        {loading && <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-10">
            해당 상태의 신청이 없습니다.
          </p>
        )}

        <div className="space-y-3">
          {rows.map((r) => {
            const next = NEXT_ACTION[r.status];
            return (
              <div
                key={r.id}
                className="bg-white border border-wedding-gold/15 p-4 text-sm flex flex-col gap-2"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <p className="font-medium text-sage-700">
                      {r.name}{" "}
                      <span className="text-xs text-neutral-400 font-normal">
                        {r.phone}
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {formatYmdKo(r.date)} · {r.time_slot} · {r.location}
                    </p>
                    {r.message && (
                      <p className="text-xs text-neutral-400 pt-1">“{r.message}”</p>
                    )}
                  </div>
                  <span className="text-[11px] px-2 py-1 bg-sage-50 text-sage-600 border border-sage-200 whitespace-nowrap">
                    {r.status}
                  </span>
                </div>
                {next && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => changeStatus(r.id, next)}
                      className="px-3 py-1.5 text-xs bg-sage-600 text-white tracking-wide"
                    >
                      {next}으로 변경
                      {next === "확정" ? " (SMS 발송)" : ""}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
