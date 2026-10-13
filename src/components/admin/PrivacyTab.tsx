"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminApi } from "@/app/admin/shared";
import { PRIVACY_RETENTION_LABEL } from "@/lib/privacy";

type State = {
  eligible: boolean; purged_at: string | null; fingerprint: string;
  counts: Record<string, number>; external_checks: Record<string, boolean>;
  receipt: { id: string; completed_at: string; preserved_memories: number; preserved_photos: number } | null;
};
type Log = { id: string; created_at: string; action: string; outcome: string; resource: string; actor_hash: string | null };
type Memory = { id: string; message: string | null; review: string | null; reply: string | null; photo_url: string | null; is_private: boolean };
const copies = {
  local_copies: "컴퓨터·휴대폰의 백업, 내려받은 명단·달력, 휴지통과 동기화 사본 삭제",
  provider_backups: "Supabase 백업·복구 사본의 보관 기한과 만료 확인",
  sms: "문자 서비스의 수신 번호·발송 기록 삭제 요청 및 보관 기한 확인",
  admin_messages: "텔레그램·카카오 알림에 남은 이름·배송지와 대화 사본 삭제",
};
const labels: Record<string, string> = { group_members: "그룹 명단", groups: "그룹", participants: "신청자", deliveries: "배송 신청", rsvp: "참석 신청", checkins: "체크인", waiting_list: "대기 신청", identity_challenges: "문자 인증 요청", identity_tickets: "본인 확인 권한", consents: "확인 기록", guest_photos_preserved: "보존할 하객 사진", memories_preserved: "보존할 메시지 기록" };
const actions: Record<string, string> = { read_request: "조회 요청", change_request: "변경 요청", export_request: "내려받기 요청", admin_access: "관리자 접근", admin_login: "로그인", admin_logout: "로그아웃", data_insert: "기록 추가", data_update: "기록 수정", data_delete: "기록 삭제", privacy_purge: "개인정보 파기", identity_code_request: "인증 문자 요청", identity_code_verify: "인증번호 확인", identity_sms: "인증 문자 발송", privacy_purge_reauthentication: "파기 재인증" };
const outcomes: Record<string, string> = { allowed: "요청 허용", denied: "거절", success: "완료", failure: "실패" };

