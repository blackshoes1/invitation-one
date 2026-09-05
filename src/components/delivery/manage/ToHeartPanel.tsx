"use client";

import RegionPicker from "@/components/delivery/RegionPicker";
import StampPicker from "@/components/delivery/StampPicker";
import type { Mode } from "./types";

/* 마음 배송 전환 */
export default function ToHeartPanel({
  stamp,
  setStamp,
  sido,
  sub,
  setSido,
  setSub,
  heartMsg,
  setHeartMsg,
  busy,
  error,
  setMode,
  setError,
  doToHeart,
}: {
  stamp: string;
  setStamp: (s: string) => void;
  sido: string;
  sub: string;
  setSido: (s: string) => void;
  setSub: (s: string) => void;
  heartMsg: string;
  setHeartMsg: (s: string) => void;
  busy: boolean;
  error: string | null;
  setMode: (m: Mode) => void;
  setError: (e: string | null) => void;
  doToHeart: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-neutral-700">
          마음 배송으로 바꿀게요 💌
        </p>
        <p className="text-[11px] text-neutral-500">
          못 만나도 괜찮아요 — 마음은 청첩장 지도에 예쁘게 남아요
        </p>
      </div>
      <StampPicker value={stamp} onChange={setStamp} />
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-neutral-500">
          어디서 마음을 보내시나요? 📍
        </p>
        <RegionPicker
          sido={sido}
          sub={sub}
          onChange={(s, g) => {
            setSido(s);
            setSub(g);
          }}
        />
      </div>
      <textarea
        value={heartMsg}
        maxLength={500}
        onChange={(e) => setHeartMsg(e.target.value)}
        placeholder="한마디 (선택)"
        className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-20 text-base"
      />
      {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setMode("view");
            setError(null);
          }}
          className="px-5 py-3.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 font-bold"
        >
          이전
        </button>
        <button
          onClick={doToHeart}
          disabled={busy}
          className="flex-1 py-3.5 rounded-full bg-delivery text-white font-bold disabled:opacity-60"
        >
          {busy ? "전환 중…" : "마음 배송으로 💌"}
        </button>
      </div>
    </div>
  );
}
