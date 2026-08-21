"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { groom, bride } from "@/lib/wedding";

/**
 * 현장 체크인 v2 (docs/CHECKIN_SEATING_SPEC.md §4.2~4.4, §13)
 * - ?t=<token>      : 개인 QR — 예약 확인 → 실제 인원 → 체크인 → 좌석 안내
 * - ?event=<행사키> : 예식장 공용 QR — 이름+뒤4자리로 RSVP 검색 후 체크인
 * - 파라미터 없음   : 안내 화면 (QR 스캔 / 안내데스크 유도)
 * 현장 등록(walk-in)은 안내데스크(관리자 현장운영 탭) 전용 — 공개 API 없음.
 * 체크인 상태는 항상 서버 기록으로 판단. 레거시 localStorage 플래그는 제거만 한다.
 */

const SIDE_LABEL: Record<string, string> = { groom: "신랑측", bride: "신부측" };

const WINDOW_MSG: Record<string, string> = {
  checkin_not_enabled: "현장 체크인이 아직 준비 중이에요.\n안내데스크에 문의해 주세요.",
  checkin_not_open: "체크인은 예식 당일에 열려요.\n조금만 기다려 주세요.",
  checkin_closed: "현장 체크인이 종료되었습니다.\n안내데스크에 문의해 주세요.",
};

interface Guest {
  displayName: string;
  side: string | null;
  expectedPartySize: number;
  children?: number;
}
interface Seat {
  tableName: string;
  zone: string | null;
  floor: string | null;
  locationNote: string | null;
}
interface DoneInfo {
  name: string;
  actual: number;
  seat: Seat | null;
  already: boolean;
  checkedInAt?: string | null;
}
interface Candidate {
  rsvpId: string;
  displayName: string;
  side: string | null;
  expectedPartySize: number;
  alreadyCheckedIn: boolean;
  maskedPhone: string | null;
}

type Mode = "loading" | "personal" | "invalid" | "guide" | "search" | "done";

