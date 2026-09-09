"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { invitationHref } from "@/lib/inviteAccess";
import { ATTENDANCE_LABEL, type Attendance, type GroupSpace } from "@/lib/groupSpace";
import type { InvitePrefill } from "@/lib/invite";

/**
 * 개인 초대 링크로 들어온 분의 모임 카드.
 *
 * 2026-09-09 수정 — **무엇에 대한 페이지인지 먼저 보이게.**
 * 예전에는 이 카드에서 유일하게 색을 채운 버튼이 `모바일 청첩장 보기` 였고,
 * 참석 질문은 `우리 모임 보기` 뒤에 접혀 있었다. 개인 링크를 받은 분 눈에는
 * 청첩장 링크만 들어와서, 모임 참석에 대한 페이지라는 걸 알아채지 못했다.
 * 이제 참석 질문을 처음부터 펼쳐 두고(마운트 시 바로 조회), 청첩장 보기는
 * 카드 맨 아래 보조 버튼으로 내린다. 색 채운 버튼은 `응답 저장` 하나뿐이다.
 *
 * 카드 제목에는 모임 이름을 넣지 않는다 — 페이지 h1 이 이미 모임 이름이라,
 * 두 heading 이 같은 이름을 가지면 이름으로 heading 을 집는 쪽이 모호해진다.
 *
 * Parent keys by token so switching invitees cannot retain another person's state.
 */
