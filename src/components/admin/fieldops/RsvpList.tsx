"use client";

import { useMemo } from "react";
import { SIDE_LABEL, SOURCE_LABEL, type CheckinRow, type Filter, type RsvpRow } from "./types";
import { ActionBtn } from "./ui";

/** RSVP 목록 + 현장 등록·레거시 체크인 목록 (필터/검색 적용, §6) */
export default function RsvpList({
  attending,
  walkins,
  filter,
  search,
  tableName,
  manualCheckin,
  editParty,
  cancelCheckin,
  assignSeat,
  issuePass,
}: {
  attending: RsvpRow[];
  walkins: CheckinRow[];
  filter: Filter;
  search: string;
  tableName: (id: string | null) => string | null;
  manualCheckin: (r: RsvpRow) => void;
  editParty: (c: CheckinRow) => void;
  cancelCheckin: (c: CheckinRow, label: string) => void;
  assignSeat: (r: RsvpRow) => void;
  issuePass: (r: RsvpRow) => void;
}) {
  const list = useMemo(() => {
    const q = search.trim();
    const qDigits = q.replace(/\D/g, "");
    const match = (name: string | null, phone?: string | null) =>
      (name ?? "").includes(q) ||
      (qDigits.length >= 2 &&
        (phone ?? "").replace(/\D/g, "").includes(qDigits));

    let rows = attending;
    if (filter === "arrived") rows = rows.filter((r) => r.checkin);
    if (filter === "pending") rows = rows.filter((r) => !r.checkin);
    if (filter === "diff")
      rows = rows.filter(
        (r) =>
          r.checkin &&
          (r.checkin.actual_party_size ?? 0) !==
            (r.checkin.expected_party_size ?? r.expected_party_size)
      );
    if (filter === "noseat") rows = rows.filter((r) => !r.table_id);
    if (filter === "groom") rows = rows.filter((r) => r.side === "groom");
    if (filter === "bride") rows = rows.filter((r) => r.side === "bride");
    if (q) rows = rows.filter((r) => match(r.name, r.phone));
    return rows;
  }, [attending, filter, search]);

  const shownWalkins = useMemo(() => {
    if (filter !== "all" && filter !== "walkin") return [];
    const q = search.trim();
    return q ? walkins.filter((c) => (c.name ?? "").includes(q)) : walkins;
  }, [walkins, filter, search]);

  return (
    <>
      {/* ===== RSVP 목록 ===== */}
      <div className="space-y-1.5">
        {list.map((r) => {
          const ck = r.checkin;
          const diff =
            ck != null
              ? (ck.actual_party_size ?? 0) - (ck.expected_party_size ?? r.expected_party_size)
              : 0;
          return (
            <div key={r.id} className="bg-white border border-wedding-gold/15 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-sage-700 truncate">
                    <b>{r.name}</b>
                    {r.expected_party_size > 1 && ` 외 ${r.expected_party_size - 1}명`}
                    <span className="text-neutral-400 font-normal">
                      {" "}· {r.side ? SIDE_LABEL[r.side] : "-"}
                      {r.table_id && ` · ${tableName(r.table_id)}`}
                    </span>
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {ck ? (
                      <>
                        <span className="text-sage-600 font-medium">✓ 도착</span>
                        {" "}{ck.actual_party_size}명
                        {diff !== 0 && (
                          <span className="text-amber-600"> ({diff > 0 ? "+" : ""}{diff})</span>
                        )}
                        {" "}· {SOURCE_LABEL[ck.source ?? ""] ?? ""}
                        {" "}· {new Date(ck.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </>
                    ) : (
                      <span className="text-neutral-400">미도착</span>
                    )}
                    {!r.checkin_token_active && r.attending && (
                      <span className="text-red-400"> · QR 비활성</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!ck ? (
                    <ActionBtn onClick={() => manualCheckin(r)} primary>
                      체크인
                    </ActionBtn>
                  ) : (
                    <>
                      <ActionBtn onClick={() => editParty(ck)}>인원</ActionBtn>
                      <ActionBtn onClick={() => cancelCheckin(ck, `${r.name}님`)} danger>
                        취소
                      </ActionBtn>
                    </>
                  )}
                  <ActionBtn onClick={() => assignSeat(r)}>좌석</ActionBtn>
                  <ActionBtn onClick={() => issuePass(r)}>QR</ActionBtn>
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && shownWalkins.length === 0 && (
          <p className="text-xs text-neutral-400 text-center py-6">표시할 하객이 없어요</p>
        )}
      </div>

      {/* ===== 현장 등록·레거시 체크인 목록 ===== */}
      {shownWalkins.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-neutral-400">현장 등록 · RSVP 미연결</p>
          {shownWalkins.map((c) => (
            <div key={c.id} className="bg-white border border-wedding-gold/15 p-3 flex items-center justify-between gap-2">
              <p className="text-sm text-sage-700 min-w-0 truncate">
                <b>{c.name ?? "이름 없음"}</b>
                <span className="text-neutral-400 font-normal">
                  {" "}· {c.actual_party_size}명 · {SOURCE_LABEL[c.source ?? ""] ?? ""}
                  {" "}· {new Date(c.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
              <div className="flex gap-1 shrink-0">
                <ActionBtn onClick={() => editParty(c)}>인원</ActionBtn>
                <ActionBtn onClick={() => cancelCheckin(c, c.name ?? "현장 등록")} danger>
                  취소
                </ActionBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