export default function CheckinPage() {
  const [mode, setMode] = useState<Mode>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [windowState, setWindowState] = useState<string>("ok");
  const [party, setParty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneInfo | null>(null);

  // 공용 — RSVP 검색
  const [sName, setSName] = useState("");
  const [sLast4, setSLast4] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);

  useEffect(() => {
    // 레거시 플래그 정리 (§13) — 상태 판단에 사용하지 않음
    try {
      localStorage.removeItem("checkin-done");
    } catch {
      /* 무시 */
    }

    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    const ev = params.get("event");
    // URL 쿼리(브라우저 전용) → 마운트 후 상태 반영
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ev) setEventKey(ev);

    if (!t) {
      setMode(ev ? "search" : "guide");
      return;
    }
    setToken(t);

    (async () => {
      try {
        const res = await fetch(`/api/checkin/pass?t=${encodeURIComponent(t)}`);
        const j = await res.json();
        if (!j.valid) {
          setMode("invalid");
          return;
        }
        setWindowState(j.window ?? "ok");
        setGuest(j.guest);
        if (j.alreadyCheckedIn) {
          setDone({
            name: j.guest.displayName,
            actual: j.checkin?.actualPartySize ?? j.guest.expectedPartySize,
            seat: j.seat ?? null,
            already: true,
            checkedInAt: j.checkin?.checkedInAt ?? null,
          });
          setMode("done");
        } else {
          setParty(j.guest.expectedPartySize);
          setMode("personal");
        }
      } catch {
        setMode("invalid");
      }
    })();
  }, []);

  /** 개인 QR 체크인 */
  const submitPersonal = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkin/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, actualPartySize: party }),
      });
      const j = await res.json();
      if (j.result === "checked_in" || j.result === "already_checked_in") {
        setDone({
          name: guest?.displayName ?? "",
          actual: j.checkin?.actualPartySize ?? party,
          seat: j.seat ?? null,
          already: j.result === "already_checked_in",
        });
        setMode("done");
      } else if (WINDOW_MSG[j.result]) {
        setWindowState(j.result);
      } else if (j.result === "not_attending") {
        setError("불참으로 변경된 예약이에요. 안내데스크에 문의해 주세요.");
      } else {
        setError("체크인에 실패했어요. 다시 시도하거나 안내데스크에 문의해 주세요.");
      }
    } catch {
      setError("연결이 원활하지 않아요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  /** 공용 — RSVP 검색 */
  const submitSearch = async () => {
    if (busy) return;
    if (sName.trim().length < 2 || sLast4.replace(/\D/g, "").length !== 4) {
      setError("성함과 전화번호 뒤 4자리를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey, name: sName.trim(), last4: sLast4 }),
      });
      const j = await res.json();
      if (j.error === "event_key") {
        setError("QR 을 다시 스캔해 주세요. 계속 안 되면 안내데스크로 와주세요.");
        return;
      }
      if (j.error === "window") {
        setError(
          j.state === "checkin_closed"
            ? "체크인이 마감됐어요. 안내데스크로 와주세요."
            : "아직 체크인 시간이 아니에요. 잠시 후 다시 시도해 주세요."
        );
        return;
      }
      if (j.error === "rate_limited") {
        setError("시도가 너무 많아요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const list: Candidate[] = j.candidates ?? [];
      setCandidates(list);
      if (list.length === 0)
        setError("예약을 찾지 못했어요. 안내데스크에서 등록을 도와드릴게요.");
      if (list.length === 1 && !list[0].alreadyCheckedIn) {
        setPicked(list[0]);
        setParty(list[0].expectedPartySize);
      }
    } catch {
      setError("검색에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  /** 공용 — 검색된 RSVP 체크인 */
  const submitCommon = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkin/common", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventKey,
          rsvpId: picked.rsvpId,
          last4: sLast4,
          actualPartySize: party,
        }),
      });
      const j = await res.json();
      if (j.result === "checked_in" || j.result === "already_checked_in") {
        setDone({
          name: picked.displayName,
          actual: j.checkin?.actualPartySize ?? party,
          seat: j.seat ?? null,
          already: j.result === "already_checked_in",
        });
        setMode("done");
      } else if (WINDOW_MSG[j.result]) {
        setWindowState(j.result);
      } else {
        setError("체크인에 실패했어요. 안내데스크에 문의해 주세요.");
      }
    } catch {
      setError("연결이 원활하지 않아요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const windowBlocked = windowState !== "ok";

  return (
    <main className="min-h-screen bg-wedding-cream flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm bg-white border border-wedding-gold/20 rounded-2xl px-6 py-8 text-center space-y-6">
        <div className="space-y-1">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            CHECK-IN
          </p>
          <h1 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            현장 체크인
          </h1>
          <p className="text-sm text-neutral-400 pt-1">
            {groom.name} <span className="text-wedding-gold">♥</span> {bride.name}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {mode === "loading" && (
            <motion.p
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-neutral-400 py-8"
            >
              예약 정보를 확인하고 있어요…
            </motion.p>
          )}

          {mode === "invalid" && (
            <motion.div
              key="invalid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-5 py-4"
            >
              <div className="text-4xl">🙏</div>
              <p className="text-base text-sage-700 font-medium leading-relaxed">
                QR 을 확인하지 못했어요.
              </p>
              <p className="text-sm text-neutral-500 leading-relaxed">
                링크가 만료되었거나 잘못된 QR 일 수 있어요.
                <br />
                예식장에 있는 공용 QR 을 스캔하시거나
                <br />
                안내데스크에 문의해 주세요.
              </p>
            </motion.div>
          )}

          {mode === "guide" && (
            <motion.div
              key="guide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-5 py-4"
            >
              <div className="text-4xl">📷</div>
              <p className="text-base text-sage-700 font-medium leading-relaxed">
                체크인은 QR 로 진행돼요.
              </p>
              <p className="text-sm text-neutral-500 leading-relaxed">
                받으신 개인 QR 또는 예식장에 있는
                <br />
                공용 QR 을 스캔해 주세요.
                <br />
                도움이 필요하면 안내데스크로 와주세요.
              </p>
            </motion.div>
          )}

          {mode === "personal" && guest && (
            <motion.div
              key="personal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <p className="text-xl font-medium text-sage-700">
                  {guest.displayName}님, 환영합니다
                </p>
                <p className="text-sm text-neutral-500">
                  {guest.side && `${SIDE_LABEL[guest.side] ?? ""} · `}예약 인원{" "}
                  <b className="text-sage-700">{guest.expectedPartySize}명</b>
                  {guest.children ? ` (어린이 ${guest.children}명 포함)` : ""}
                </p>
              </div>

              {windowBlocked ? (
                <WindowNotice state={windowState} />
              ) : (
                <>
                  <Stepper
                    label="오늘 함께 오신 인원이 맞나요?"
                    value={party}
                    setValue={setParty}
                  />
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <BigButton onClick={submitPersonal} disabled={busy}>
                    {busy ? "체크인 중…" : `${party}명 체크인하기`}
                  </BigButton>
                </>
              )}
            </motion.div>
          )}

          {mode === "search" && (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 text-left"
            >
              {!picked ? (
                <>
                  <p className="text-sm text-neutral-500 text-center leading-relaxed">
                    참석 의사를 전해주셨던 성함으로 찾아드릴게요.
                  </p>
                  <input
                    value={sName}
                    onChange={(e) => setSName(e.target.value)}
                    placeholder="성함"
                    className="w-full p-3.5 text-base text-center border border-wedding-gold/25 bg-white rounded-md focus:outline-none focus:border-sage-600"
                  />
                  <input
                    value={sLast4}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setSLast4(e.target.value.replace(/\D/g, ""))}
                    placeholder="전화번호 뒤 4자리"
                    className="w-full p-3.5 text-base text-center border border-wedding-gold/25 bg-white rounded-md focus:outline-none focus:border-sage-600"
                  />
                  {error && (
                    <p className="text-sm text-red-400 text-center">{error}</p>
                  )}
                  <BigButton onClick={submitSearch} disabled={busy}>
                    {busy ? "찾는 중…" : "예약 찾기"}
                  </BigButton>

                  {candidates && candidates.length > 1 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-neutral-400 text-center">
                        같은 이름의 예약이 여러 건이에요. 본인 예약을 선택해 주세요.
                      </p>
                      {candidates.map((c) => (
                        <button
                          key={c.rsvpId}
                          type="button"
                          disabled={c.alreadyCheckedIn}
                          onClick={() => {
                            setPicked(c);
                            setParty(c.expectedPartySize);
                            setError(null);
                          }}
                          className="w-full p-3 border border-wedding-gold/20 rounded-md text-left text-sm disabled:opacity-50"
                        >
                          <b className="text-sage-700">{c.displayName}</b>
                          <span className="text-neutral-400">
                            {" "}
                            · {c.side ? SIDE_LABEL[c.side] : "-"} ·{" "}
                            {c.maskedPhone ?? ""}
                            {c.alreadyCheckedIn && " · 체크인 완료"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {candidates?.length === 1 && candidates[0].alreadyCheckedIn && (
                    <p className="text-sm text-sage-700 text-center leading-relaxed">
                      이미 체크인된 예약이에요 🎉
                      <br />
                      인원 변경은 안내데스크에서 도와드려요.
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 text-center leading-relaxed pt-1">
                    참석 의사를 미리 전하지 못하셨나요?
                    <br />
                    안내데스크에서 바로 등록해 드려요.
                  </p>
                </>
              ) : windowBlocked ? (
                <WindowNotice state={windowState} />
              ) : (
                <div className="space-y-5 text-center">
                  <p className="text-lg font-medium text-sage-700">
                    {picked.displayName}님, 환영합니다
                  </p>
                  <p className="text-sm text-neutral-500">
                    예약 인원{" "}
                    <b className="text-sage-700">{picked.expectedPartySize}명</b>
                  </p>
                  <Stepper
                    label="오늘 함께 오신 인원이 맞나요?"
                    value={party}
                    setValue={setParty}
                  />
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <BigButton onClick={submitCommon} disabled={busy}>
                    {busy ? "체크인 중…" : `${party}명 체크인하기`}
                  </BigButton>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(null);
                      setCandidates(null);
                      setError(null);
                    }}
                    className="w-full text-center text-sm text-neutral-400 underline underline-offset-4"
                  >
                    다시 검색하기
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {mode === "done" && done && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5"
            >
              <div className="text-4xl">🎉</div>
              <p className="text-base text-sage-700 font-medium">
                {done.already ? "이미 체크인되어 있어요" : "체크인이 완료되었습니다"}
              </p>
              <p className="text-sm text-neutral-500">
                {done.name && (
                  <>
                    <b className="text-sage-700">{done.name}</b>님
                    {done.actual > 1 && ` 외 ${done.actual - 1}명`}
                  </>
                )}
                {done.checkedInAt &&
                  ` · ${new Date(done.checkedInAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} 체크인`}
              </p>

              {/* 좌석 카드 — 스크린샷하기 쉽게, 테이블명을 가장 크게 (§13) */}
              <div className="border border-wedding-gold/25 rounded-xl bg-wedding-cream/50 px-4 py-6 space-y-2">
                {done.seat ? (
                  <>
                    {done.seat.zone && (
                      <p className="text-sm text-neutral-500">{done.seat.zone}</p>
                    )}
                    <p className="text-3xl font-bold text-sage-700 tracking-wide">
                      {done.seat.tableName}
                    </p>
                    {done.seat.floor && (
                      <p className="text-sm text-neutral-500">{done.seat.floor}</p>
                    )}
                    {done.seat.locationNote && (
                      <p className="text-sm text-neutral-500 leading-relaxed pt-1">
                        {done.seat.locationNote}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-base text-sage-700 leading-relaxed">
                    좌석은 안내데스크에서 안내해 드릴게요.
                    <br />
                    <span className="text-sm text-neutral-500">
                      이 화면을 직원에게 보여주세요.
                    </span>
                  </p>
                )}
              </div>

              <p className="text-sm text-neutral-400">와주셔서 감사합니다 💐</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Stepper({
  label,
  value,
  setValue,
  min = 1,
}: {
  label: string;
  value: number;
  setValue: (f: (v: number) => number) => void;
  min?: number;
}) {
  return (
    <div>
      <p className="text-sm text-neutral-500 mb-2 text-center">{label}</p>
      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => setValue((p) => Math.max(min, p - 1))}
          className="w-12 h-12 rounded-full border border-wedding-gold/30 text-xl text-sage-700"
          aria-label="줄이기"
        >
          −
        </button>
        <span className="text-3xl font-bold text-sage-700 w-14 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => setValue((p) => Math.min(20, p + 1))}
          className="w-12 h-12 rounded-full border border-wedding-gold/30 text-xl text-sage-700"
          aria-label="늘리기"
        >
          +
        </button>
      </div>
    </div>
  );
}

function BigButton({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 text-base font-medium tracking-wide rounded-md transition-colors disabled:opacity-60 ${
        variant === "solid"
          ? "bg-sage-700 text-white"
          : "bg-white text-sage-700 border border-sage-600"
      }`}
    >
      {children}
    </button>
  );
}

function WindowNotice({ state }: { state: string }) {
  return (
    <p className="text-base text-sage-700 leading-relaxed whitespace-pre-line py-4">
      {WINDOW_MSG[state] ?? WINDOW_MSG.checkin_not_enabled}
    </p>
  );
}
