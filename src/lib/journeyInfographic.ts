/**
 * 방명록 '지도' 탭 인포그래픽의 순수 로직 (React·DOM 무관).
 * 지역 집계 · 반지름 · 겹침 해소 · 순위 · 여정 점선 · 이름 목록.
 *
 * 개인정보: 시/군/구는 한 버블로 합쳐 시/도까지만 드러낸다.
 */

import type { Celebration } from "@/lib/supabase";
import { KOREA_VIEW, REGION_POS, SIDO_POS } from "@/lib/koreaGeo";
import { sidoOf } from "@/lib/regions";

export type Filter = "all" | "직접배달" | "마음배송";

/** 해외·좌표 없는 지역을 모으는 버블 이름 */
export const OTHER_KEY = "해외·기타";

export const VIEW = { w: KOREA_VIEW.w, h: KOREA_VIEW.h };
/** 해외/미매칭 — 지도 왼쪽 아래 바다에 둔다 */
export const OVERSEAS_POS = { x: 12, y: VIEW.h - 18 };

/** 버블 반지름 범위(viewBox 단위) */
const R_MIN = 3.2;
const R_MAX = 9.5;
/** 인원이 적을 때 한 버블이 지도를 덮지 않도록 정규화 분모의 바닥 */
const R_SCALE_FLOOR = 12;
/** 겹침 해소 시 버블 사이 여백 / 원위치에서 최대 이동 거리 / 반복 횟수 상한 */
const GAP = 0.6;
export const MAX_SHIFT = 14;
const MAX_ITER = 80;

/* ---------- 지역 판정 ---------- */

/** 자기 키만 인정 — `in` 은 constructor·__proto__ 같은 Object.prototype 키도 참으로 만든다 */
const has = (obj: object, k: string) => Object.prototype.hasOwnProperty.call(obj, k);

/**
 * 시/군/구 단독명 → 시/도. 전국에서 이름이 유일한 것만 수록("동구"처럼
 * 여러 시/도에 있는 이름은 제외). "경주시" → "경주" 축약형도 등록해
 * 자유입력("경주")의 토큰 매칭에 쓴다.
 */
const SUB_SIDO: Record<string, string> = (() => {
  const cand: Record<string, Set<string>> = {};
  const put = (name: string, sido: string) => (cand[name] ??= new Set()).add(sido);
  for (const full of Object.keys(REGION_POS)) {
    const [sido, sub] = full.split(/\s+/);
    if (!sub) continue;
    put(sub, sido);
    const short = sub.replace(/(시|군|구)$/, "");
    // 축약형이 시/도명과 겹치면 제외 (예: "광주시"→"광주"는 광역시와 충돌)
    if (short && short !== sub && !has(SIDO_POS, short)) put(short, sido);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cand)) if (v.size === 1) out[k] = [...v][0];
  return out;
})();

/** 지역 문자열 → 시/도 키. 못 찾으면 null (해외·기타) */
export function resolveSido(area: string | null | undefined): string | null {
  const exact = sidoOf(area);
  if (exact) return exact;
  for (const tok of (area ?? "").trim().split(/\s+/)) {
    if (!tok) continue;
    // "서울시"·"부산광역시" 류 접미사 정규화
    const t = tok.replace(/(특별시|광역시|특별자치시|특별자치도|도|시)$/, "");
    if (has(SIDO_POS, tok)) return tok;
    if (t && has(SIDO_POS, t)) return t;
    if (has(SUB_SIDO, tok)) return SUB_SIDO[tok];
    if (t && has(SUB_SIDO, t)) return SUB_SIDO[t];
  }
  return null;
}

const keyOf = (area: string | null | undefined) => resolveSido(area) ?? OTHER_KEY;

/**
 * 시간순 정렬 키(ms) — 날짜가 없으면 등록 시각으로 대신한다.
 * 문자열 비교는 시간대 표기(Z/+09:00)가 섞이면 틀려서 타임스탬프로 비교한다.
 */
