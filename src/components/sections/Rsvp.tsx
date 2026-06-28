"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import FadeIn from "@/components/FadeIn";

type Eating = "yes" | "no" | "undecided";

interface FormState {
  name: string;
  side: "groom" | "bride";
  attending: boolean;
  companionCount: number;
  eating: Eating;
  memo: string;
}

const initial: FormState = {
  name: "",
  side: "groom",
  attending: true,
  companionCount: 0,
  eating: "yes",
  memo: "",
};

export default function Rsvp() {
  const [form, setForm] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSending(true);
    setError(null);

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("rsvp").insert({
        name: form.name.trim(),
        side: form.side,
        attending: form.attending,
        companion_count: form.attending ? form.companionCount : 0,
        eating: form.attending ? form.eating : "no",
        memo: form.memo.trim(),
      });
      if (error) {
        setSending(false);
        setError("전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } else {
      // 데모 모드: Supabase 키 미설정 시 콘솔에만 기록
      console.info("[RSVP demo]", form);
      await new Promise((r) => setTimeout(r, 400));
    }

    setSending(false);
    setSubmitted(true);
  };

  return (
    <section className="snap-start min-h-full flex flex-col justify-center px-6 py-16 bg-white">
      <div className="max-w-sm mx-auto space-y-9 text-center">
        <FadeIn className="space-y-3">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            RSVP
          </p>
          <h2 className="font-serif text-2xl font-light tracking-[0.15em] text-sage-700">
            참석 여부 안내
          </h2>
          <p className="text-xs text-neutral-500 leading-loose font-light pt-1 max-w-[280px] mx-auto">
            식사 준비와 원활한 예식 진행을 위해
            <br />
            참석 여부를 알려주시면 감사하겠습니다.
          </p>
        </FadeIn>

        {!submitted ? (
          <FadeIn>
            <form
              onSubmit={handleSubmit}
              className="text-left space-y-7 bg-wedding-cream/60 p-8 border border-wedding-gold/15 text-sm font-light"
            >
              <div className="space-y-2">
                <label
                  htmlFor="rsvp-name"
                  className="text-[11px] text-wedding-gold font-medium tracking-wider"
                >
                  성함
                </label>
                <input
                  id="rsvp-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="성함을 기입해 주세요"
                  className="w-full pb-2 border-b border-wedding-gold/25 bg-transparent focus:outline-none focus:border-sage-600 transition-colors text-sage-700 tracking-wide placeholder:text-neutral-300 rounded-none"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-[11px] text-wedding-gold font-medium tracking-wider">
                  구분
                </legend>
                <div className="grid grid-cols-2 gap-4">
                  {(["groom", "bride"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={form.side === s}
                      onClick={() => update("side", s)}
                      className={`py-2 text-xs tracking-widest transition-all border-b-2 ${
                        form.side === s
                          ? "border-wedding-gold text-sage-700 font-normal"
                          : "border-transparent text-neutral-400"
                      }`}
                    >
                      {s === "groom" ? "신랑측 하객" : "신부측 하객"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-[11px] text-wedding-gold font-medium tracking-wider">
                  참석 여부
                </legend>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "참석합니다", value: true },
                    { label: "마음으로 축하합니다", value: false },
                  ].map((item) => (
                    <button
                      key={String(item.value)}
                      type="button"
                      aria-pressed={form.attending === item.value}
                      onClick={() => update("attending", item.value)}
                      className={`py-2 text-xs tracking-wider transition-all border-b-2 ${
                        form.attending === item.value
                          ? "border-wedding-gold text-sage-700 font-normal"
                          : "border-transparent text-neutral-400"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {form.attending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6 pt-1"
                >
                  <div className="space-y-2">
                    <label
                      htmlFor="rsvp-companion"
                      className="text-[11px] text-wedding-gold font-medium tracking-wider"
                    >
                      동반 인원 (본인 제외)
                    </label>
                    <select
                      id="rsvp-companion"
                      value={form.companionCount}
                      onChange={(e) =>
                        update("companionCount", Number(e.target.value))
                      }
                      className="w-full pb-2 border-b border-wedding-gold/25 bg-transparent focus:outline-none focus:border-sage-600 transition-colors text-sage-700 rounded-none"
                    >
                      {[0, 1, 2, 3, 4].map((n) => (
                        <option key={n} value={n} className="bg-white">
                          {n}명
                        </option>
                      ))}
                    </select>
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-[11px] text-wedding-gold font-medium tracking-wider">
                      식사 여부
                    </legend>
                    <div className="grid grid-cols-3 gap-2 text-[11px] tracking-wider">
                      {[
                        { label: "식사함", value: "yes" },
                        { label: "식사 안 함", value: "no" },
                        { label: "미정", value: "undecided" },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          aria-pressed={form.eating === item.value}
                          onClick={() => update("eating", item.value as Eating)}
                          className={`py-1.5 transition-all border ${
                            form.eating === item.value
                              ? "border-sage-600 bg-sage-600 text-white"
                              : "border-wedding-gold/20 text-neutral-400"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </motion.div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="rsvp-memo"
                  className="text-[11px] text-wedding-gold font-medium tracking-wider"
                >
                  전하실 말씀
                </label>
                <textarea
                  id="rsvp-memo"
                  value={form.memo}
                  onChange={(e) => update("memo", e.target.value)}
                  placeholder="축하 메시지나 전달 사항을 적어주세요"
                  className="w-full p-3 border border-wedding-gold/20 bg-white focus:outline-none focus:border-wedding-gold transition-colors resize-none h-20 text-xs font-light tracking-wide placeholder:text-neutral-300"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full py-3.5 bg-sage-700 text-white font-light tracking-[0.2em] hover:bg-sage-700/90 transition-colors text-xs disabled:opacity-60"
              >
                {sending ? "보내는 중…" : "참석 정보 보내기"}
              </button>
            </form>
          </FadeIn>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-wedding-cream/60 p-10 border border-wedding-gold/15 space-y-3"
          >
            <CheckCircle
              className="text-wedding-gold mx-auto"
              size={28}
              strokeWidth={1}
            />
            <p className="text-sm font-normal text-sage-700 tracking-wide">
              참석 정보가 전달되었습니다.
            </p>
            <p className="text-xs text-neutral-500 leading-loose font-light">
              축하해 주셔서 진심으로 감사합니다.
              <br />
              예식 당일 반갑게 맞이하겠습니다.
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
}