export default function PrivacyTab({ api }: { api: AdminApi }) {
  const [state, setState] = useState<State | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await api("/api/admin/privacy");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "현황을 읽지 못했습니다.");
      setState(data.state); setLogs(data.logs);
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해주세요."); }
  }, [api]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const purge = async () => {
    if (!state?.eligible || state.purged_at || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api("/api/admin/privacy", { method: "POST", body: JSON.stringify({ password, confirm, acknowledgeExternalCopies: acknowledged, fingerprint: state.fingerprint }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "파기를 완료하지 못했습니다.");
      setState({ ...state, purged_at: data.receipt.completed_at, receipt: data.receipt });
      setNotice("DB 파기가 완료됐습니다. 모든 관리자 세션이 종료됐습니다. 다시 로그인해 외부 사본 처리 결과를 기록해주세요.");
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해주세요."); }
    finally { setPassword(""); setConfirm(""); setBusy(false); }
  };
  const updateCopy = async (key: string, done: boolean) => {
    setBusy(true); setError(null);
    try {
      const res = await api("/api/admin/privacy", { method: "PATCH", body: JSON.stringify({ key, done }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리 결과를 기록하지 못했습니다.");
      setState(s => s && ({ ...s, external_checks: data.externalChecks }));
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해주세요."); }
    finally { setBusy(false); }
  };
  const loadMemories = async () => {
    try {
      const res = await api("/api/admin/privacy/memories"); const data = await res.json();
      if (!res.ok) throw new Error("보존 기록을 읽지 못했습니다.");
      setMemories(data.memories);
    } catch { setError("보존 기록을 읽지 못했습니다."); }
  };
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm">{notice}</p>}
    <section className="space-y-4 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">보관 및 파기</h2>
      <p className="text-sm leading-7">연락처·배송지·신청 명단은 예식 후 30일인 <b>{PRIVACY_RETENTION_LABEL}</b>까지 보관합니다. 기한 이후에는 신규 수집과 수정을 막고, 관리자가 아래 대상을 확인해 파기합니다. 사진·축하 메시지는 작성자 정보를 분리해 보존합니다.</p>
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sm underline">하객 개인정보 처리 안내 보기</a>
      <button type="button" onClick={load} disabled={busy} className="ml-4 rounded-lg border px-3 py-2 text-sm">현황 새로고침</button>
      {!state ? <p role="status">현황을 확인하고 있습니다.</p> : <>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(state.counts).map(([key, value]) => <div key={key} className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs text-neutral-500">{labels[key] ?? key}</dt><dd className="mt-1 font-semibold">{value}건</dd></div>)}</dl>
        {state.receipt ? <div className="space-y-2 text-sm"><p>DB 파기 완료: {new Date(state.receipt.completed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p><p className="break-all">확인 번호: {state.receipt.id}</p><p>사진 {state.receipt.preserved_photos}건 · 메시지 기록 {state.receipt.preserved_memories}건 보존</p><p>{Object.values(state.external_checks).every(Boolean) ? "외부 사본 처리 확인도 완료됐습니다." : "외부 사본은 아래 항목을 별도로 처리해야 합니다."}</p></div> : <>
          <p className="text-sm text-neutral-600">{state.eligible ? "보관 기한이 지났습니다. 대상과 보존 항목을 확인해주세요." : "보관 기한 전에는 파기할 수 없습니다."} 삭제한 정보와 초대·관리 링크는 복구할 수 없습니다.</p>
          <fieldset disabled={!state.eligible || busy} className="space-y-3 disabled:opacity-50">
            <label className="block text-sm">관리자 비밀번호 재확인<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full rounded-lg border p-3" /></label>
            <label className="block text-sm">확인 문구 ‘개인정보 파기’ 입력<input value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-1 block w-full rounded-lg border p-3" /></label>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />DB 삭제 후에도 백업·문자·알림 사본을 별도로 처리해야 함을 확인했습니다.</label>
            <button type="button" onClick={purge} disabled={!password || confirm !== "개인정보 파기" || !acknowledged} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-50">확인한 개인정보 파기</button>
          </fieldset>
        </>}
      </>}
    </section>
    {state?.purged_at && <section className="space-y-3 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">보존한 사진·축하 글</h2>
      <p className="text-sm leading-6 text-neutral-600">사진은 기존 하객스냅에서 확인할 수 있습니다. 신청 명단에서 분리해 보존한 글과 배송 사진은 아래에서 확인하세요.</p>
      <button type="button" onClick={loadMemories} className="rounded-lg border px-3 py-2 text-sm">보존 기록 보기</button>
      {memories?.map(memory => <article key={memory.id} className="space-y-2 rounded-xl bg-neutral-50 p-4 text-sm leading-7">
        <p className="text-xs text-neutral-500">하객 · {memory.is_private ? "비공개 글" : "공개 글"}</p>
        <p className="whitespace-pre-wrap break-words">{memory.message}</p><p className="whitespace-pre-wrap break-words">{memory.review}</p><p className="whitespace-pre-wrap break-words">{memory.reply}</p>
        {memory.photo_url && /^https?:\/\//.test(memory.photo_url) && <a href={memory.photo_url} target="_blank" rel="noopener noreferrer" className="underline">보존한 배송 사진 보기</a>}
      </article>)}
      {memories?.length === 0 && <p className="text-sm text-neutral-500">보존한 글이 없습니다.</p>}
    </section>}
    <section className="space-y-3 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">외부 사본 처리</h2>
      <p className="text-sm leading-6 text-neutral-600">실제 삭제 또는 보관 기한 만료를 확인한 뒤 표시하세요. 외부 서비스의 삭제를 이 화면에서 자동 실행하지 않습니다. 처리 방법은 운영 문서를 참고해주세요.</p>
      {Object.entries(copies).map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" disabled={!state?.purged_at || busy} checked={state?.external_checks[key] ?? false} onChange={e => updateCopy(key, e.target.checked)} className="mt-1.5" />{label}</label>)}
    </section>
    <section className="space-y-3 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">최근 접근 이력</h2>
      <p className="text-sm leading-6 text-neutral-600">최근 30일, 최신 100건을 표시합니다. 요청 허용은 인증을 통과했다는 뜻이며 작업 완료와 구분됩니다. 번호·배송지·비밀번호·인증번호는 기록하지 않습니다. 관리자 식별 값은 세션마다 달라집니다.</p>
      <ul className="divide-y">{logs.map(log => <li key={log.id} className="py-3 text-xs leading-6"><p>{new Date(log.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {actions[log.action] ?? (log.action.startsWith("external_copy_") ? "외부 사본 처리 확인" : "접근 기록")} · {outcomes[log.outcome] ?? log.outcome}</p><p className="break-all text-neutral-500">{log.resource} · {log.actor_hash ? `식별 ${log.actor_hash.slice(0, 8)}` : "시스템 또는 미인증"}</p></li>)}</ul>
    </section>
  </div>;
}