const ts = (s: string) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
};
function byTime(a: Celebration, b: Celebration): number {
  const ka = ts(a.date ?? a.created_at);
  const kb = ts(b.date ?? b.created_at);
  if (ka !== kb) return ka - kb;
  const ca = ts(a.created_at);
  const cb = ts(b.created_at);
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ---------- 집계 ---------- */

export interface RegionGroup {
  key: string;
  /** 필터에 맞는 직접배달 / 마음배송 (시간순) */
  direct: Celebration[];
  heart: Celebration[];
  total: number;
  /** 겹침 해소 전 기준 좌표(viewBox 단위) */
  x: number;
  y: number;
}

/** 필터에 맞는 종류만 센 시/도 단위 버블 목록 — 인원 내림차순, 같으면 지역명 오름차순 */
export function groupByRegion(celebrations: Celebration[], filter: Filter): RegionGroup[] {
  const map = new Map<string, RegionGroup>();
  for (const c of [...celebrations].sort(byTime)) {
    if (filter !== "all" && c.kind !== filter) continue;
    const key = keyOf(c.area);
    let g = map.get(key);
    if (!g) {
      // 좌표가 없는 키는 어떤 경우에도 해외·기타 자리로 — 위치는 항상 유한해야 한다
      const pos = key !== OTHER_KEY && has(SIDO_POS, key) ? SIDO_POS[key] : OVERSEAS_POS;
      g = { key, direct: [], heart: [], total: 0, x: pos.x, y: pos.y };
      map.set(key, g);
    }
    (c.kind === "직접배달" ? g.direct : g.heart).push(c);
    g.total += 1;
  }
  return [...map.values()].sort(
    (a, b) => b.total - a.total || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** 카드 수치 — 필터와 무관하게 전체 기준 */
export function cardStats(celebrations: Celebration[]): {
  directCount: number;
  heartCount: number;
  areaCount: number;
} {
  let directCount = 0;
  let heartCount = 0;
  const areas = new Set<string>();
  for (const c of celebrations) {
    if (c.kind === "직접배달") directCount += 1;
    else heartCount += 1;
    areas.add(keyOf(c.area));
  }
  return { directCount, heartCount, areaCount: areas.size };
}

/** 상위 N개 지역 키 (이미 정렬된 groups 기준, 해외·기타는 지역이 아니므로 제외) */
export function topKeys(groups: RegionGroup[], n = 3): string[] {
  return groups
    .filter((g) => g.key !== OTHER_KEY)
    .slice(0, n)
    .map((g) => g.key);
}

/* ---------- 반지름 ---------- */

/** 인원 → 반지름. sqrt 스케일(면적 ∝ 인원), 0명은 버블 없음 */
export function bubbleRadius(count: number, maxCount: number): number {
  if (count <= 0) return 0;
  const denom = Math.max(maxCount, R_SCALE_FLOOR, count);
  return R_MIN + (R_MAX - R_MIN) * Math.sqrt(count / denom);
}

/* ---------- 겹침 해소 ---------- */

export interface BubbleItem {
  key: string;
  x: number;
  y: number;
  r: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 겹친 버블을 서로 밀어낸다 (결정적·순수, 입력 불변).
 * - 겹친 만큼을 반지름 반비례로 나눠 밀어 큰 버블이 덜 움직인다.
 * - 매 단계 원위치 반경 MAX_SHIFT 안, viewBox 안으로 되돌린다.
 *   (viewBox 로의 투영은 원점을 포함한 볼록 집합이라 이동 상한을 깨지 않는다)
 */
export function layoutBubbles(items: BubbleItem[]): BubbleItem[] {
  const { w, h } = VIEW;
  // 입력 순서와 무관하게 같은 결과가 나오도록 큰 것부터·키 순으로 처리한다
  const order = items
    .map((_, i) => i)
    .sort((a, b) => items[b].r - items[a].r || (items[a].key < items[b].key ? -1 : 1));

  const home = items.map((b) => ({
    x: clamp(b.x, b.r, w - b.r),
    y: clamp(b.y, b.r, h - b.r),
  }));
  const pos = home.map((p) => ({ ...p }));

  const place = (i: number, x: number, y: number) => {
    const o = home[i];
    const dx = x - o.x;
    const dy = y - o.y;
    const d = Math.hypot(dx, dy);
    if (d > MAX_SHIFT) {
      x = o.x + (dx / d) * MAX_SHIFT;
      y = o.y + (dy / d) * MAX_SHIFT;
    }
    pos[i] = { x: clamp(x, items[i].r, w - items[i].r), y: clamp(y, items[i].r, h - items[i].r) };
  };

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let moved = false;
    for (let oi = 0; oi < order.length; oi++) {
      for (let oj = oi + 1; oj < order.length; oj++) {
        const i = order[oi];
        const j = order[oj];
        const need = items[i].r + items[j].r + GAP;
        let dx = pos[j].x - pos[i].x;
        let dy = pos[j].y - pos[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= need - 1e-6) continue;
        if (d < 1e-9) {
          // 완전히 같은 자리 — 순서로 정한 고정 방향으로 갈라놓는다
          const ang = (oi * 2.399963 + oj) % (Math.PI * 2);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = need - d;
        const ux = dx / d;
        const uy = dy / d;
        const rs = items[i].r + items[j].r;
        // i 는 j 반대쪽으로 (r_j/rs), j 는 i 반대쪽으로 (r_i/rs) — 작은 쪽이 더 움직임
        place(i, pos[i].x - ux * push * (items[j].r / rs), pos[i].y - uy * push * (items[j].r / rs));
        place(j, pos[j].x + ux * push * (items[i].r / rs), pos[j].y + uy * push * (items[i].r / rs));
        moved = true;
      }
    }
    if (!moved) break;
  }

  return items.map((b, i) => ({ key: b.key, x: pos[i].x, y: pos[i].y, r: b.r }));
}

/* ---------- 여정 점선 ---------- */

/**
 * 직접 만난 분들의 시/도를 날짜순으로 이은 키 목록.
 * 연속 같은 지역은 합치고, 서로 다른 지역이 2개 미만이면 빈 배열.
 * 해외·기타는 지도 위 실제 위치가 아니라서 잇지 않는다.
 */
export function journeyKeys(celebrations: Celebration[]): string[] {
  const seq: string[] = [];
  for (const c of celebrations.filter((x) => x.kind === "직접배달").sort(byTime)) {
    const key = keyOf(c.area);
    if (key === OTHER_KEY) continue;
    if (seq[seq.length - 1] !== key) seq.push(key);
  }
  return new Set(seq).size < 2 ? [] : seq;
}

/* ---------- 이름 목록 ---------- */

/** 말풍선 이름 목록 — 최대 max 명, 나머지는 more. 빈 이름은 건너뛴다 */
export function nameList(entries: Celebration[], max = 6): { lines: string[]; more: number } {
  const named = entries.filter((e) => e.name.trim() !== "");
  const lines = named
    .slice(0, max)
    .map((e) =>
      e.kind === "마음배송" ? `${e.stamp ?? "💌"} ${e.name.trim()}님` : `${e.name.trim()}님`,
    );
  return { lines, more: Math.max(0, named.length - max) };
}

/* ---------- 지역명 라벨 위치 ---------- */

export const LABEL_FONT = 3.4;

export interface LabelPos {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

/**
 * 버블 옆 지역명 라벨 위치 — 아래·위·오른쪽·왼쪽 순으로 시도해
 * 다른 버블이나 viewBox 와 겹치지 않는 첫 자리를 쓴다(없으면 가장 덜 겹치는 자리).
 * 서울처럼 이웃 버블이 바로 아래에 붙은 경우 글씨가 가려지는 걸 피하려는 것.
 */
export function placeLabel(target: BubbleItem, all: BubbleItem[], text: string): LabelPos {
  const w = text.length * LABEL_FONT * 0.95 + 1;
  const h = LABEL_FONT + 0.6;
  const { r } = target;
  const cands: { pos: LabelPos; box: { x0: number; y0: number; x1: number; y1: number } }[] = [
    { pos: { x: target.x, y: target.y + r + 3, anchor: "middle" }, box: { x0: target.x - w / 2, y0: target.y + r + 0.4, x1: target.x + w / 2, y1: target.y + r + 0.4 + h } },
    { pos: { x: target.x, y: target.y - r - 1.2, anchor: "middle" }, box: { x0: target.x - w / 2, y0: target.y - r - 0.4 - h, x1: target.x + w / 2, y1: target.y - r - 0.4 } },
    { pos: { x: target.x + r + 1, y: target.y + 1.2, anchor: "start" }, box: { x0: target.x + r + 0.6, y0: target.y - h / 2, x1: target.x + r + 0.6 + w, y1: target.y + h / 2 } },
    { pos: { x: target.x - r - 1, y: target.y + 1.2, anchor: "end" }, box: { x0: target.x - r - 0.6 - w, y0: target.y - h / 2, x1: target.x - r - 0.6, y1: target.y + h / 2 } },
  ];
  let best = cands[0];
  let bestCost = Infinity;
  for (const c of cands) {
    let cost = 0;
    const { x0, y0, x1, y1 } = c.box;
    if (x0 < 0) cost += -x0 * h;
    if (y0 < 0) cost += -y0 * w;
    if (x1 > VIEW.w) cost += (x1 - VIEW.w) * h;
    if (y1 > VIEW.h) cost += (y1 - VIEW.h) * w;
    for (const o of all) {
      if (o.key === target.key) continue;
      // 사각형과 원의 겹침: 원 중심에서 사각형까지 가장 가까운 점의 거리
      const dx = o.x - clamp(o.x, x0, x1);
      const dy = o.y - clamp(o.y, y0, y1);
      const pen = o.r - Math.hypot(dx, dy);
      if (pen > 0) cost += pen * Math.min(w, h * 2);
    }
    if (cost < bestCost - 1e-9) {
      best = c;
      bestCost = cost;
    }
    if (cost === 0) break;
  }
  return best.pos;
}
