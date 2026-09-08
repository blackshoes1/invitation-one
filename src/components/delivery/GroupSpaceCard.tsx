"use client";

import { useState } from "react";
import Link from "next/link";
import { invitationHref } from "@/lib/inviteAccess";
import { ATTENDANCE_LABEL, type Attendance, type GroupSpace } from "@/lib/groupSpace";
import type { InvitePrefill } from "@/lib/invite";

/** Parent keys by token so switching invitees cannot retain another person's state. */
export default function GroupSpaceCard({ token, invite }: { token: string; invite: InvitePrefill }) {
  const [open, setOpen] = useState(false);
  const [space, setSpace] = useState<GroupSpace | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function request(body: Record<string, unknown>) {
    const r = await fetch("/api/delivery/group-space", {
      method: "POST", headers: { "Content-Type": "application/json" },
      cache: "no-store", body: JSON.stringify({ ...body, token }),
    });
    if (!r.ok) throw new Error(r.status === 429
      ? "잠시 후 다시 시도해주세요." : "모임 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
    return r.json();
  }

  async function load() {
    setBusy(true); setNotice(""); setSpace(null);
    try {
      const { space: next } = await request({ action: "load" }) as { space: GroupSpace };
      setSpace(next); setAttendance(next.me.attendance); setShare(next.me.shareWithGroup);
    } catch (e) { setNotice(e instanceof Error ? e.message : "다시 시도해주세요."); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setNotice("");
    try {
      await request({ action: "save", attendance, shareWithGroup: attendance !== null && share });
      // Re-read consent-filtered data rather than synthesizing another member's state.
      const { space: next } = await request({ action: "load" }) as { space: GroupSpace };
      setSpace(next); setShare(next.me.shareWithGroup);
      setNotice("저장했어요. 나중에 언제든 바꿀 수 있어요.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "저장 상태를 다시 확인해주세요."); }
    finally { setBusy(false); }
  }

  return (
    <section className="max-w-md mx-auto px-5 pb-5" aria-label="우리 모임">
      <div className="rounded-2xl border border-delivery/20 bg-white p-5 space-y-4">
        <div>
          <h2 className="font-bold text-neutral-800">{invite.name}님, 반가워요!</h2>
          <p className="text-sm text-neutral-600 mt-1">{invite.groupName || "우리 모임"} 분들과 함께 초대했어요.</p>
        </div>
        <Link href={invitationHref} className="block rounded-full bg-delivery text-white text-center font-bold py-3">
          모바일 청첩장 보기
        </Link>
        <button type="button" disabled={busy} aria-expanded={open}
          className="w-full rounded-full border border-delivery/30 py-2.5 text-sm text-neutral-700 disabled:opacity-50"
          onClick={() => { setOpen(!open); if (!open) void load(); }}>
          {open ? "우리 모임 접기" : "우리 모임 보기"}
        </button>
        {open && <div className="space-y-4">
          {space && <>
            <div>
              <h3 className="font-bold text-neutral-800">{space.groupName} · 초대받은 분 {space.rosterCount}명</h3>
              <p className="text-xs text-neutral-600 mt-1">공유한 참석 예정자 {space.sharedAttendingCount}명 · 실제 참석 총인원과 달라요.</p>
            </div>
            <fieldset disabled={busy} className="space-y-2">
              <legend className="text-sm font-bold mb-2">결혼식에 함께하실 수 있나요?</legend>
              {(Object.entries(ATTENDANCE_LABEL) as [Attendance, string][]).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm py-1 text-neutral-700">
                  <input type="radio" name="group-attendance" checked={attendance === value}
                    onChange={() => setAttendance(value)} />{label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm py-1 text-neutral-700">
                <input type="radio" name="group-attendance" checked={attendance === null}
                  onChange={() => { setAttendance(null); setShare(false); }} />아직 응답하지 않기 / 응답 지우기
              </label>
              <label className="flex items-start gap-2 text-xs text-neutral-600 pt-2">
                <input type="checkbox" checked={share} disabled={attendance === null}
                  onChange={(e) => setShare(e.target.checked)} />
                내 이름과 참석 여부를 모임 사람들에게도 알려주세요
              </label>
              <p className="text-xs text-neutral-600">선택하지 않으면 본인과 신랑·신부만 볼 수 있어요. 공유 해제 후 저장하면 다시 숨겨져요.</p>
              <button type="button" onClick={() => void save()}
                className="w-full bg-delivery text-white rounded-full py-2.5 font-bold disabled:opacity-50">응답 저장</button>
            </fieldset>
            <div>
              <h3 className="text-sm font-bold">함께 초대받은 분들</h3>
              <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                <li>{space.me.name} (나) · {space.me.attendance ? ATTENDANCE_LABEL[space.me.attendance] : "응답 전"}</li>
                {space.members.map((m, index) => <li key={index}>
                  {m.name} · {m.shared && m.attendance ? ATTENDANCE_LABEL[m.attendance] : "참석 정보 비공개"}
                </li>)}
              </ul>
            </div>
            <div className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700 space-y-2">
              <h3 className="font-bold">우리 모임 청첩장 전달 일정</h3>
              {space.schedules.length ? space.schedules.map((s, i) => <p key={i}>{s.date} · {s.time_slot}</p>)
                : <p>아직 등록된 전달 일정이 없어요.</p>}
              <p className="text-xs">결혼식 참석 응답과 별개예요. 장소는 개별 안내하며, 개인 링크의 신청은 개인 주문으로 유지돼요.</p>
            </div>
          </>}
          <p role="status" className="text-sm text-neutral-600">{busy ? "확인 중…" : notice}</p>
          <button type="button" disabled={busy} onClick={() => void load()} className="text-xs underline text-neutral-600">모임 정보 새로고침</button>
          <p className="text-xs text-neutral-600">이 링크를 받은 사람은 내 응답을 바꿀 수 있어요. 다른 사람에게 전달하지 말아주세요.</p>
        </div>}
      </div>
    </section>
  );
}
