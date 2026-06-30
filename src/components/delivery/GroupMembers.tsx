"use client";

import { useEffect, useState } from "react";
import {
  supabase,
  isSupabaseConfigured,
  type GroupMember,
  type GroupStatusMember,
} from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";

/**
 * 그룹 신청 현황.
 * - 명단(group_members)이 등록돼 있으면: 명단 기준 ✅신청 / ⬜미신청 표시
 * - 명단이 없으면: 신청자 목록만 ✅로 표시
 */
export default function GroupMembers({
  slug,
  refreshKey = 0,
}: {
  slug: string;
  refreshKey?: number;
}) {
  const [roster, setRoster] = useState<GroupStatusMember[]>([]);
  const [applicants, setApplicants] = useState<GroupMember[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const { data: statusData } = await supabase!.rpc("get_group_status", {
        p_slug: slug,
      });
      if (!alive) return;
      const rosterRows = Array.isArray(statusData)
        ? (statusData as GroupStatusMember[])
        : [];
      if (rosterRows.length > 0) {
        setRoster(rosterRows);
        setLoaded(true);
        return;
      }
      // 명단 없음 → 신청자 목록으로 폴백
      const { data: memberData } = await supabase!.rpc("get_group_members", {
        p_slug: slug,
      });
      if (!alive) return;
      setApplicants(Array.isArray(memberData) ? (memberData as GroupMember[]) : []);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [slug, refreshKey]);

  const hasRoster = roster.length > 0;
  const empty = loaded && !hasRoster && applicants.length === 0;

  return (
    <div className="bg-white rounded-2xl border border-delivery/10 p-5">
      <p className="text-center text-xs font-bold text-neutral-500 mb-3">
        ─── 우리 그룹 신청 현황 ───
      </p>

      {empty ? (
        <p className="text-center text-sm text-neutral-400 py-4">
          아직 신청한 분이 없어요.
          <br />
          1등으로 신청해보세요! 🥇
        </p>
      ) : hasRoster ? (
        <ul className="space-y-2.5">
          {roster.map((m, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className={m.applied ? "text-delivery-mint" : "text-neutral-300"}>
                {m.applied ? "✅" : "⬜"}
              </span>
              <span
                className={`font-bold ${
                  m.applied ? "text-neutral-700" : "text-neutral-400"
                }`}
              >
                {m.name}
              </span>
              <span className="text-neutral-400 text-xs ml-auto">
                {m.applied && m.date
                  ? `${formatYmdKo(m.date)} ${m.time_slot ?? ""}`
                  : "미신청"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2.5">
          {applicants.map((m, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="text-delivery-mint">✅</span>
              <span className="font-bold text-neutral-700">{m.name}</span>
              <span className="text-neutral-400 text-xs ml-auto">
                {formatYmdKo(m.date)} {m.time_slot}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
