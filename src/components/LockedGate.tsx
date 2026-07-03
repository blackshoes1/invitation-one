"use client";

import { useState } from "react";
import Link from "next/link";
import {
  groom,
  bride,
  venue,
  groomAccounts,
  brideAccounts,
  formatFullDate,
  formatTime,
  type Account as Acct,
} from "@/lib/wedding";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 접근 키가 없을 때 — 청첩장 본문 대신 "기본 정보"만 공개.
 * 예식 일시·장소·주차·계좌는 누구에게나 필요한 정보이므로 잠그지 않는다.
 */
export default function LockedGate() {
  const [toast, setToast] = useState<string | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);

  const copyAccount = async (a: Acct) => {
    if (await copyText(`${a.bank} ${a.number} ${a.name}`)) {
      setToast("복사됐어요!");
      setTimeout(() => setToast(null), 1800);
    }
  };

  return (
    <main className="min-h-screen bg-wedding-cream px-6 py-14">
      <div className="max-w-sm mx-auto text-center space-y-8">
        {/* 잠금 안내 */}
        <div className="space-y-3">
          <div className="text-5xl">💌</div>
          <h1 className="font-serif text-xl text-sage-700 tracking-wide">
            아직 공개 전이에요 😊
          </h1>
          <p className="text-sm text-neutral-500 leading-relaxed">
            {groom.name} · {bride.name}의 모바일 청첩장은
            <br />
            배달 신청 후 열어보실 수 있어요.
          </p>
          <Link
            href="/delivery"
            className="inline-block mt-1 px-6 py-3.5 rounded-full bg-delivery text-white font-extrabold"
          >
            🛵 청첩장 받으러 가기
          </Link>
        </div>

        {/* 기본 정보 — 일시·장소 */}
        <div className="bg-white border border-wedding-gold/20 p-6 space-y-4 text-center">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            WEDDING DAY
          </p>
          <div className="space-y-1">
            <p className="text-sm text-sage-700 font-medium">
              {formatFullDate()} {formatTime()}
            </p>
            <p className="font-serif text-base text-sage-700">{venue.name}</p>
            <p className="text-xs text-neutral-500">{venue.address}</p>
            <a
              href={`tel:${venue.tel}`}
              className="inline-block text-xs text-wedding-gold underline underline-offset-2"
            >
              {venue.tel}
            </a>
          </div>
          <div className="border-t border-wedding-gold/10 pt-3">
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              🚗 {venue.parking}
            </p>
          </div>
        </div>

        {/* 마음 전하기 (계좌) — 접이식 */}
        <div className="bg-white border border-wedding-gold/20 p-5">
          <button
            type="button"
            onClick={() => setAccountsOpen((v) => !v)}
            className="w-full text-sm text-sage-700 font-medium tracking-wider"
          >
            마음 전하기 {accountsOpen ? "▲" : "▼"}
          </button>
          {accountsOpen && (
            <div className="mt-4 space-y-3 text-left">
              {[...groomAccounts, ...brideAccounts].map((a) => (
                <div
                  key={a.number}
                  className="flex items-center justify-between gap-2 border border-wedding-gold/15 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] text-wedding-gold">{a.role}</p>
                    <p className="text-xs text-neutral-600 truncate">
                      {a.bank} {a.number} {a.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyAccount(a)}
                    className="shrink-0 px-3 py-1.5 text-[11px] bg-sage-600 text-white rounded-full"
                  >
                    복사
                  </button>
                </div>
              ))}
              {toast && (
                <p className="text-center text-[11px] text-sage-600">{toast}</p>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-neutral-400">
          {groom.name} ♥ {bride.name}
        </p>
      </div>
    </main>
  );
}
