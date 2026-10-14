"use client";

import { useEffect, useState } from "react";
import { PRIVACY_RETENTION_LABEL } from "@/lib/privacy";

type Guest = { name: string; confirmedAt: string | null; open: boolean };
export default function GuestGuideCheckin() {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const token = new URLSearchParams(window.location.search).get("t");
    void fetch("/api/guest-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "load" }) })
      .then(async res => { const data = await res.json(); if (!alive) return; if (res.ok) setGuest(data); else setError(data.error ?? "개인 안내 링크를 확인해주세요."); })
      .catch(() => { if (alive) setError("연결을 확인하고 다시 열어주세요."); });
    return () => { alive = false; };
  }, []);
  const confirm = async () => {
    if (busy || !guest?.open) return;
    setBusy(true); setError(null);
    try {
      const token = new URLSearchParams(window.location.search).get("t");
      const res = await fetch("/api/guest-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "confirm" }) });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "확인 기록을 저장하지 못했습니다.");
      // The server provides only the invitation path; do not carry the private token to the next page.
      if (typeof data.nextUrl !== "string" || !/^\/\?(key=)/.test(data.nextUrl)) return setError("청첩장 주소를 확인하지 못했습니다.");
      window.location.replace(data.nextUrl);
    } catch { setError("연결을 확인하고 다시 시도해주세요."); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-[#344b31] px-5 py-12 text-sage-800">
    <section className="w-full max-w-md space-y-6 rounded-3xl bg-wedding-cream p-6 sm:p-8">
      <p className="font-serif text-sm">성근영 · 김아영</p>
      <h1 className="font-serif text-2xl leading-relaxed">예식 전 안내 확인</h1>
      {guest ? <>
        <p className="text-base"><b>{guest.name}</b>님, 함께해 주셔서 감사합니다.</p>
        <p className="text-sm leading-7">현장 축의대 미운영과 계좌 안내, 주차장에서 예식장까지 오시는 길을 미리 확인해주세요.</p>
        <p className="text-xs leading-6 text-neutral-500">사전 안내 확인 버튼을 누르면 확인 여부와 시각이 저장됩니다. 예식장 도착 기록은 당일 별도로 확인합니다.</p>
        {guest.confirmedAt && <p role="status" className="text-sm leading-6">이미 안내 확인을 기록했습니다.<br />{new Date(guest.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
        {!guest.open && <p role="status" className="rounded-xl bg-white p-4 text-sm leading-6">10월 15일 0시부터 사전 안내를 확인하실 수 있습니다.</p>}
        <button type="button" onClick={confirm} disabled={busy || !guest.open} className="min-h-12 w-full rounded-full bg-sage-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "확인을 저장하고 있습니다…" : guest.confirmedAt ? "안내 청첩장 보기" : "사전 안내 체크인하고 안내 보기"}</button>
        <p className="text-xs leading-6 text-neutral-500">확인 기록은 {PRIVACY_RETENTION_LABEL}까지 보관 후 관리자 확인을 거쳐 파기합니다. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">개인정보 처리 안내</a></p>
      </> : !error && <p role="status" className="text-sm">개인 안내를 확인하고 있습니다.</p>}
      {error && <p role="alert" className="text-sm leading-6 text-red-700">{error}</p>}
    </section>
  </main>;
}
