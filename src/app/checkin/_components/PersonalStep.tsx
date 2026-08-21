"use client";

import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import type { Guest } from "./types";
import { SIDE_LABEL } from "./constants";
import { Stepper, BigButton, WindowNotice } from "./ui";

export function PersonalStep({
  guest,
  windowBlocked,
  windowState,
  party,
  setParty,
  error,
  busy,
  onSubmit,
}: {
  guest: Guest;
  windowBlocked: boolean;
  windowState: string;
  party: number;
  setParty: Dispatch<SetStateAction<number>>;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <motion.div
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
          <BigButton onClick={onSubmit} disabled={busy}>
            {busy ? "체크인 중…" : `${party}명 체크인하기`}
          </BigButton>
        </>
      )}
    </motion.div>
  );
}
