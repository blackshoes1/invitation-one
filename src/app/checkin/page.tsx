"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  supabase,
  isSupabaseConfigured,
  type CheckinSummary,
} from "@/lib/supabase";
import { groom, bride } from "@/lib/wedding";

/**
 * 현장 체크인 (GX-4) — 예식장에서 QR 로 진입, 참석 인원을 체크인.
 * 실시간 식수 합계를 함께 보여준다. (공개 페이지, 초대 키 불필요)
 */
type Side = "신랑" | "신부" | null;

export default function CheckinPage() {
  const [name, setName] = useState("");
  const [party, setParty] = useState(1);
  const [side, setSide] = useState<Side>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CheckinSummary | null>(null);

  const loadSummary = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data } = await supabase.rpc("get_checkin_summary");
    if (Array.isArray(data) && data[0]) setSummary(data[0] as CheckinSummary);
  };

  // 이미 체크인한 기기면 완료 화면부터 + 실시간 합계 폴링
  useEffect(() => {
    try {
      if (localStorage.getItem("checkin-done") === "1") setDone(true);
    } catch {
      /* 무시 */
    }
    loadSummary();
    const t = setInterval(loadSummary, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError("잠시 후 다시 시도해주세요 🙏");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("submit_checkin", {
        p_name: name.trim() || null,
        p_party: party,
        p_side: side,
      });
      if (error) {
        setError("체크인에 실패했어요. 다시 시도해주세요.");
        return;
      }
      if (Array.isArray(data) && data[0]) {
        setSummary((prev) => ({
          total_checkins: data[0].total_checkins,
          total_people: data[0].total_people,
          groom: prev?.groom ?? 0,
          bride: prev?.bride ?? 0,
        }));
      }
      try {
        localStorage.setItem("checkin-done", "1");
      } catch {
        /* 무시 */
      }
      setDone(true);
      loadSummary();
    } catch {
      setError("체크인 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-wedding-cream flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-xs bg-white border border-wedding-gold/20 rounded-2xl px-6 py-8 text-center space-y-6">
        <div className="space-y-1">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            CHECK-IN
          </p>
          <h1 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            현장 체크인
          </h1>
          <p className="text-xs text-neutral-400 pt-1">
            {groom.name} <span className="text-wedding-gold">♥</span> {bride.name}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="text-4xl">🎉</div>
              <p className="text-sm text-sage-700 font-medium">
                체크인 되었어요! 와주셔서 감사합니다 💐
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 text-left"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성함 (선택)"
                className="w-full p-2.5 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600 text-center"
              />

              {/* 신랑측 / 신부측 */}
              <div className="grid grid-cols-2 gap-2">
                {(["신랑", "신부"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide((cur) => (cur === s ? null : s))}
                    className={`py-2 text-sm rounded-md border transition-colors ${
                      side === s
                        ? "bg-sage-600 text-white border-sage-600 font-bold"
                        : "bg-white text-neutral-500 border-wedding-gold/20"
                    }`}
                  >
                    {s}측
                  </button>
                ))}
              </div>

              {/* 인원 스텝퍼 */}
              <div>
                <p className="text-[11px] text-neutral-400 mb-1.5 text-center">
                  함께 오신 인원
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setParty((p) => Math.max(1, p - 1))}
                    className="w-10 h-10 rounded-full border border-wedding-gold/30 text-lg text-sage-700"
                    aria-label="인원 줄이기"
                  >
                    −
                  </button>
                  <span className="text-2xl font-bold text-sage-700 w-12 text-center">
                    {party}
                  </span>
                  <button
                    type="button"
                    onClick={() => setParty((p) => Math.min(20, p + 1))}
                    className="w-10 h-10 rounded-full border border-wedding-gold/30 text-lg text-sage-700"
                    aria-label="인원 늘리기"
                  >
                    +
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="w-full py-3.5 bg-sage-700 text-white text-sm font-medium tracking-wide disabled:opacity-60 rounded-md"
              >
                {busy ? "체크인 중…" : `${party}명 체크인하기`}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 실시간 식수 합계 */}
        {summary && (
          <div className="border-t border-wedding-gold/10 pt-4">
            <p className="text-[11px] text-neutral-400">지금까지</p>
            <p className="text-sm text-sage-700 mt-0.5">
              <span className="font-bold text-lg">{summary.total_people}</span>명
              참석 · {summary.total_checkins}팀 체크인
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
