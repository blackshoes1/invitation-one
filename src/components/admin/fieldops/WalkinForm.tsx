"use client";

import { useState } from "react";
import { SIDE_LABEL, type Act, type Flash } from "./types";

/** 현장 등록 (QR 없이 방문한 하객) */
export default function WalkinForm({
  busy,
  act,
  flash,
}: {
  busy: string | null;
  act: Act;
  flash: Flash;
}) {
  const [wOpen, setWOpen] = useState(false);
  const [wName, setWName] = useState("");
  const [wSide, setWSide] = useState<"groom" | "bride" | null>(null);
  const [wParty, setWParty] = useState(1);

  const addWalkin = () => {
    if (wName.trim().length < 2) return flash("⚠ 성함을 입력해 주세요");
    act(
      "walkin",
      () =>
        fetch("/api/admin/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: wName.trim(),
            side: wSide,
            actualPartySize: wParty,
          }),
        }),
      "현장 하객을 등록했어요"
    ).then(() => {
      setWName("");
      setWSide(null);
      setWParty(1);
      setWOpen(false);
    });
  };

  return (
    <div className="border border-wedding-gold/20 bg-white">
      <button
        onClick={() => setWOpen((o) => !o)}
        className="w-full py-2.5 text-xs text-sage-700 font-medium"
      >
        {wOpen ? "▲ 닫기" : "＋ 현장 하객 등록 (QR 없이 방문)"}
      </button>
      {wOpen && (
        <div className="p-3 pt-0 space-y-2">
          <div className="flex gap-2">
            <input
              value={wName}
              onChange={(e) => setWName(e.target.value)}
              placeholder="성함"
              className="flex-1 p-2.5 text-sm border border-wedding-gold/20 rounded-md focus:outline-none"
            />
            {(["groom", "bride"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setWSide((c) => (c === s ? null : s))}
                className={`px-3 text-xs border rounded-md ${wSide === s ? "bg-sage-600 text-white border-sage-600" : "text-neutral-500 border-wedding-gold/20"}`}
              >
                {SIDE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">인원</span>
            <button onClick={() => setWParty((p) => Math.max(1, p - 1))} className="w-8 h-8 border border-wedding-gold/25 rounded-full">−</button>
            <b className="text-sage-700">{wParty}</b>
            <button onClick={() => setWParty((p) => Math.min(20, p + 1))} className="w-8 h-8 border border-wedding-gold/25 rounded-full">＋</button>
            <button
              onClick={addWalkin}
              disabled={busy === "walkin"}
              className="ml-auto px-4 py-2 bg-sage-700 text-white text-xs rounded-md disabled:opacity-60"
            >
              등록
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
