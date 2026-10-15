"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountDetails } from "@/components/sections/Account";
import GuestRouteDetails from "@/components/GuestRouteDetails";
import { PRIVACY_RETENTION_LABEL } from "@/lib/privacy";
import { bride, groom, venue, formatFullDate, formatTime } from "@/lib/wedding";

type Guest = { name: string; confirmedAt: string | null; open: boolean };
export default function GuestGuideNotice() {
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
    if (busy || !guest?.open || guest.confirmedAt) return;
    setBusy(true); setError(null);
    try {
      const token = new URLSearchParams(window.location.search).get("t");
      const res = await fetch("/api/guest-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "confirm" }) });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "확인 기록을 저장하지 못했습니다.");
      setGuest({ ...guest, confirmedAt: data.confirmedAt });
    } catch { setError("연결을 확인하고 다시 시도해주세요."); }
    finally { setBusy(false); }
  };
  return (
    <main className="invitation-content min-h-screen bg-wedding-cream px-5 py-10 text-sage-800">
      <div className="mx-auto max-w-md space-y-6">
        <header className="space-y-3">
          <p className="font-serif text-sm">{groom.name} · {bride.name}</p>
          <h1 className="font-serif text-2xl leading-relaxed">예식 전 안내 확인</h1>
          <p className="text-sm leading-7">{formatFullDate()} · {formatTime()}<br />{venue.name} 야외예식장</p>
        </header>
        {guest ? <>
          <p className="text-base leading-7"><b>{guest.name}</b>님, 함께해 주셔서 감사합니다.<br />아래 안내를 읽으신 뒤 마지막의 확인 버튼을 눌러주세요.</p>
          {guest.open ? <>
            <section aria-labelledby="accounts-heading" className="space-y-4 rounded-2xl border border-sage-200 bg-white p-4">
              <h2 id="accounts-heading" className="font-serif text-lg font-semibold">축의금 계좌 안내</h2>
              <p className="text-sm leading-7">현장 축의대는 운영하지 않습니다.<br />마음을 전하실 분은 아래 계좌로 이체해 주세요.</p>
              <AccountDetails />
            </section>
            <GuestRouteDetails />
          </> : <p role="status" className="rounded-xl bg-white p-4 text-sm leading-6">10월 15일 0시부터 사전 안내를 확인하실 수 있습니다.</p>}
          <section aria-label="안내 확인" className="space-y-4 rounded-2xl border border-sage-200 bg-white p-5">
            {guest.confirmedAt ? <p role="status" className="text-sm leading-7">안내 확인을 완료했어요.<br />{new Date(guest.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p> : <p className="text-sm leading-7">안내를 모두 읽으셨다면 아래 버튼을 눌러주세요.</p>}
            <button type="button" onClick={confirm} disabled={busy || !guest.open || Boolean(guest.confirmedAt)} className="min-h-12 w-full rounded-full bg-sage-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "확인을 저장하고 있습니다…" : guest.confirmedAt ? "안내 확인 완료" : "안내 확인했어요"}</button>
            {error && <p role="alert" className="text-sm leading-6 text-red-700">{error}</p>}
            <p className="text-xs leading-6 text-neutral-500">버튼을 누르면 안내 확인 여부와 시각이 저장됩니다. 확인 기록은 {PRIVACY_RETENTION_LABEL}까지 보관 후 관리자 확인을 거쳐 파기합니다. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">개인정보 처리 안내</a></p>
          </section>
          {guest.open && <Link href="/?view=photos" prefetch={false} className="flex min-h-12 items-center justify-center rounded-full border border-sage-300 px-5 py-3 text-sm font-medium text-sage-700">모바일 청첩장 보기</Link>}
        </> : error ? <p role="alert" className="text-sm leading-6 text-red-700">{error}</p> : <p role="status" className="text-sm">개인 안내를 확인하고 있습니다.</p>}
      </div>
    </main>
  );
}
