"use client";

import { useEffect, useRef, useState } from "react";
import { PRIVACY_POLICY_VERSION, PRIVACY_RETENTION_LABEL } from "@/lib/privacy";
import type { VerifyResultV2 } from "@/lib/supabase";

export default function PhoneVerification({ name, phone, purpose, onVerified, onReset }: {
  name: string; phone: string; purpose: "badge" | "rsvp";
  onVerified: (token: string, result: VerifyResultV2 | null) => void;
  onReset?: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; scope: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifiedScope, setVerifiedScope] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = `${purpose}|${name.trim()}|${phone.replace(/\D/g, "")}`;
  const activeScope = useRef<string | null>(scope);
  useEffect(() => { activeScope.current = scope; return () => { activeScope.current = null; }; }, [scope]);
  const currentChallenge = challenge?.scope === scope ? challenge.id : null;
  const verified = verifiedScope === scope;

  const send = async () => {
    if (!consent) return setError("개인정보 안내를 확인해주세요.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/identity/request", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, purpose, consent: PRIVACY_POLICY_VERSION }) });
      const data = await res.json();
      if (activeScope.current !== scope) return;
      if (!res.ok) return setError(data.error ?? "인증 문자를 요청하지 못했습니다.");
      setChallenge({ id: data.challengeId, scope }); setCode(""); setVerifiedScope(null);
    } catch { setError("연결을 확인하고 다시 시도해주세요."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!currentChallenge || !/^\d{6}$/.test(code)) return setError("문자로 받은 6자리 인증번호를 입력해주세요.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/identity/verify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: currentChallenge, code }) });
      const data = await res.json();
      if (activeScope.current !== scope) return;
      if (!res.ok || !data.verified || data.purpose !== purpose) return setError(data.error ?? "인증을 확인하지 못했습니다.");
      setVerifiedScope(scope); setCode(""); onVerified(data.verificationToken, data.result ?? null);
    } catch { setError("연결을 확인하고 다시 시도해주세요."); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-xl border border-sage-200 bg-white p-4 text-left text-sm">
      <label className="flex items-start gap-2 text-xs leading-relaxed text-neutral-600">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" />
        <span>본인 확인을 위해 성함·전화번호를 처리하고 솔라피로 인증 문자를 보냅니다.
          연락처·신청 정보는 {PRIVACY_RETENTION_LABEL}까지 보관합니다.
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="ml-1 underline">개인정보 처리 안내</a>를 확인했습니다.</span>
      </label>
      {verified ? <div className="space-y-2"><p role="status" className="text-sage-700">전화번호 확인이 완료됐습니다. 10분 안에 진행해주세요.</p>
        <button type="button" onClick={() => { setVerifiedScope(null); setChallenge(null); onReset?.(); }} className="min-h-11 text-xs underline">다시 인증하기</button></div> : <>
        <button type="button" disabled={busy || !consent} onClick={send} className="min-h-11 w-full rounded-lg bg-sage-700 px-3 py-2 text-white disabled:opacity-50">
          {currentChallenge ? "인증 문자 다시 요청" : "인증 문자 받기"}
        </button>
        {currentChallenge && <>
          <p className="text-xs text-neutral-500">확인 가능한 번호라면 문자를 보냈습니다. 인증번호는 5분간 유효하며, 재요청은 1분 뒤 가능합니다.</p>
          <label className="block text-xs text-neutral-600">인증번호
            <input aria-label="문자 인증번호" autoComplete="one-time-code" inputMode="numeric" value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1 min-h-11 w-full rounded-lg border border-sage-200 px-3 text-base" />
          </label>
          <button type="button" disabled={busy} onClick={verify} className="min-h-11 w-full rounded-lg bg-sage-700 px-3 py-2 text-white disabled:opacity-50">인증번호 확인</button>
        </>}
      </>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
