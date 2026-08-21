"use client";

import type { Candidate } from "./types";
import { SIDE_LABEL } from "./constants";
import { BigButton } from "./ui";

export function SearchStep({
  sName,
  setSName,
  sLast4,
  setSLast4,
  candidates,
  error,
  busy,
  onSubmit,
  onPick,
}: {
  sName: string;
  setSName: (v: string) => void;
  sLast4: string;
  setSLast4: (v: string) => void;
  candidates: Candidate[] | null;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  onPick: (c: Candidate) => void;
}) {
  return (
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
      <BigButton onClick={onSubmit} disabled={busy}>
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
              onClick={() => onPick(c)}
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
  );
}
