/**
 * 도트 마을 캐릭터 — 16×24 픽셀, 코드로 만든 오리지널 스프라이트.
 * 프레임은 머리(11줄) + 몸(7줄) + 다리(6줄)를 이어 붙여 만든다.
 * 글자 → 색:  . 투명  o 외곽선  s 피부  e 눈  h 머리색  c 옷색  p 바지  b 신발  a 모자색  f 꽃
 * 하객 id 를 해시해 머리색·옷색·모자를 정하므로 같은 하객은 항상 같은 모습이다.
 * (나중에 시트 PNG 로 교체해도 villageSim.ts 는 손대지 않도록 이 파일에만 그림 데이터를 둔다.)
 */

export const SPRITE_W = 16;
export const SPRITE_H = 24;

export type FrameName = "idle" | "walk1" | "walk2" | "jump";
export const FRAME_NAMES: readonly FrameName[] = ["idle", "walk1", "walk2", "jump"];

const HEAD = [
  "................",
  "....oooooooo....",
  "...ohhhhhhhho...",
  "..ohhhhhhhhhho..",
  "..ohhhhhhhhhho..",
  "..ohhsssssshho..",
  "..ohssssssssho..",
  "..ohsssessesho..",
  "..ohssssssssho..",
  "...osssssssso...",
  "....oooooooo....",
];

const BODY_DOWN = [
  ".....occccco....",
  "...occcccccco...",
  "...occcccccco...",
  "...osccccccso...",
  "....occcccco....",
  "....occcccco....",
  "....oooooooo....",
];

const BODY_UP = [
  "...o.occccco.o..",
  "...oscccccccso..",
  "...osccccccso...",
  "....occcccco....",
  "....occcccco....",
  "....occcccco....",
  "....oooooooo....",
];

const LEGS: Record<FrameName, string[]> = {
  idle: [
    "....oppppppo....",
    "....oppooppo....",
    "....oppooppo....",
    "....obboobbo....",
    "....oooooooo....",
    "................",
  ],
  walk1: [
    "....oppppppo....",
    "...oppo..oppo...",
    "..oppo....oppo..",
    "..obbo....obbo..",
    "..oooo....oooo..",
    "................",
  ],
  walk2: [
    "....oppppppo....",
    ".....oppppo.....",
    ".....oppppo.....",
    ".....obbbbo.....",
    ".....oooooo.....",
    "................",
  ],
  jump: [
    "....oppppppo....",
    "...oppo..oppo...",
    "...obbo..obbo...",
    "...oooo..oooo...",
    "................",
    "................",
  ],
};

/** 프레임 → 24줄 문자열 (테스트·렌더가 공유) */
export const FRAME_ROWS: Record<FrameName, string[]> = {
  idle: [...HEAD, ...BODY_DOWN, ...LEGS.idle],
  walk1: [...HEAD, ...BODY_DOWN, ...LEGS.walk1],
  walk2: [...HEAD, ...BODY_DOWN, ...LEGS.walk2],
  jump: [...HEAD, ...BODY_UP, ...LEGS.jump],
};

const HAIR_COLORS = ["#3b2a20", "#6b4226", "#c98b3d", "#e8c26a", "#a8483a", "#4a4e69", "#2f2f2f", "#d98fb0"];
const CLOTH_COLORS = ["#788c63", "#4a5a3e", "#b89b6e", "#5f8fb4", "#c46b6b", "#8a6fb0", "#e0a63c", "#4fa39a", "#d98fb0"];
const HAT_COLORS = ["#c46b6b", "#5f8fb4", "#e0a63c", "#4a5a3e"];

const FIXED: Record<string, string> = {
  o: "#2b2118",
  s: "#f6d3b0",
  e: "#2b2118",
  p: "#3d4a63",
  b: "#6b4a2e",
  f: "#f08aa5",
};

/** 모자 종류 — 0 없음, 1 야구모자, 2 머리 꽃 */
export type Hat = 0 | 1 | 2;

export interface Look {
  hair: string;
  cloth: string;
  hat: Hat;
  hatColor: string;
}

/** 모자 조각: [줄, 칸, 글자] — 머리 줄(0~10)에만 덮어쓴다 */
const HAT_PATCHES: Record<Exclude<Hat, 0>, Array<[number, number, string]>> = {
  1: [
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11].map((c): [number, number, string] => [2, c, "a"]),
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c): [number, number, string] => [3, c, "a"]),
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((c): [number, number, string] => [4, c, "a"]),
  ],
  2: [
    [2, 9, "f"],
    [2, 10, "f"],
    [3, 9, "f"],
    [3, 10, "f"],
  ],
};

/** FNV-1a 32bit — 같은 id 는 항상 같은 값 */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function lookFromId(id: string): Look {
  const h = hashId(id);
  return {
    hair: HAIR_COLORS[h % HAIR_COLORS.length],
    cloth: CLOTH_COLORS[(h >>> 4) % CLOTH_COLORS.length],
    hat: ((h >>> 9) % 3) as Hat,
    hatColor: HAT_COLORS[(h >>> 12) % HAT_COLORS.length],
  };
}

/** 프레임 + 외형 → 색 격자 (null = 투명). 순수 함수라 테스트가 쉽다. */
export function buildFrameGrid(frame: FrameName, look: Look): (string | null)[][] {
  const rows = FRAME_ROWS[frame].map((r) => r.split(""));
  if (look.hat !== 0) {
    for (const [r, c, ch] of HAT_PATCHES[look.hat]) rows[r][c] = ch;
  }
  return rows.map((row) =>
    row.map((ch) => {
      if (ch === ".") return null;
      if (ch === "h") return look.hair;
      if (ch === "c") return look.cloth;
      if (ch === "a") return look.hatColor;
      return FIXED[ch] ?? null;
    })
  );
}

/** 색 격자를 오프스크린 캔버스에 한 번만 구워 둔다 (브라우저 전용 — 테스트 대상 아님) */
export function bakeFrame(grid: (string | null)[][]): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = SPRITE_W;
  cv.height = SPRITE_H;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  grid.forEach((row, y) =>
    row.forEach((color, x) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    })
  );
  return cv;
}

/** 한 하객의 전 프레임을 구워 돌려준다 */
export function bakeSprites(look: Look): Record<FrameName, HTMLCanvasElement> {
  const out = {} as Record<FrameName, HTMLCanvasElement>;
  for (const f of FRAME_NAMES) out[f] = bakeFrame(buildFrameGrid(f, look));
  return out;
}
