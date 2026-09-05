"use client";

import { useState } from "react";
import type { Group, GroupMemberRow } from "@/lib/supabase";
import {
  formatYmdKo,
  formatPhone,
  slotsForDate,
  DELIVERY_START,
  DELIVERY_END,
} from "@/lib/wedding";
import type { TabCtx } from "@/app/admin/shared";

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
  reload,
  bumpRoster,
}: TabCtx & {
  groups: Group[];
  /** 전체 신청 인원 (취소 주문 참여자 제외, 그룹 미지정 포함) */
  totalMembers: number | null;
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
        }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "주문 생성 실패");
      setNotice(
        j.with_owner
          ? "주문을 만들었어요 🛵 주문 탭·캘린더에서 확인할 수 있어요."
          : "빈 주문(슬롯)을 만들었어요 — 그룹 페이지에서 멤버가 합류할 수 있어요."
      );
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

  /** 명단 연락처 저장 (blur 시) — 개인 초대 링크용 */
  const savePhone = async (gid: string, mem: GroupMemberRow, phone: string) => {
    if ((mem.phone ?? "") === phone.trim()) return;
    try {
      const res = await api(`/api/admin/groups/${gid}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: mem.id, phone }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status !== 401) setError(j.error ?? "연락처 저장에 실패했습니다.");
        return;
      }
      setMembers((m) => ({
        ...m,
        [gid]: (m[gid] ?? []).map((x) => (x.id === mem.id ? { ...x, ...j.member } : x)),
      }));
    } catch {
      setError("연락처 저장 요청이 실패했습니다. 네트워크를 확인해주세요.");
    }
  };

  /** 이번 세션에 발급한 링크 (같은 토큰의 개인/그룹 두 주소) — 재발급 없이 다시 복사용 */
  const [issued, setIssued] = useState<
    Record<string, { url: string; personalUrl: string }>
  >({});

  /** 개인 초대 링크 발급 + 클립보드 복사 (member 없으면 그룹 전체) */
  const issueInvite = async (
    gid: string,
    mem?: GroupMemberRow,
    kind: "personal" | "group" = "personal"
  ) => {
    // 이미 이번 세션에 발급했다면 재발급 없이 그대로 복사 (다른 종류 링크도 그대로 유효)
    const cached = mem ? issued[mem.id] : null;
    if (cached) {
      const url = kind === "group" ? cached.url : cached.personalUrl;
      try {
        await navigator.clipboard.writeText(url);
        setNotice(
          `${mem!.name} 님 ${kind === "group" ? "그룹" : "개인 주문"} 링크를 복사했어요`
        );
      } catch {
        setNotice("복사가 막혀 있어요. 링크: " + url);
      }
      return;
    }
    if (mem?.invited_at && !confirm(`${mem.name} 님 링크를 다시 만들까요? 이전에 보낸 링크는 무효가 됩니다.`)) return;
    if (!mem && !confirm("명단 전체의 개인 링크를 (다시) 만들까요? 이전에 보낸 링크는 모두 무효가 됩니다.")) return;
    try {
      const res = await api(`/api/admin/groups/${gid}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mem ? { member_id: mem.id } : { all: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        links?: { id: string; name: string; url: string; personalUrl: string }[];
        error?: string;
      };
      if (!res.ok || !j.links) {
        if (res.status !== 401) setError(j.error ?? "개인 링크 발급에 실패했습니다.");
        return;
      }
      const pick = (l: { url: string; personalUrl: string }) =>
        kind === "group" ? l.url : l.personalUrl;
      const text = mem
        ? pick(j.links[0])
        : j.links.map((l) => `${l.name}: ${pick(l)}`).join("\n");
      const kindLabel = kind === "group" ? "그룹" : "개인 주문";
      setIssued((prev) => {
        const next = { ...prev };
        for (const l of j.links!) next[l.id] = { url: l.url, personalUrl: l.personalUrl };
        return next;
      });
      try {
        await navigator.clipboard.writeText(text);
        setNotice(
          mem
            ? `${mem.name} 님 ${kindLabel} 링크를 복사했어요 (1:1 로 보내주세요)`
            : `${j.links.length}명 ${kindLabel} 링크를 복사했어요 (이름: 링크)`
        );
      } catch {
        setNotice("링크를 만들었어요. 복사가 막혀 있어 아래 목록에서 다시 발급해 복사해주세요.");
      }
      const now = new Date().toISOString();
      setMembers((m) => ({
        ...m,
        [gid]: (m[gid] ?? []).map((x) =>
          j.links!.some((l) => l.id === x.id) ? { ...x, invited_at: now } : x
        ),
      }));
    } catch {
      setError("개인 링크 발급 요청이 실패했습니다. 네트워크를 확인해주세요.");
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
      <div className="bg-white border border-wedding-gold/15 p-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            enterKeyHint="done"
            placeholder="새 그룹명 (예: 대학 친구들)"
            className="flex-1 p-3 border border-wedding-gold/25 bg-white text-base rounded-none focus:outline-none focus:border-sage-600"
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

      {totalMembers != null && (
        <p className="text-xs text-neutral-500 text-right">
          👥 총 신청 인원{" "}
          <span className="font-bold text-sage-700">{totalMembers}명</span>
          {(() => {
            const grouped = groups.reduce(
              (sum, g) => sum + (g.member_count ?? 0),
              0
            );
            const rest = totalMembers - grouped;
            return rest > 0 ? (
              <span className="text-neutral-400"> (그룹 외 {rest}명 포함)</span>
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sage-700 text-sm">
                  {g.name}{" "}
                  <span className="text-xs text-neutral-400 font-normal">
                    👥 명단 {g.roster_count ?? 0}명
                    {(g.member_count ?? 0) > 0 && (
                      <span className="text-sage-500">
                        {" "}· 신청 {g.member_count}명
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
              <div className="flex gap-2 whitespace-nowrap">
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
              </div>
            </div>

            {/* 주문 직접 생성 — 전화·카톡으로 접수한 주문을 관리자가 입력 */}
            {newOrder?.gid === g.id && (
              <div className="border-t border-wedding-gold/10 pt-3 space-y-2">
                <p className="text-[11px] text-neutral-400">
                  🛵 주문 생성 — 만들면 주문 탭·캘린더에 바로 표시돼요.
                  대표자를 비우면 빈 주문(슬롯)만 만들어져 그룹 멤버가 합류할 수 있어요.
                </p>
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
                    className="flex-1 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                  />
                  <button
                    onClick={() => addMember(g.id)}
                    className="px-3 bg-sage-600 text-white text-xs"
                  >
                    추가
                  </button>
                </div>
                {(members[g.id] ?? []).length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                    <span>
                      연락처를 넣고 1:1 로 보내면 이름·번호가 자동 입력돼요 ·{" "}
                      <b className="text-neutral-500">개인</b>=본인 주문,{" "}
                      <b className="text-neutral-500">그룹</b>=그룹 주문 현황
                    </span>
                    <button
                      onClick={() => issueInvite(g.id)}
                      className="text-sage-700 underline underline-offset-2 whitespace-nowrap"
                    >
                      전체 개인 링크 복사
                    </button>
                  </div>
                )}
                <ul className="space-y-1">
                  {(members[g.id] ?? []).map((mem) => (
                    <li
                      key={mem.id}
                      className="flex items-center gap-2 text-sm text-neutral-600 px-1"
                    >
                      <span className="shrink-0 min-w-[3.5rem]">{mem.name}</span>
                      <input
                        key={`${mem.id}-${mem.phone ?? ""}`}
                        type="tel"
                        inputMode="tel"
                        defaultValue={mem.phone ?? ""}
                        placeholder="010-0000-0000"
                        onBlur={(e) => savePhone(g.id, mem, e.target.value)}
                        className="flex-1 min-w-0 border border-neutral-200 px-2 py-1 text-xs"
                      />
                      {mem.applied && (
                        <span
                          className="text-[10px] whitespace-nowrap text-sage-700"
                          title={mem.personal ? "개인 주문으로 신청함" : "그룹 주문으로 신청함"}
                        >
                          {mem.personal ? "신청(개인)" : "신청"}
                        </span>
                      )}
                      <button
                        onClick={() => issueInvite(g.id, mem, "personal")}
                        className={`text-xs whitespace-nowrap ${mem.invited_at ? "text-neutral-400" : "text-sage-700"}`}
                        title="개인 주문 링크 — 그룹에 묶이지 않고 본인 주문만 진행"
                      >
                        {mem.invited_at ? "개인 ✓" : "개인"}
                      </button>
                      <button
                        onClick={() => issueInvite(g.id, mem, "group")}
                        className="text-xs whitespace-nowrap text-neutral-400"
                        title="그룹 링크 — 그룹 주문 현황·합류 흐름으로 진입"
                      >
                        그룹
                      </button>
                      <button
                        onClick={() => removeMember(g.id, mem.id)}
                        className="text-xs text-red-400"
                      >
                        삭제
                      </button>
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
