"use client";

import { REGIONS, SIDO_LIST, OVERSEAS } from "@/lib/regions";

/**
 * 시/도 → 시/군/구 2단계 지역 선택 (마음 배송 필수 입력)
 * - 해외 선택 시 국가명 텍스트 입력으로 전환
 */
export default function RegionPicker({
  sido,
  sub,
  onChange,
}: {
  sido: string;
  sub: string;
  onChange: (sido: string, sub: string) => void;
}) {
  const isOverseas = sido === OVERSEAS;
  const subs = sido && !isOverseas ? REGIONS[sido] ?? [] : [];

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={sido}
        onChange={(e) => onChange(e.target.value, "")}
        className="dform-input appearance-none"
        aria-label="시/도"
      >
        <option value="">시/도</option>
        {SIDO_LIST.map((s) => (
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
