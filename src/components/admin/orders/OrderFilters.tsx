"use client";

import type { DeliveryStatus, Group } from "@/lib/supabase";
import { STATUS_TABS } from "@/app/admin/shared";

/** 상태 탭 · 그룹 필터 · 이름/연락처 검색 · CSV 내보내기 */
export default function OrderFilters({
  tab,
  onTabChange,
  groupFilter,
  onGroupChange,
  groups,
  search,
  setSearch,
}: {
  tab: DeliveryStatus | "전체";
  onTabChange: (t: DeliveryStatus | "전체") => void;
  groupFilter: string;
  onGroupChange: (gid: string) => void;
  groups: Group[];
  search: string;
  setSearch: (v: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        {(["전체", ...STATUS_TABS] as (DeliveryStatus | "전체")[]).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`px-4 py-2 text-xs tracking-wider border ${
              tab === t
                ? "bg-sage-600 text-white border-sage-600"
                : "bg-white text-neutral-500 border-wedding-gold/20"
            }`}
          >
            {t}
          </button>
        ))}
        <select
          value={groupFilter}
          onChange={(e) => onGroupChange(e.target.value)}
          className="px-3 py-2 text-xs border border-wedding-gold/20 bg-white text-neutral-600"
        >
          <option value="">전체 그룹</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 · 연락처 검색"
          className="flex-1 p-2.5 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
        />
        <a
          href="/api/admin/export"
          className="shrink-0 flex items-center px-3 text-xs border border-sage-300 text-sage-600 bg-white whitespace-nowrap"
          title="참여자 연락처 CSV 내보내기"
        >
          CSV ⬇
        </a>
      </div>
    </>
  );
}
