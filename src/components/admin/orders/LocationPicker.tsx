"use client";

import { REGIONS, SIDO_LIST, OVERSEAS } from "@/lib/regions";

const CLS = "p-2 text-xs border border-wedding-gold/20 bg-white";

/**
 * 관리자용 장소 입력 — 시/도 · 시/군/구 · 상세(선택).
 *
 * 하객 화면(`RegionPicker`)과 **같은 저장 형식**("서울 강남구 …")을 만든다.
 * 형식이 어긋나면 배송경로 탭 지도의 핀이 안 붙는다 — `sidoOf` 가 첫 낱말을
 * 시/도로 읽기 때문이다. 예전 자유 입력("강남구 또는 암데나")이 그래서 문제였다.
 *
 * 하객 쪽 컴포넌트를 그대로 쓰지 않고 목록(`REGIONS`)만 공유한다 — 그쪽
 * `dform-input` 은 배달앱 톤의 큰 입력이라 어드민 카드 안에서 과하다.
 *
 * 직접 배달은 국내만 가므로 해외는 뺀다 (하객 쪽 `domesticOnly` 와 같은 이유).
 */
export default function LocationPicker({
  sido,
  sub,
  detail,
  onChange,
  /** 상세 입력 자리표시 — 신규 주문과 일정 수정에서 문구가 조금 다르다 */
  detailPlaceholder = "상세 위치 (선택) — 예: 강남역 2번 출구",
}: {
  sido: string;
  sub: string;
  detail: string;
  onChange: (next: { sido: string; sub: string; detail: string }) => void;
  detailPlaceholder?: string;
}) {
  const subs = sido ? REGIONS[sido] ?? [] : [];
  return (
    <>
      <select
        value={sido}
        // 시/도가 바뀌면 이전 시/군/구는 그 시/도에 없는 값이라 비운다
        onChange={(e) => onChange({ sido: e.target.value, sub: "", detail })}
        className={CLS}
        aria-label="시/도"
      >
        <option value="">시/도</option>
        {SIDO_LIST.filter((s) => s !== OVERSEAS).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={sub}
        onChange={(e) => onChange({ sido, sub: e.target.value, detail })}
        disabled={!sido}
        className={`${CLS} disabled:opacity-50`}
        aria-label="시/군/구"
      >
        <option value="">시/군/구</option>
        {subs.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={detail}
        onChange={(e) => onChange({ sido, sub, detail: e.target.value })}
        placeholder={detailPlaceholder}
        aria-label="상세 위치"
        className={`flex-1 min-w-[140px] ${CLS}`}
      />
    </>
  );
}
