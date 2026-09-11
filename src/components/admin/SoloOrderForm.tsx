"use client";

import { useRef, useState } from "react";
import type { GroupMemberRow } from "@/lib/supabase";
import type { TabCtx } from "@/app/admin/shared";
import { DELIVERY_START, DELIVERY_END, slotsForDate } from "@/lib/wedding";
import { joinLocation } from "@/lib/regions";
import LocationPicker from "./orders/LocationPicker";

export default function SoloOrderForm({ member, api, setError, setNotice, onClose, onCreated }: TabCtx & {
  member: GroupMemberRow; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [rider, setRider] = useState("신랑");
  const [place, setPlace] = useState({ sido: "", sub: "", detail: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const requestKey = useRef<string | null>(null);
  const submit = async () => {
    if (lock.current) return;
    if (!date || !time || !place.sido || !place.sub) return setError("날짜·시간·배송지를 선택해주세요.");
    lock.current = true; setBusy(true); setError(null);
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await api("/api/admin/deliveries", { method: "POST", body: JSON.stringify({
        member_id: member.id, request_key: requestKey.current,
        date, time_slot: time, location: joinLocation(place.sido, place.sub, place.detail), rider,
      }) });
      const result = await response.json();
      if (!response.ok) { requestKey.current = null; return setError(result.error ?? "주문 생성에 실패했어요."); }
      setNotice(`${member.name} 님의 개인 주문을 만들었어요. 주문 탭·캘린더에서 확인할 수 있어요.`);
      await onCreated();
      onClose();
    } catch { setError("응답을 확인하지 못했어요. 다시 누르면 같은 요청으로 확인합니다."); }
    finally { lock.current = false; setBusy(false); }
  };
  return (
    <section aria-label="개별 초대 주문 생성" className="border border-sage-200 bg-sage-50 p-3 space-y-3">
      <h3 className="font-bold text-sm">{member.name} 님 주문 생성</h3>
      <p className="text-xs text-neutral-600">{member.phone || "연락처 미등록"} · 개인 주문으로 접수하며 안내 문자는 보내지 않아요.</p>
      <fieldset disabled={busy} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input aria-label="배송 날짜" type="date" min={DELIVERY_START} max={DELIVERY_END} value={date}
            onChange={(e) => { setDate(e.target.value); setTime(""); }} className="border p-2 text-sm min-w-0" />
          <select aria-label="배송 시간" value={time} onChange={(e) => setTime(e.target.value)} className="border p-2 text-sm">
            <option value="">시간대</option>
            {(date ? slotsForDate(date) : []).map((s) => <option key={s}>{s}</option>)}
          </select>
          <select aria-label="배송 담당" value={rider} onChange={(e) => setRider(e.target.value)} className="border p-2 text-sm">
            {["신랑", "신부", "신랑+신부"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <LocationPicker {...place} onChange={setPlace} label="배송지 " />
        <div className="flex gap-2">
          <button type="button" onClick={submit} className="bg-sage-600 text-white px-3 py-2 text-sm">{busy ? "생성 중…" : "개인 주문 생성"}</button>
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm">닫기</button>
        </div>
      </fieldset>
    </section>
  );
}