export default function GroupSpaceCard({ token, invite }: { token: string; invite: InvitePrefill }) {
  const [space, setSpace] = useState<GroupSpace | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [share, setShare] = useState(false);
  // 마운트하자마자 조회를 건다 — 처음부터 '확인 중' 이다.
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  /** 함께 초대받은 분들·전달 일정 — 참석 질문보다 뒤라서 접어 둔다 (이미 받아 온 데이터다) */
  const [details, setDetails] = useState(false);

  const request = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch("/api/delivery/group-space", {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify({ ...body, token }),
      });
      if (!r.ok) throw new Error(r.status === 429
        ? "잠시 후 다시 시도해주세요." : "모임 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
      return r.json();
    },
    [token]
  );

  /** 조회 결과를 화면 상태로 옮긴다 — 첫 조회와 새로고침이 같은 규칙을 쓰도록 */
  const applySpace = useCallback((next: GroupSpace) => {
    setSpace(next); setAttendance(next.me.attendance); setShare(next.me.shareWithGroup);
  }, []);

  const load = useCallback(async () => {
    setBusy(true); setNotice("");
    try { applySpace(((await request({ action: "load" })) as { space: GroupSpace }).space); }
    catch (e) { setNotice(e instanceof Error ? e.message : "다시 시도해주세요."); }
    finally { setBusy(false); }
  }, [request, applySpace]);

  // 참석 질문이 첫 화면에 보여야 하므로 버튼을 기다리지 않고 바로 불러온다.
  // 이펙트 본문에서 동기적으로 setState 하지 않도록 `load()` 대신 직접 건다
  // (busy 는 이미 true 로 시작한다).
  useEffect(() => {
    let alive = true;
    request({ action: "load" })
      .then(({ space: next }: { space: GroupSpace }) => { if (alive) applySpace(next); })
      .catch((e: unknown) => {
        if (alive) setNotice(e instanceof Error ? e.message : "다시 시도해주세요.");
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [request, applySpace]);

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
      <div className="rounded-2xl border-2 border-delivery/25 bg-white p-5 space-y-4">
        <div>
          <h2 className="font-bold text-neutral-800">{invite.name}님, 결혼식에 초대합니다 💌</h2>
          <p className="text-sm text-neutral-600 mt-1">
            {invite.groupName || "우리 모임"} 분들과 함께 초대했어요. 참석하실 수 있는지
            먼저 알려주시고, 아래에서 청첩장 받을 날짜도 골라주세요.
          </p>
        </div>

        {space ? (
          <div className="rounded-xl bg-delivery-bg p-4">
            <fieldset disabled={busy} className="space-y-2">
              <legend className="text-sm font-bold mb-2">결혼식에 함께하실 수 있나요?</legend>
              {(Object.entries(ATTENDANCE_LABEL) as [Attendance, string][]).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm py-1 text-neutral-700">
                  <input type="radio" name="group-attendance" checked={attendance === value}
                    onChange={() => setAttendance(value)} />{label}
                </label>
              ))}
              {/* 아직 아무것도 저장하지 않았으면 '지우기'를 내밀지 않는다 — 질문을 펼쳐 두는
                  지금은 이게 미리 선택돼 보여서 '이미 응답했다'는 인상을 준다. */}
              {space.me.attendance !== null && (
                <label className="flex items-center gap-2 text-sm py-1 text-neutral-700">
                  <input type="radio" name="group-attendance" checked={attendance === null}
                    onChange={() => { setAttendance(null); setShare(false); }} />응답 지우기
                </label>
              )}
              <label className="flex items-start gap-2 text-xs text-neutral-600 pt-2">
                <input type="checkbox" checked={share} disabled={attendance === null}
                  onChange={(e) => setShare(e.target.checked)} />
                내 이름과 참석 여부를 모임 사람들에게도 알려주세요
              </label>
              <p className="text-xs text-neutral-600">선택하지 않으면 본인과 신랑·신부만 볼 수 있어요. 공유 해제 후 저장하면 다시 숨겨져요.</p>
              <button type="button" onClick={() => void save()}
                className="w-full bg-delivery text-white rounded-full py-2.5 font-bold disabled:opacity-50">응답 저장</button>
            </fieldset>
          </div>
        ) : busy ? (
          <div className="rounded-xl bg-delivery-bg p-4 space-y-2.5" aria-hidden="true">
            <div className="h-4 w-44 rounded bg-neutral-200 animate-pulse" />
            <div className="h-4 w-28 rounded bg-neutral-200 animate-pulse" />
            <div className="h-4 w-32 rounded bg-neutral-200 animate-pulse" />
            <div className="h-4 w-28 rounded bg-neutral-200 animate-pulse" />
          </div>
        ) : (
          <div className="rounded-xl bg-delivery-bg p-4 space-y-2">
            <p className="text-sm text-neutral-700">참석 여부 질문을 불러오지 못했어요.</p>
            <button type="button" onClick={() => void load()}
              className="rounded-full bg-delivery text-white px-4 py-2 text-sm font-bold">다시 불러오기</button>
          </div>
        )}

        <p role="status" className="text-sm text-neutral-600">{busy ? "확인 중…" : notice}</p>
        <p className="text-xs text-neutral-600">이 링크를 받은 사람은 내 응답을 바꿀 수 있어요. 다른 사람에게 전달하지 말아주세요.</p>

        {space && <>
          <button type="button" aria-expanded={details}
            className="w-full rounded-full border border-delivery/30 py-2.5 text-sm text-neutral-700"
            onClick={() => setDetails(!details)}>
            {details ? "모임 사람들·전달 일정 접기" : `모임 사람들·전달 일정 보기 (${space.rosterCount}명)`}
          </button>
          {details && <div className="space-y-4">
            <div>
              <h3 className="font-bold text-neutral-800">{space.groupName} · 초대받은 분 {space.rosterCount}명</h3>
              <p className="text-xs text-neutral-600 mt-1">공유한 참석 예정자 {space.sharedAttendingCount}명 · 실제 참석 총인원과 달라요.</p>
            </div>
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
            <button type="button" disabled={busy} onClick={() => void load()} className="text-xs underline text-neutral-600">모임 정보 새로고침</button>
          </div>}
        </>}

        <Link href={invitationHref}
          className="block rounded-full border border-delivery/30 text-neutral-700 text-center text-sm font-bold py-2.5">
          모바일 청첩장 보기
        </Link>
      </div>
    </section>
  );
}
