"use client";

import { REGIONS, SIDO_LIST, OVERSEAS } from "@/lib/regions";

/**
 * 시/도 → 시/군/구 2단계 지역 선택.
 * - 해외 선택 시 국가명 텍스트 입력으로 전환 (마음 배송)
 * - `domesticOnly` 면 해외를 아예 빼고 국가명 입력도 없다 (직접 배달)
 */
export default function RegionPicker({
  sido,
  sub,
  onChange,
  domesticOnly = false,
}: {
  sido: string;
  sub: string;
  onChange: (sido: string, sub: string) => void;
  /**
   * 직접 배달은 국내만 간다 — 해외를 고를 수 있게 두면 갈 수 없는 곳을
   * 신청받게 된다. 마음 배송(축하만 남기기)에는 해외가 필요하므로 기본은 false.
   */
  domesticOnly?: boolean;
}) {
  const isOverseas = !domesticOnly && sido === OVERSEAS;
  const subs = sido && !isOverseas ? REGIONS[sido] ?? [] : [];
  const sidoList = domesticOnly
    ? SIDO_LIST.filter((s) => s !== OVERSEAS)
    : SIDO_LIST;

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={sido}
        onChange={(e) => onChange(e.target.value, "")}
        className="dform-input appearance-none"
        aria-label="시/도"
      >
        <option value="">시/도</option>
        {sidoList.map((s) => (
          <option key={s} value={s}>
            {s === OVERSEAS ? "해외 🌍" : s}
          </option>
        ))}
      </select>

      {isOverseas ? (
        <input
          value={sub}
          onChange={(e) => onChange(sido, e.target.value)}
          placeholder="국가명 (예: 프랑스)"
          className="dform-input"
          aria-label="국가명"
        />
      ) : (
        <select
          value={sub}
          onChange={(e) => onChange(sido, e.target.value)}
          disabled={!sido}
          className="dform-input appearance-none disabled:opacity-50"
          aria-label="시/군/구"
        >
          <option value="">시/군/구</option>
          {subs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
