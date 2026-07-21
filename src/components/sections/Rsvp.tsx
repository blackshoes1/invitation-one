"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Copy } from "lucide-react";
import QRCode from "qrcode";
import { formatPhone, isValidPhone } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

type Eating = "yes" | "no" | "undecided";

interface FormState {
  name: string;
  phone: string;
  side: "groom" | "bride";
  attending: boolean;
  companionCount: number;
  children: number;
  kidsMeal: boolean;
  eating: Eating;
  memo: string;
}

const initial: FormState = {
  name: "",
  phone: "",
  side: "groom",
  attending: true,
  companionCount: 0,
  children: 0,
  kidsMeal: false,
  eating: "yes",
  memo: "",
};

export default function Rsvp({ submitToken }: { submitToken: string | null }) {
  const [form, setForm] = useState<FormState>(initial);
  // 허니팟 — 사람은 보지도 채우지도 않는 필드 (봇 차단, §11)
  const [website, setWebsite] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 개인 체크인 QR (신규 참석 제출 시에만 서버가 토큰을 일회 반환)
  const [passUrl, setPassUrl] = useState<string | null>(null);
  const [passQr, setPassQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError("성함을 2자 이상 입력해 주세요.");
    if (!isValidPhone(form.phone))
      return setError("연락처를 010-0000-0000 형식으로 입력해 주세요.");
    setError(null);
    setSending(true);

    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submitToken,
          website,
          name: form.name.trim(),
          phone: form.phone.trim(),
          side: form.side,
          attending: form.attending,
          companionCount: form.companionCount,
          children: form.children,
          kidsMeal: form.kidsMeal,
          eating: form.eating,
          memo: form.memo.trim(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        result?: string;
        passUrl?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setSending(false);
        return setError(j.error ?? "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
      setUpdated(j.result === "updated");
      if (j.passUrl) {
        const abs = `${window.location.origin}${j.passUrl}`;
        setPassUrl(abs);
        QRCode.toDataURL(abs, { margin: 1, width: 240 })
          .then(setPassQr)
          .catch(() => setPassQr(null));
      }
    } catch {
      setSending(false);
      return setError("전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    setSending(false);
    setSubmitted(true);
  };

  const copyPass = async () => {
    if (!passUrl) return;
    try {
      await navigator.clipboard.writeText(passUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드 미지원 무시 */
    }
  };

  return (
    <section className="px-6 py-24 bg-white border-t border-wedding-gold/10">
      <div className="max-w-sm mx-auto space-y-9 text-center">
        <FadeIn className="space-y-3">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            ATTENDANCE
          </p>
          <h2 className="font-serif text-2xl font-light tracking-[0.15em] text-sage-700">
            참석 의사 전하기
          </h2>
          <p className="text-xs text-neutral-500 leading-loose font-light pt-1 max-w-[280px] mx-auto">
            식사 준비와 원활한 진행을 위해
            <br />
            참석 의사를 전해주시면 감사하겠습니다.
          </p>
        </FadeIn>

        {!submitted ? (
          <FadeIn>
            <form
              onSubmit={handleSubmit}
              className="text-left space-y-7 bg-wedding-cream/60 p-8 border border-wedding-gold/15 text-sm font-light"
            >
              {/* 허니팟 — 시각적으로 숨김. 봇이 채우면 서버가 저장 없이 무시 */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
              />

              <Field label="성함">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="성함을 기입해 주세요"
                  className="rsvp-input"
                />
              </Field>

              <Field label="연락처">
                <input
                  type="tel"
                  inputMode="numeric"
                  required
                  value={form.phone}
                  onChange={(e) => update("phone", formatPhone(e.target.value))}
                  placeholder="010-0000-0000"
                  className="rsvp-input"
                />
              </Field>

              <Field label="구분">
                <div className="grid grid-cols-2 gap-4">
                  {(["groom", "bride"] as const).map((s) => (
                    <Toggle
                      key={s}
                      active={form.side === s}
                      onClick={() => update("side", s)}
                      label={s === "groom" ? "신랑측" : "신부측"}
                    />
                  ))}
                </div>
              </Field>

              <Field label="참석하시나요?">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "참석합니다", value: true },
                    { label: "마음으로 함께해요", value: false },
                  ].map((item) => (
                    <Toggle
                      key={String(item.value)}
                      active={form.attending === item.value}
                      onClick={() =>
                        update("attending", item.value as boolean)
                      }
                      label={item.label}
                    />
                  ))}
                </div>
              </Field>

              {form.attending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6 pt-1"
                >
                  <Field label="동반 인원 (본인 제외)">
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      {[0, 1, 2, 3, 4].map((n) => (
                        <Toggle
                          key={n}
                          active={form.companionCount === n}
                          onClick={() => update("companionCount", n)}
                          label={n === 4 ? "4+" : String(n)}
                        />
                      ))}
                    </div>
                  </Field>

                  {form.companionCount > 0 && (
                    <Field label="자녀 동반 시 자녀 수">
                      <div className="grid grid-cols-5 gap-2 text-xs">
                        {[0, 1, 2, 3, 4].map((n) => (
                          <Toggle
                            key={n}
                            active={form.children === n}
                            onClick={() => update("children", n)}
                            label={n === 4 ? "4+" : String(n)}
                          />
                        ))}
                      </div>
                    </Field>
                  )}

                  {form.children > 0 && (
                    <Field label="유아식 필요 여부">
                      <div className="grid grid-cols-2 gap-4">
                        <Toggle
                          active={form.kidsMeal}
                          onClick={() => update("kidsMeal", true)}
                          label="필요해요"
                        />
                        <Toggle
                          active={!form.kidsMeal}
                          onClick={() => update("kidsMeal", false)}
                          label="괜찮아요"
                        />
                      </div>
                    </Field>
                  )}

                  <Field label="식사 여부">
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {[
                        { label: "식사합니다", value: "yes" },
                        { label: "식사 안 해요", value: "no" },
                        { label: "미정", value: "undecided" },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => update("eating", item.value as Eating)}
                          className={`py-2 border transition-all ${
                            form.eating === item.value
                              ? "border-sage-600 bg-sage-600 text-white"
                              : "border-wedding-gold/20 text-neutral-400"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </motion.div>
              )}

              <Field label="전하실 말씀 (선택)">
                <textarea
                  value={form.memo}
                  maxLength={500}
                  onChange={(e) => update("memo", e.target.value)}
                  placeholder="축하 메시지를 남겨주세요"
                  className="w-full p-3 border border-wedding-gold/15 bg-white focus:outline-none focus:border-wedding-gold transition-colors resize-none h-20 text-base font-light tracking-wide placeholder:text-neutral-300"
                />
              </Field>

              {error && <p className="text-xs text-red-500 text-center">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="w-full py-3.5 bg-sage-700 text-white font-light tracking-[0.2em] hover:bg-sage-700/90 transition-colors text-xs disabled:opacity-60"
              >
                {sending ? "보내는 중…" : "참석 의사 전하기"}
              </button>
            </form>
          </FadeIn>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-wedding-cream/60 p-10 border border-wedding-gold/15 space-y-3"
          >
            <CheckCircle className="text-wedding-gold mx-auto" size={28} strokeWidth={1} />
            <p className="text-sm font-normal text-sage-700 tracking-wide">
              {updated
                ? "이미 전해주신 내역을 수정했어요 😊"
                : "참석 의사가 전달되었습니다."}
            </p>
            <p className="text-xs text-neutral-500 leading-loose font-light">
              축하해 주셔서 진심으로 감사합니다.
              <br />
              결혼식에서 반갑게 맞이하겠습니다.
            </p>

            {passUrl && (
              <div className="pt-4 space-y-3 border-t border-wedding-gold/15">
                <p className="text-[11px] tracking-[0.2em] text-wedding-gold font-medium">
                  내 입장 QR
                </p>
                {passQr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={passQr}
                    alt="입장 체크인 QR"
                    className="mx-auto w-36 h-36 border border-wedding-gold/15 bg-white p-1.5"
                  />
                )}
                <p className="text-[11px] text-neutral-500 leading-relaxed font-light">
                  예식 당일 이 QR 로 체크인하고 좌석을 안내받으세요.
                  <br />
                  화면을 캡처하거나 링크를 저장해 두시면 편해요.
                </p>
                <button
                  type="button"
                  onClick={copyPass}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-[11px] tracking-wider border border-sage-600 text-sage-700 hover:bg-sage-600 hover:text-white transition-colors"
                >
                  <Copy size={12} strokeWidth={1.5} />
                  {copied ? "복사되었어요!" : "체크인 링크 복사"}
                </button>
              </div>
            )}
            {updated && form.attending && (
              <p className="pt-2 text-[11px] text-neutral-400 leading-relaxed font-light">
                이전에 받으신 입장 QR 은 계속 사용하실 수 있어요.
                <br />
                링크를 잃어버리셨다면 예식장 안내데스크에서 도와드릴게요.
              </p>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] text-wedding-gold font-medium tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`py-2 text-xs tracking-wider transition-all border-b-2 ${
        active
          ? "border-wedding-gold text-sage-700 font-normal"
          : "border-transparent text-neutral-400"
      }`}
    >
      {label}
    </button>
  );
}
