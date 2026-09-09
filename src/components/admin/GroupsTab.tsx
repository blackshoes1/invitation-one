"use client";

import { useRef, useState } from "react";
import type { Group, GroupMemberRow } from "@/lib/supabase";
import {
  formatYmdKo,
  formatPhone,
  isValidPhone,
  slotsForDate,
  DELIVERY_START,
  DELIVERY_END,
} from "@/lib/wedding";
import type { TabCtx, Totals } from "@/app/admin/shared";
import SoloInvites from "@/components/admin/SoloInvites";
import { orderNotice } from "@/lib/adminOrderNotice";

/**
 * 그룹 탭 — 그룹 생성·제안 일정·명단(roster) 관리.
 * groups 목록 자체는 부모(page)가 보유 (주문 탭 필터·그룹명 표시에도 쓰이므로).
 */
export default function GroupsTab({
  api,
  setError,
  setNotice,
  groups,
  totalMembers,
  totals,
  reload,
  bumpRoster,
}: TabCtx & {
  groups: Group[];
  /** 전체 신청 기록 수 (그룹 미지정 포함) — 고유 인원이 아니다 */
  totalMembers: number | null;
  /** 직접배달·마음배송으로 나눈 전체 집계. 못 불러왔으면 null (0 으로 보여주지 않는다) */
  totals: Totals | null;
  /** 그룹 목록 재조회 (부모 loadGroups) */
  reload: () => Promise<void> | void;
  /** 그룹 카드의 명단 인원(roster_count)을 로컬로 ±n 반영 */
  bumpRoster: (gid: string, delta: number) => void;
}) {
  const [newGroup, setNewGroup] = useState("");
  /** 그룹 생성 시 제안 일정 (선택) */
  const [offerDate, setOfferDate] = useState("");
  const [offerTime, setOfferTime] = useState("");
  const [offerLocation, setOfferLocation] = useState("");
  /** 기존 그룹의 제안 일정 편집 상태 */
  const [editOffer, setEditOffer] = useState<{
    gid: string;
    date: string;
    time: string;
    location: string;
  } | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, GroupMemberRow[]>>({});
  const [newMember, setNewMember] = useState("");
  /** 그룹 주문 직접 생성 (전화·카톡 접수 대응) — 열려 있는 그룹 id 와 입력값 */
  const [newOrder, setNewOrder] = useState<{
    gid: string;
    date: string;
    time: string;
    location: string;
    rider: string;
    ownerName: string;
    ownerPhone: string;
    /** 명단 전원을 이 주문에 신청 처리 (기본 켜짐) */
    includeRoster: boolean;
    /**
     * 이 제출의 멱등 키 — 폼을 열 때 한 번 만들고 재시도해도 그대로 보낸다.
     * 서버가 같은 키를 두 번 받으면 첫 결과를 돌려주고 주문을 새로 만들지 않는다.
     */
    requestKey: string;
  } | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);

  const createOrder = async () => {
    if (!newOrder || creatingOrder) return;
    if (!newOrder.date) return setError("날짜를 선택해주세요.");
    if (!newOrder.time) return setError("시간대를 선택해주세요.");
    if (!newOrder.location.trim()) return setError("배송지를 입력해주세요.");
    setError(null);
    setNotice(null);
    setCreatingOrder(true);
    try {
      const res = await api("/api/admin/deliveries", {
        method: "POST",
        body: JSON.stringify({
          group_id: newOrder.gid,
          date: newOrder.date,
          time_slot: newOrder.time,
          location: newOrder.location.trim(),
          rider: newOrder.rider,
          owner_name: newOrder.ownerName.trim() || null,
          owner_phone: newOrder.ownerPhone.trim() || null,
          include_roster: newOrder.includeRoster,
          // 같은 제출을 두 번 눌러도 주문이 하나만 생기게 하는 키.
          // 재시도 시 같은 값을 다시 보내야 하므로 제출 상태에 고정해 둔다.
          request_key: newOrder.requestKey,
        }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "주문 생성 실패");
      setNotice(orderNotice(j, newOrder.includeRoster));
      setNewOrder(null);
      reload();
    } finally {
      setCreatingOrder(false);
    }
  };

  const createGroup = async () => {
    if (!newGroup.trim()) return;
    if (offerDate && !offerTime)
      return setError("제안 일정의 시간대를 선택해주세요.");
    const res = await api("/api/admin/groups", {
      method: "POST",
      body: JSON.stringify({
        name: newGroup.trim(),
        offer_date: offerDate || null,
        offer_time: offerTime || null,
        offer_location: offerLocation || null,
      }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "그룹 생성 실패");
    setNewGroup("");
    setOfferDate("");
    setOfferTime("");
    setOfferLocation("");
    setNotice(
      offerDate
        ? "그룹을 만들고 일정을 제안했어요 📅 링크를 공유하면 하객이 승낙만 하면 돼요."
        : "그룹을 만들었어요."
    );
    reload();
  };

  /** 기존 그룹 제안 일정 저장 (빈 날짜로 저장 = 제안 해제) */
  const saveOffer = async (clear = false) => {
    if (!editOffer) return;
    if (!clear && editOffer.date && !editOffer.time)
      return setError("제안 일정의 시간대를 선택해주세요.");
    if (!clear && !editOffer.date)
      return setError("제안 날짜를 선택해주세요.");
    const res = await api(`/api/admin/groups/${editOffer.gid}`, {
      method: "PATCH",
      body: JSON.stringify({
        set_offer: true,
        offer_date: clear ? null : editOffer.date,
        offer_time: clear ? null : editOffer.time,
        offer_location: clear ? null : editOffer.location || null,
      }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "제안 저장 실패");
    setEditOffer(null);
    setNotice(clear ? "제안 일정을 해제했어요." : "제안 일정을 저장했어요 📅");
    reload();
  };

  /** 그룹명 수정 */
  const renameGroup = async (gid: string, current: string) => {
    const name = prompt("새 그룹명을 입력해주세요", current);
    if (!name?.trim() || name.trim() === current) return;
    const res = await api(`/api/admin/groups/${gid}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "그룹명 수정 실패");
    setNotice("그룹명을 수정했어요 ✏️");
    reload();
  };

  /**
   * 그룹 삭제. 되돌릴 수 없는 것들을 먼저 이름과 숫자로 보여준 뒤 확인받는다.
   * (살아 있는 주문이 있으면 서버가 409 로 막고 무엇이 막는지 알려준다)
   */
  const deleteGroup = async (g: Group) => {
    const roster = g.roster_count ?? 0;
    const warn =
      `'${g.name}' 그룹을 삭제할까요?\n\n` +
      (roster > 0
        ? `· 명단 ${roster}명이 함께 삭제되고, 그분들께 보낸 개인 초대 링크가 모두 무효가 됩니다\n`
        : "") +
      `· 그룹 링크(/delivery/group/${g.slug})가 더는 열리지 않습니다\n\n` +
      `되돌릴 수 없어요.`;
    if (!confirm(warn)) return;

    const res = await api(`/api/admin/groups/${g.id}`, { method: "DELETE" });
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      removed?: { roster: number; canceled_orders: number; hearts: number };
    };
    if (!res.ok) return setError(j.error ?? "그룹 삭제에 실패했습니다.");

    const r = j.removed;
    setNotice(
      `'${g.name}' 그룹을 삭제했어요` +
        (r
          ? ` (명단 ${r.roster}명 삭제` +
            (r.canceled_orders > 0 ? ` · 취소된 주문 ${r.canceled_orders}건 연결 해제` : "") +
            (r.hearts > 0 ? ` · 마음배송 ${r.hearts}건 연결 해제` : "") +
            ")"
          : "")
    );
    reload();
  };

  const copyLink = (slug: string) => {
    navigator.clipboard?.writeText(
      `${window.location.origin}/delivery/group/${slug}`
    );
    setNotice("그룹 링크가 복사되었습니다.");
  };

  const toggleMembers = async (gid: string) => {
    if (openGroup === gid) return setOpenGroup(null);
    setOpenGroup(gid);
    const res = await api(`/api/admin/groups/${gid}/members`);
    if (res.ok) {
      const j = await res.json();
      setMembers((m) => ({ ...m, [gid]: j.members ?? [] }));
    }
  };

  const addMember = async (gid: string) => {
    if (!newMember.trim()) return;
    try {
      const res = await api(`/api/admin/groups/${gid}/members`, {
        method: "POST",
        body: JSON.stringify({ name: newMember.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status !== 401) setError(j.error ?? "명단 추가에 실패했습니다.");
        return;
      }
      setNewMember("");
      bumpRoster(gid, 1);
      const list = await api(`/api/admin/groups/${gid}/members`);
      if (list.ok) {
        const j = await list.json();
        setMembers((m) => ({ ...m, [gid]: j.members ?? [] }));
      }
    } catch {
      setError("명단 추가 요청이 실패했습니다. 네트워크를 확인해주세요.");
    }
  };

  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [inviteBusy, setInviteBusy] = useState(false);
  const inviteLock = useRef(false);
  const [linkResult, setLinkResult] = useState<{
    text: string; skipped: { id: string; name: string; reason: string }[];
  } | null>(null);

  /** Explicit save, also awaited before copying. Failed saves keep the draft for retry. */
  const savePhone = async (gid: string, mem: GroupMemberRow): Promise<boolean> => {
    const draft = phoneDrafts[mem.id];
    if (draft === undefined || draft.trim() === (mem.phone ?? "")) return true;
    try {
      const res = await api(`/api/admin/groups/${gid}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: mem.id, phone: draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.member) {
        if (res.status !== 401) setError(j.error ?? "연락처 저장에 실패했습니다.");
        return false;
      }
      setMembers((m) => ({
        ...m,
        [gid]: (m[gid] ?? []).map((x) => (x.id === mem.id ? { ...x, ...j.member } : x)),
      }));
      setPhoneDrafts((prev) => { const next = { ...prev }; delete next[mem.id]; return next; });
      return true;
    } catch {
      setError("연락처 저장 요청이 실패했습니다. 네트워크를 확인해주세요.");
      return false;
    }
  };

  const saveMemberPhone = async (gid: string, mem: GroupMemberRow) => {
    if (inviteLock.current) return;
    inviteLock.current = true;
    setInviteBusy(true);
    setError(null);
    try {
      if (await savePhone(gid, mem)) setNotice(`${mem.name} 님 연락처를 저장했어요.`);
    } finally { inviteLock.current = false; setInviteBusy(false); }
  };

  const issueInvite = async (
    gid: string,
    mem?: GroupMemberRow,
    kind: "personal" | "group" = "personal",
    rotate = false,
  ) => {
    if (inviteLock.current) return;
    if (rotate && (!mem || !confirm(`${mem.name} 님 링크를 재발급할까요? 이전에 보낸 개인 신청·그룹 합류 링크가 모두 무효가 됩니다.`))) return;
    inviteLock.current = true;
    setInviteBusy(true);
    setError(null);
    setNotice(null);
    setLinkResult(null);
    try {
      // Save every edited phone first; never copy while a save is still in flight.
      const targets = mem ? [mem] : (members[gid] ?? []);
      for (const target of targets) {
        if (!(await savePhone(gid, target))) return;
      }
      const res = await api(`/api/admin/groups/${gid}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mem ? { member_id: mem.id, rotate } : { all: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        links?: { id: string; name: string; url: string; personalUrl: string; invited_at: string }[];
        skipped?: { id: string; name: string; reason: string }[];
        error?: string;
      };
      const links = j.links ?? [];
      const skipped = j.skipped ?? [];
      if (!res.ok && !skipped.length) {
        if (res.status !== 401) setError(j.error ?? "링크를 준비하지 못했어요. 다시 시도해주세요.");
        return;
      }
      const pick = (l: typeof links[number]) => kind === "group" ? l.url : l.personalUrl;
      const text = mem ? (links[0] ? pick(links[0]) : "")
        : links.map((l) => `${l.name}: ${pick(l)}`).join("\n");
      setLinkResult({ text, skipped });
      setMembers((m) => ({
        ...m,
        [gid]: (m[gid] ?? []).map((x) => {
          const link = links.find((l) => l.id === x.id);
          return link ? { ...x, invited_at: link.invited_at } : x;
        }),
      }));
      if (!text) {
        setError("복사할 링크가 없어요. 아래 대상별 안내를 확인해주세요.");
        return;
      }
      const label = kind === "group" ? "그룹 합류" : "개인 신청";
      try {
        await navigator.clipboard.writeText(text);
        setNotice(`${links.length}명 ${label} 링크를 복사했어요. 각 사람에게 1:1로 보내주세요.${skipped.length ? ` 제외 ${skipped.length}명은 아래에서 확인해주세요.` : ""}`);
      } catch {
        setNotice("링크는 준비됐어요. 아래 주소를 선택해 직접 복사해주세요.");
      }
    } catch {
      setError("링크 요청이 실패했습니다. 다시 복사하면 기존 링크가 유지됩니다.");
    } finally {
      inviteLock.current = false;
      setInviteBusy(false);
    }
  };

  const removeMember = async (gid: string, memberId: string) => {
    if (!confirm("명단에서 삭제할까요?")) return;
    try {
      const res = await api(
        `/api/admin/groups/${gid}/members?member_id=${memberId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        if (res.status !== 401) setError("명단 삭제에 실패했습니다.");
        return;
      }
      bumpRoster(gid, -1);
      setMembers((m) => ({
        ...m,
        [gid]: (m[gid] ?? []).filter((x) => x.id !== memberId),
      }));
    } catch {
      setError("명단 삭제 요청이 실패했습니다. 네트워크를 확인해주세요.");
    }
  };

  return (
    <>
      {/* 그룹 없이 개인에게만 링크를 주는 경우 — 그룹을 만들 필요가 없다 */}
      <SoloInvites api={api} setError={setError} setNotice={setNotice} />
      {linkResult && (
        <section aria-label="초대 링크 복사 결과" className="bg-white border border-wedding-gold/20 p-4 space-y-3">
          <p className="text-sm font-bold">초대 링크 복사 결과</p>
          {linkResult.text && <>
            <p className="text-xs text-neutral-600">각 주소를 해당 사람에게만 보내주세요. 전체 목록을 단체방에 공유하지 마세요.</p>
            <textarea aria-label="복사할 초대 링크" readOnly value={linkResult.text}
              onFocus={(e) => e.currentTarget.select()} rows={4}
              className="w-full min-w-0 border p-2 text-xs break-all" />
          </>}
          {linkResult.skipped.length > 0 && <ul className="text-xs text-red-600 space-y-2">
            {linkResult.skipped.map((m) => <li key={m.id}>{m.name}: {m.reason}</li>)}
          </ul>}
          <button onClick={() => setLinkResult(null)} className="text-xs underline">결과 닫기</button>
        </section>
      )}

      <div className="bg-white border border-wedding-gold/15 p-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            enterKeyHint="done"
            placeholder="새 그룹명 (예: 대학 친구들)"
            className="flex-1 min-w-0 p-3 border border-wedding-gold/25 bg-white text-base rounded-none focus:outline-none focus:border-sage-600"
          />
          <button
            onClick={createGroup}
            className="px-4 bg-sage-700 text-white text-xs tracking-wider"
          >
            생성
          </button>
        </div>
        {/* 제안 일정 (선택) — 하객은 링크에서 승낙만 하면 됨 */}
        <p className="text-[11px] text-neutral-400">
          📅 일정 제안 (선택) — 하객은 이름·연락처만 남기고 승낙하면 돼요
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={offerDate}
            min={DELIVERY_START}
            max={DELIVERY_END}
            onChange={(e) => {
              const d = e.target.value;
              setOfferDate(d);
              if (d && offerTime && !slotsForDate(d).includes(offerTime as never))
                setOfferTime("");
            }}
            className="p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
          />
          <select
            value={offerTime}
            onChange={(e) => setOfferTime(e.target.value)}
            disabled={!offerDate}
            className="p-2 text-base border border-wedding-gold/20 bg-white text-neutral-600 disabled:opacity-50"
          >
            <option value="">시간대</option>
            {(offerDate ? slotsForDate(offerDate) : []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={offerLocation}
            onChange={(e) => setOfferLocation(e.target.value)}
            placeholder="장소 (선택)"
            className="flex-1 min-w-[120px] p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
          />
        </div>
      </div>

      {groups.length > 0 && (
        <p className="text-xs text-neutral-500 text-right">
          📋 총 명단 인원{" "}
          <span className="font-bold text-sage-700">
            {groups.reduce((sum, g) => sum + (g.roster_count ?? 0), 0)}명
          </span>
        </p>
      )}

      {/*
        집계 조회가 실패하면 숫자를 아예 보여주지 않는다 — 0 으로 그리면
        "아무도 신청 안 함"과 구분되지 않는다.
        '건'이라고 쓰는 이유: 같은 사람이 마음배송 뒤 직접배달을 신청하면 2건이다.
        고유 인원도 식수도 아니다 (docs/COUNTING.md).
      */}
      {totals == null ? (
        totalMembers == null && (
          <p className="text-xs text-delivery-dark text-right">
            ⚠️ 신청 집계를 불러오지 못했어요 — 새로고침해주세요.
          </p>
        )
      ) : (
        <p
          className="text-xs text-neutral-500 text-right"
          title="신청 '기록' 수입니다. 한 사람이 마음배송과 직접배달을 모두 하면 2건으로 잡혀요 — 고유 인원이나 식수와는 다릅니다."
        >
          👥 총 신청{" "}
          <span className="font-bold text-sage-700">{totals.records}건</span>{" "}
          <span className="text-neutral-400">
            (직접배달 {totals.orders} · 마음배송 {totals.hearts})
          </span>
          {(() => {
            const grouped = groups.reduce((sum, g) => sum + (g.member_count ?? 0), 0);
            const rest = totals.records - grouped;
            return rest > 0 ? (
              <span className="text-neutral-400"> · 그룹 외 {rest}건 포함</span>
            ) : null;
          })()}
        </p>
      )}

      {groups.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-8">
          아직 그룹이 없습니다.
        </p>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <div
            key={g.id}
            className="bg-white border border-wedding-gold/15 p-4 space-y-3"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1 break-words">
                <p className="font-medium text-sage-700 text-sm">
                  {g.name}{" "}
                  {/* 명단은 '명'(사람 수), 신청은 '건'(기록 수) — 단위가 다르다 */}
                  <span
                    className="text-xs text-neutral-400 font-normal"
                    title="명단은 사람 수, 신청은 기록 수입니다. 취소된 직접배달은 빠지고, 마음배송은 따로 셉니다."
                  >
                    👥 명단 {g.roster_count ?? 0}명
                    {(g.member_count ?? 0) > 0 && (
                      <span className="text-sage-500">
                        {" "}· 신청 {g.member_count}건 (직접배달 {g.order_count ?? 0} ·
                        마음배송 {g.heart_count ?? 0})
                      </span>
                    )}
                  </span>
                </p>
                <p className="text-[11px] text-neutral-400 truncate">
                  /delivery/group/{g.slug}
                </p>
                {g.offer_date && g.offer_time && (
                  <p className="text-[11px] text-delivery font-bold">
                    📅 제안: {formatYmdKo(g.offer_date)} {g.offer_time}
                    {g.offer_location ? ` · ${g.offer_location}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 lg:max-w-[65%]">
                <button
                  onClick={() =>
                    setEditOffer(
                      editOffer?.gid === g.id
                        ? null
                        : {
                            gid: g.id,
                            date: g.offer_date ?? "",
                            time: g.offer_time ?? "",
                            location: g.offer_location ?? "",
                          }
                    )
                  }
                  className="px-3 py-1.5 text-xs border border-wedding-gold/30 text-neutral-500"
                  title="일정 제안 설정"
                >
                  📅
                </button>
                <button
                  onClick={() =>
                    setNewOrder(
                      newOrder?.gid === g.id
                        ? null
                        : {
                            gid: g.id,
                            date: g.offer_date ?? "",
                            time: g.offer_time ?? "",
                            location: g.offer_location ?? "",
                            rider: "신랑",
                            ownerName: "",
                            ownerPhone: "",
                            includeRoster: true,
                            requestKey: crypto.randomUUID(),
                          }
                    )
                  }
                  className={`px-3 py-1.5 text-xs border ${
                    newOrder?.gid === g.id
                      ? "border-delivery text-delivery bg-delivery/5"
                      : "border-wedding-gold/30 text-neutral-500"
                  }`}
                  title="이 그룹으로 주문 생성"
                >
                  🛵+
                </button>
                <button
                  onClick={() => renameGroup(g.id, g.name)}
                  className="px-3 py-1.5 text-xs border border-wedding-gold/30 text-neutral-500"
                  title="그룹명 수정"
                >
                  ✏️
                </button>
                <button
                  onClick={() => toggleMembers(g.id)}
                  className="px-3 py-1.5 text-xs border border-wedding-gold/30 text-neutral-500"
                >
                  명단 {openGroup === g.id ? "▲" : "▼"}
                </button>
                <button
                  onClick={() => copyLink(g.slug)}
                  className="px-3 py-1.5 text-xs border border-sage-300 text-sage-600"
                >
                  링크 복사
                </button>
                <button
                  onClick={() => deleteGroup(g)}
                  className="px-3 py-1.5 text-xs border border-red-200 text-red-600"
                  title="그룹 삭제 — 명단과 초대 링크가 함께 사라집니다"
                >
                  삭제
                </button>
              </div>
            </div>

            {/* 주문 직접 생성 — 전화·카톡으로 접수한 주문을 관리자가 입력 */}
            {newOrder?.gid === g.id && (
              <div className="border-t border-wedding-gold/10 pt-3 space-y-2">
                <p className="text-[11px] text-neutral-400">
                  🛵 주문 생성 — 만들면 주문 탭·캘린더에 바로 표시돼요.
                  대표자를 비우면 빈 주문(슬롯)만 만들어져 그룹 멤버가 합류할 수 있어요.
                </p>
                <label className="flex items-start gap-2 text-[11px] text-neutral-500">
                  <input
                    type="checkbox"
                    checked={newOrder.includeRoster}
                    onChange={(e) =>
                      setNewOrder(
                        (prev) => prev && { ...prev, includeRoster: e.target.checked }
                      )
                    }
                    className="mt-0.5"
                  />
                  <span>
                    명단({members[g.id]?.length ?? g.roster_count ?? 0}명) 전원을 이 주문에
                    신청 처리 — 이미 신청한 사람은 자동으로 빠지고, 남은 자리 수에 반영돼요
                  </span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="date"
                    min={DELIVERY_START}
                    max={DELIVERY_END}
                    value={newOrder.date}
                    onChange={(e) => {
                      const d = e.target.value;
                      setNewOrder((prev) =>
                        prev && {
                          ...prev,
                          date: d,
                          time:
                            d && prev.time && !slotsForDate(d).includes(prev.time as never)
                              ? ""
                              : prev.time,
                        }
                      );
                    }}
                    className="p-2 text-xs border border-wedding-gold/20 bg-white"
                  />
                  <select
                    value={newOrder.time}
                    onChange={(e) =>
                      setNewOrder((prev) => prev && { ...prev, time: e.target.value })
                    }
                    disabled={!newOrder.date}
                    className="p-2 text-xs border border-wedding-gold/20 bg-white"
                  >
                    <option value="">시간대</option>
                    {(newOrder.date ? slotsForDate(newOrder.date) : []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newOrder.rider}
                    onChange={(e) =>
                      setNewOrder((prev) => prev && { ...prev, rider: e.target.value })
                    }
                    className="p-2 text-xs border border-wedding-gold/20 bg-white"
                  >
                    <option value="신랑">🛵 신랑</option>
                    <option value="신부">👰 신부</option>
                    <option value="신랑+신부">💑 신랑+신부</option>
                  </select>
                  <input
                    type="text"
                    value={newOrder.location}
                    onChange={(e) =>
                      setNewOrder((prev) => prev && { ...prev, location: e.target.value })
                    }
                    placeholder="배송지"
                    className="flex-1 min-w-[140px] p-2 text-xs border border-wedding-gold/20 bg-white"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    value={newOrder.ownerName}
                    onChange={(e) =>
                      setNewOrder((prev) => prev && { ...prev, ownerName: e.target.value })
                    }
                    placeholder="대표자 성함 (선택)"
                    className="flex-1 min-w-[120px] p-2 text-xs border border-wedding-gold/20 bg-white"
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={newOrder.ownerPhone}
                    onChange={(e) =>
                      setNewOrder(
                        (prev) => prev && { ...prev, ownerPhone: formatPhone(e.target.value) }
                      )
                    }
                    placeholder="대표자 연락처 (선택)"
                    className="flex-1 min-w-[120px] p-2 text-xs border border-wedding-gold/20 bg-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setNewOrder(null)}
                    className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-400"
                  >
                    취소
                  </button>
                  <button
                    onClick={createOrder}
                    disabled={creatingOrder}
                    className="px-3 py-1.5 text-xs bg-delivery text-white font-bold disabled:opacity-60"
                  >
                    {creatingOrder ? "생성 중…" : "주문 생성"}
                  </button>
                </div>
              </div>
            )}

            {/* 제안 일정 편집 */}
            {editOffer?.gid === g.id && (
              <div className="border-t border-wedding-gold/10 pt-3 space-y-2">
                <p className="text-[11px] text-neutral-400">
                  📅 일정 제안 — 저장하면 그룹 페이지 상단에 승낙 카드가 떠요.
                  제안을 바꾸면 다음 승낙부터 새 주문으로 모여요.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="date"
                    value={editOffer.date}
                    min={DELIVERY_START}
                    max={DELIVERY_END}
                    onChange={(e) => {
                      const d = e.target.value;
                      setEditOffer((prev) =>
                        prev && {
                          ...prev,
                          date: d,
                          time:
                            d && prev.time && !slotsForDate(d).includes(prev.time as never)
                              ? ""
                              : prev.time,
                        }
                      );
                    }}
                    className="p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                  />
                  <select
                    value={editOffer.time}
                    onChange={(e) =>
                      setEditOffer((prev) => prev && { ...prev, time: e.target.value })
                    }
                    disabled={!editOffer.date}
                    className="p-2 text-base border border-wedding-gold/20 bg-white text-neutral-600 disabled:opacity-50"
                  >
                    <option value="">시간대</option>
                    {(editOffer.date ? slotsForDate(editOffer.date) : []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    value={editOffer.location}
                    onChange={(e) =>
                      setEditOffer((prev) => prev && { ...prev, location: e.target.value })
                    }
                    placeholder="장소 (선택)"
                    className="flex-1 min-w-[120px] p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  {(g.offer_date || g.offer_time) && (
                    <button
                      onClick={() => saveOffer(true)}
                      className="px-3 py-1.5 text-xs border border-red-200 text-red-400"
                    >
                      제안 해제
                    </button>
                  )}
                  <button
                    onClick={() => setEditOffer(null)}
                    className="px-3 py-1.5 text-xs border border-neutral-200 text-neutral-500"
                  >
                    닫기
                  </button>
                  <button
                    onClick={() => saveOffer(false)}
                    className="px-3 py-1.5 text-xs bg-sage-600 text-white"
                  >
                    저장
                  </button>
                </div>
              </div>
            )}

            {openGroup === g.id && (
              <div className="border-t border-wedding-gold/10 pt-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={newMember}
                    onChange={(e) => setNewMember(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addMember(g.id)}
                    enterKeyHint="done"
                    placeholder="멤버 이름 추가"
                    className="flex-1 min-w-0 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                  />
                  <button
                    onClick={() => addMember(g.id)}
                    className="px-3 bg-sage-600 text-white text-xs"
                  >
                    추가
                  </button>
                </div>
                {(members[g.id] ?? []).length > 0 && (
                  <div className="flex flex-col items-start gap-2 text-[11px] text-neutral-500 px-1">
                    <span>
                      두 링크 모두 본인을 자동 인식하고 소속 모임을 보여줘요.
                      개인 신청은 본인 주문, 그룹 합류는 함께 받을 일정 선택이에요.
                      연락처는 저장 후 복사하며, 다시 복사해도 기존 링크가 유지돼요.
                    </span>
                    <button
                      disabled={inviteBusy}
                      onClick={() => issueInvite(g.id)}
                      className="text-sage-700 underline underline-offset-2 whitespace-nowrap"
                    >
                      개인 신청 링크 전체 복사
                    </button>
                    <button disabled={inviteBusy} onClick={() => issueInvite(g.id, undefined, "group")}
                      className="text-sage-700 underline underline-offset-2 whitespace-nowrap">
                      그룹 합류 링크 전체 복사
                    </button>
                  </div>
                )}
                <ul className="space-y-3">
                  {(members[g.id] ?? []).map((mem) => (
                    <li
                      key={mem.id}
                      className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 border border-neutral-100 p-3"
                    >
                      <span className="w-full min-w-0 break-words sm:w-40">
                        {mem.name}
                        <span className="block text-[10px] text-neutral-500">
                          예식: {mem.attendance === "yes" ? "참석" : mem.attendance === "maybe" ? "미정" : mem.attendance === "no" ? "불참" : "응답 전"}
                          {mem.attendance && (mem.attendance_shared ? " · 그룹 공유" : " · 관리자만")}
                        </span>
                      </span>
                      <input
                        type="tel"
                        aria-label={`${mem.name} 연락처`}
                        inputMode="tel"
                        disabled={inviteBusy}
                        value={phoneDrafts[mem.id] ?? mem.phone ?? ""}
                        onChange={(e) => setPhoneDrafts((prev) => ({ ...prev, [mem.id]: e.target.value }))}
                        placeholder="010-0000-0000"
                        className="w-full min-w-0 border border-neutral-200 px-2 py-2 text-sm sm:w-auto sm:min-w-[140px] sm:flex-1"
                      />
                      <button disabled={inviteBusy} onClick={() => saveMemberPhone(g.id, mem)}
                        className="text-xs underline disabled:opacity-50">연락처 저장</button>
                      <span className="w-full text-[11px] text-neutral-500" role="status">
                        {phoneDrafts[mem.id] !== undefined && phoneDrafts[mem.id].trim() !== (mem.phone ?? "")
                          ? "연락처 저장 필요"
                          : mem.phone && isValidPhone(mem.phone) ? "자동 입력 준비 완료" : "연락처 미등록 · 이름만 확인 가능"}
                      </span>
                      {/*
                        모바일에서 배지·버튼이 겹치지 않게 감싸는 줄 (main 의 레이아웃 수정).
                        직접배달 신청과 마음배송을 한 배지로 합치지 않는다 — 마음배송만
                        한 사람을 "신청"으로 보여주면 그 사람 몫의 청첩장을 준비하지
                        않게 된다. 취소만 남은 사람도 신청자가 아니다.
                      */}
                      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:w-auto">
                      {mem.applied && (
                        <span
                          className="text-[10px] whitespace-nowrap text-sage-700"
                          title={mem.personal ? "개인 주문으로 신청함" : "그룹 주문으로 신청함"}
                        >
                          {mem.personal ? "신청(개인)" : "신청"}
                        </span>
                      )}
                      {mem.heart && (
                        <span
                          className="text-[10px] whitespace-nowrap text-wedding-gold"
                          title="마음배송 기록이 있어요 — 직접배달 신청과는 별개입니다"
                        >
                          마음
                        </span>
                      )}
                      <button
                        disabled={inviteBusy}
                        onClick={() => issueInvite(g.id, mem, "personal")}
                        className={`text-xs whitespace-nowrap ${mem.invited_at ? "text-neutral-400" : "text-sage-700"}`}
                        title="개인 주문 링크 — 그룹에 묶이지 않고 본인 주문만 진행"
                      >
                        개인 신청 링크
                      </button>
                      <button
                        disabled={inviteBusy}
                        onClick={() => issueInvite(g.id, mem, "group")}
                        className="text-xs whitespace-nowrap text-neutral-400"
                        title="그룹 링크 — 그룹 주문 현황·합류 흐름으로 진입"
                      >
                        그룹 합류 링크
                      </button>
                      {mem.invited_at && <button disabled={inviteBusy}
                        onClick={() => issueInvite(g.id, mem, "group", true)}
                        className="text-xs text-red-500">링크 재발급</button>}
                      <button
                        disabled={inviteBusy}
                        onClick={() => removeMember(g.id, mem.id)}
                        className="text-xs text-red-400"
                      >
                        삭제
                      </button>
                      </div>
                    </li>
                  ))}
                  {(members[g.id] ?? []).length === 0 && (
                    <li className="text-xs text-neutral-400 px-1">
                      명단 없음 (등록 시 그룹 페이지에 미신청 표시)
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
