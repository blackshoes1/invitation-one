"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { groom, bride, INVITATION_KEY } from "@/lib/wedding";

/**
 * 테이블 QR 카드 (GS-6) — 인쇄용.
 * 하객이 스캔하면 청첩장 '하객 스냅' 업로드로 바로 이동(?key=…&snap=1).
 * 관리자가 이 페이지를 열어 인쇄 → 예식장 테이블에 비치.
 * A4 한 장에 카드 여러 장(자르는 선). 화면에선 미리보기, 인쇄 시 카드만.
 */
const CARD_COUNT = 6;

export default function TableQrPage() {
  const [qr, setQr] = useState<string>("");
  const [origin, setOrigin] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const base = window.location.origin;
    // 브라우저 전용 값(origin) → SSR 과 초기 렌더 일치를 위해 마운트 후 반영
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(base);
    const url = `${base}/?${INVITATION_KEY ? `key=${INVITATION_KEY}&` : ""}snap=1`;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 480,
      errorCorrectionLevel: "M",
      color: { dark: "#2f3a2a", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, []);

  const targetUrl = `${origin}/?${INVITATION_KEY ? `key=${INVITATION_KEY}&` : ""}snap=1`;

  return (
    <main className="min-h-screen bg-neutral-100 print:bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
          .card-grid { gap: 0 !important; }
          .qr-card { break-inside: avoid; border: 1px dashed #bbb !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print max-w-xl mx-auto px-6 pt-8 pb-4 text-center space-y-3">
        <h1 className="text-lg font-bold text-neutral-800">테이블 QR 카드</h1>
        <p className="text-sm text-neutral-500">
          하객이 스캔하면 <b>하객 스냅 업로드</b>로 바로 이동해요. 아래 [인쇄]로 뽑아
          테이블에 두세요.
        </p>
        <p className="text-[11px] text-neutral-400 break-all">{targetUrl || "…"}</p>
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-full bg-sage-700 text-white text-sm font-bold"
        >
          인쇄하기 🖨️
        </button>
      </div>

      <div className="card-grid max-w-[210mm] mx-auto grid grid-cols-2 gap-4 px-6 pb-16 print:px-0">
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <div
            key={i}
            className="qr-card bg-white rounded-xl shadow-sm border border-wedding-gold/20 px-6 py-7 flex flex-col items-center text-center gap-3"
          >
            <p className="font-serif tracking-[0.3em] text-[10px] text-wedding-gold">
              GUEST SNAP
            </p>
            <p className="font-serif text-base text-sage-700 tracking-wide">
              오늘의 순간을 남겨주세요 📸
            </p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="하객 스냅 QR" className="w-40 h-40" />
            ) : (
              <div className="w-40 h-40 bg-neutral-100 animate-pulse rounded" />
            )}
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              QR을 스캔하고 사진을 올려주시면
              <br />
              저희에게 소중히 간직됩니다
            </p>
            <p className="text-[11px] text-neutral-400 tracking-widest">
              {groom.name} · {bride.name}
            </p>
          </div>
        ))}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
