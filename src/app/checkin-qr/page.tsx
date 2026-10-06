"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { groom, bride, venue } from "@/lib/wedding";

/**
 * 현장 체크인 QR (GX-4) — 인쇄용.
 * 하객이 스캔하면 체크인 페이지(/checkin)로 이동해 참석 인원을 남긴다.
 * 관리자가 이 페이지를 열어 인쇄 → 예식장 입구/안내데스크에 비치.
 */
export default function CheckinQrPage() {
  const [qr, setQr] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const base = window.location.origin;
    // 브라우저 전용 값(origin) → SSR 과 초기 렌더 일치를 위해 마운트 후 반영
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(base);
    QRCode.toDataURL(`${base}/checkin`, {
      margin: 1,
      width: 640,
      errorCorrectionLevel: "M",
      color: { dark: "#2f3a2a", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, []);

  return (
    <main className="min-h-screen bg-neutral-100 print:bg-white flex flex-col items-center justify-center p-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 16mm; }
        }
      `}</style>

      <div className="no-print mb-4 text-center space-y-2">
        <p className="text-sm text-neutral-500">
          입구·안내데스크에 두면 하객이 스캔해 <b>참석 체크인</b> 해요.
        </p>
        <p className="text-[11px] text-neutral-500 break-all">
          {origin ? `${origin}/checkin` : "…"}
        </p>
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-full bg-sage-700 text-white text-sm font-bold"
        >
          인쇄하기 🖨️
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-wedding-gold/20 px-10 py-12 flex flex-col items-center text-center gap-4 max-w-md w-full">
        <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
          CHECK-IN
        </p>
        <p className="font-serif text-2xl text-sage-700 tracking-wide">
          오셨나요? 체크인해주세요 🙌
        </p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="현장 체크인 QR" className="w-56 h-56" />
        ) : (
          <div className="w-56 h-56 bg-neutral-100 animate-pulse rounded" />
        )}
        <p className="text-sm text-neutral-500 leading-relaxed">
          QR을 스캔하고 함께 오신 인원을 남겨주세요.
          <br />
          맛있는 식사 준비에 큰 도움이 됩니다 🍽️
        </p>
        <div className="pt-2 space-y-0.5">
          <p className="text-sm font-serif text-sage-700 tracking-widest">
            {groom.name} <span className="text-wedding-gold">♥</span> {bride.name}
          </p>
          <p className="text-[11px] text-neutral-500">{venue.name}</p>
        </div>
      </div>
    </main>
  );
}
