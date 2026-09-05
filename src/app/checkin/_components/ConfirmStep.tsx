"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Candidate } from "./types";
import { Stepper, BigButton } from "./ui";

export function ConfirmStep({
  picked,
  party,
  setParty,
  error,
  busy,
  onSubmit,
  onReset,
}: {
  picked: Candidate;
  party: number;
  setParty: Dispatch<SetStateAction<number>>;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  onReset: () => void;
}) {
  return (
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
      <BigButton onClick={onSubmit} disabled={busy}>
        {busy ? "체크인 중…" : `${party}명 체크인하기`}
      </BigButton>
      <button
        type="button"
        onClick={onReset}
        className="w-full text-center text-sm text-neutral-500 underline underline-offset-4"
      >
        다시 검색하기
      </button>
    </div>
  );
}
