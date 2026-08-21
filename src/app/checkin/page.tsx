"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { groom, bride } from "@/lib/wedding";
import type { Guest, DoneInfo, Candidate, Mode } from "./_components/types";
import { WINDOW_MSG } from "./_components/constants";
import { WindowNotice } from "./_components/ui";
import { LoadingView, InvalidView, GuideView } from "./_components/StatusViews";
import { PersonalStep } from "./_components/PersonalStep";
import { SearchStep } from "./_components/SearchStep";
import { ConfirmStep } from "./_components/ConfirmStep";
import { DoneView } from "./_components/DoneView";

/**
 * 현장 체크인 v2 (docs/CHECKIN_SEATING_SPEC.md §4.2~4.4, §13)
 * - ?t=<token>      : 개인 QR — 예약 확인 → 실제 인원 → 체크인 → 좌석 안내
 * - ?event=<행사키> : 예식장 공용 QR — 이름+뒤4자리로 RSVP 검색 후 체크인
 * - 파라미터 없음   : 안내 화면 (QR 스캔 / 안내데스크 유도)
 * 현장 등록(walk-in)은 안내데스크(관리자 현장운영 탭) 전용 — 공개 API 없음.
 * 체크인 상태는 항상 서버 기록으로 판단. 레거시 localStorage 플래그는 제거만 한다.
 */

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
          {mode === "loading" && <LoadingView key="loading" />}

          {mode === "invalid" && <InvalidView key="invalid" />}

          {mode === "guide" && <GuideView key="guide" />}

          {mode === "personal" && guest && (
            <PersonalStep
              key="personal"
              guest={guest}
              windowBlocked={windowBlocked}
              windowState={windowState}
              party={party}
              setParty={setParty}
              error={error}
              busy={busy}
              onSubmit={submitPersonal}
            />
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
                <SearchStep
                  sName={sName}
                  setSName={setSName}
                  sLast4={sLast4}
                  setSLast4={setSLast4}
                  candidates={candidates}
                  error={error}
                  busy={busy}
                  onSubmit={submitSearch}
                  onPick={(c) => {
                    setPicked(c);
                    setParty(c.expectedPartySize);
                    setError(null);
                  }}
                />
              ) : windowBlocked ? (
                <WindowNotice state={windowState} />
              ) : (
                <ConfirmStep
                  picked={picked}
                  party={party}
                  setParty={setParty}
                  error={error}
                  busy={busy}
                  onSubmit={submitCommon}
                  onReset={() => {
                    setPicked(null);
                    setCandidates(null);
                    setError(null);
                  }}
                />
              )}
            </motion.div>
          )}

          {mode === "done" && done && <DoneView key="done" done={done} />}
        </AnimatePresence>
      </div>
    </main>
  );
}
