"use client";

import { useEffect, useState } from "react";
import type { AdminApi } from "@/app/admin/shared";
import ShareButton from "@/components/ShareButton";
import { copyShareLink } from "@/lib/shareLink";

type Recipient = { id: string; name: string; side: string | null; phoneMasked: string | null; canSms: boolean; openedAt: string | null; confirmedAt: string | null; smsStatus: string | null; smsSentAt: string | null; smsAttemptedAt: string | null };
type Prepared = Recipient & { url: string; message: string; reviewToken: string };
const statuses: Record<string, string> = { sending: "처리 중·결과 확인 필요", accepted: "발송 접수", failed: "접수 실패", unknown: "발송 결과 확인 필요" };
const time = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export default function GuideNoticesTab({ api }: { api: AdminApi }) {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [smsReady, setSmsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resend, setResend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = async () => {
    const res = await api("/api/admin/guest-guide"); const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "참석자 명단을 읽지 못했습니다.");
    setRows(data.recipients); setSmsReady(data.smsReady);
  };
  useEffect(() => {
    let alive = true;
    void api("/api/admin/guest-guide").then(async res => {
      const data = await res.json(); if (!alive) return;
      if (!res.ok) throw new Error(data.error ?? "참석자 명단을 읽지 못했습니다.");
      setRows(data.recipients); setSmsReady(data.smsReady);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [api]);
  const choose = (ids: string[]) => { setSelected(ids); setPrepared([]); setConfirmed(false); setResend(false); setNotice(null); };
  const prepare = async () => {
    setBusy(true); setError(null); setNotice(null); setPrepared([]); setConfirmed(false);
    try {
      const all: Prepared[] = [];
      for (let i = 0; i < selected.length; i += 10) {
        const res = await api("/api/admin/guest-guide", { method: "POST", body: JSON.stringify({ action: "prepare", ids: selected.slice(i, i + 10) }) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "개인 링크를 준비하지 못했습니다.");
        all.push(...data.recipients);
      }
      setPrepared(all);
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해주세요."); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!confirmed || !prepared.length || busy) return;
    setBusy(true); setError(null); let accepted = 0;
    try {
      for (let i = 0; i < prepared.length; i++) {
        const row = prepared[i];
        setNotice(`${i + 1}/${prepared.length}명 문자 발송을 요청하고 있습니다.`);
        const res = await api("/api/admin/guest-guide", { method: "POST", body: JSON.stringify({ action: "send", id: row.id, reviewToken: row.reviewToken, confirm: true, allowResend: resend }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "발송을 확인하지 못했습니다.");
        if (data.status !== "accepted") throw new Error(data.status === "unknown" ? "발송 결과가 불확실해 중단했습니다. 문자 서비스 내역을 확인해주세요." : "문자 접수가 실패해 중단했습니다. 명단과 발송 설정을 확인해주세요.");
        accepted++;
      }
      setNotice(`${accepted}명 문자 발송 접수 완료. 실제 수신 여부는 문자 서비스의 발송 내역에서 확인해주세요.`);
    } catch (e) { setError(`현재까지 ${accepted}명 접수. ${e instanceof Error ? e.message : "연결을 확인해주세요."}`); setNotice(null); }
    finally { setPrepared([]); setConfirmed(false); setBusy(false); await load().catch(() => setError("발송 이후 현황을 읽지 못했습니다. 새로고침해 확인해주세요.")); }
  };
  const needsResend = prepared.some(row => row.smsStatus !== null || row.confirmedAt !== null);
  return <div className="space-y-5">
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold">참석자에게 사전 안내 보내기</h2>
      <p className="text-sm leading-7">참석 등록 명단의 참석자에게 개인 링크를 보냅니다. 하객은 10월 15일 0시 이후 계좌·교통·주차 안내를 먼저 읽고, 마지막의 ‘안내 확인했어요’ 버튼을 눌러 확인을 기록합니다.</p>
      <p className="text-xs leading-6 text-neutral-500">참석 등록의 대표 연락처로 보냅니다. 동반자의 개별 확인 기록은 만들지 않습니다. 개인 링크 최초 열람과 버튼 확인을 각각 기록하며, 현장 도착·식수에 반영하지 않습니다. 발송은 아래 버튼을 누를 때 실행합니다. 개인 링크는 해당 하객에게만 보내주세요.</p>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" disabled={busy} onClick={() => choose(rows.filter(row => row.canSms && !row.confirmedAt && !row.smsStatus).map(row => row.id))} className="min-h-11 rounded-lg border px-3">미발송·미확인 참석자 선택</button>
        <button type="button" disabled={busy} onClick={() => choose([])} className="min-h-11 rounded-lg border px-3">선택 해제</button>
        <button type="button" disabled={busy} onClick={() => { setPrepared([]); void load().catch(e => setError(e.message)); }} className="min-h-11 rounded-lg border px-3">현황 새로고침</button>
      </div>
      <p className="text-sm">참석 신청 {rows.length}건 · 링크 열람 {rows.filter(row => row.openedAt).length}건 · 안내 확인 {rows.filter(row => row.confirmedAt).length}건 · 미확인 {rows.filter(row => !row.confirmedAt).length}건</p>
      {!smsReady && <p className="text-sm text-amber-700">문자 발송 설정을 확인해주세요. 개인 링크는 카카오톡으로 공유할 수 있습니다.</p>}
      <ul className="divide-y">{rows.map(row => <li key={row.id} className="py-3"><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" disabled={busy} checked={selected.includes(row.id)} onChange={e => choose(e.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} className="mt-1.5" /><span className="min-w-0 break-words"><b>{row.name}</b> · {row.phoneMasked ?? "연락처 없음"}<br /><span className="text-xs text-neutral-500">{row.openedAt ? `링크 열람 ${time(row.openedAt)}` : "열람 기록 없음"}<br />{row.confirmedAt ? `안내 확인 ${time(row.confirmedAt)}` : "안내 미확인"} · {row.smsStatus ? statuses[row.smsStatus] : "미발송"}{row.smsSentAt && ` · 최근 접수 ${time(row.smsSentAt)}`}</span></span></label></li>)}</ul>
      <button type="button" disabled={busy || !selected.length} onClick={prepare} className="min-h-11 rounded-lg bg-sage-700 px-4 text-sm text-white disabled:opacity-50">{busy ? "처리 중…" : `선택 ${selected.length}명 문구·개인 링크 확인`}</button>
    </section>
    {prepared.length > 0 && <section aria-label="발송 내용 확인" className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold">발송 내용 확인</h2>
      {prepared.map(row => <article key={row.id} className="space-y-3 rounded-xl bg-neutral-50 p-4">
        <h3 className="font-semibold">{row.name}</h3><p className="whitespace-pre-wrap break-all text-sm leading-7">{row.message}</p>
        <button type="button" disabled={busy} onClick={async () => { if (await copyShareLink(row.message)) setNotice("카카오톡용 문구를 복사했습니다. 해당 하객에게 붙여넣어 보내주세요."); else setError("복사하지 못했습니다. 위 문구를 직접 선택해 복사해주세요."); }} className="min-h-11 rounded-lg border px-3 text-xs">카카오톡용 문구 복사</button>
        <ShareButton url={row.url} title={`${row.name}님, 예식 전 안내를 확인해주세요`} description="현장 축의대는 운영하지 않습니다. 대중교통 이용을 권장드리며, 계좌·주차 후 이동 안내를 읽고 확인 버튼을 눌러주세요." label="개인 안내 카카오톡 공유" linkLabel="사전 안내 확인" />
      </article>)}
      {needsResend && <label className="flex items-start gap-2 text-sm leading-7"><input type="checkbox" checked={resend} disabled={busy} onChange={e => setResend(e.target.checked)} className="mt-2" />발송 시도 이력이 있거나 이미 안내를 확인한 하객이 있습니다. 문자 서비스 내역을 확인했고 재발송을 요청합니다.</label>}
      <label className="flex items-start gap-2 text-sm leading-7"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-2" />선택한 하객과 문구를 확인했습니다. 문자 서비스에 수신 번호와 개인 안내 주소가 전달됩니다.</label>
      <button type="button" onClick={send} disabled={busy || !smsReady || !confirmed || (needsResend && !resend) || prepared.some(row => !row.canSms)} className="min-h-11 rounded-lg bg-sage-700 px-4 text-sm text-white disabled:opacity-50">선택 {prepared.length}명에게 문자 발송</button>
    </section>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm leading-7">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-7">{error}</p>}
  </div>;
}
