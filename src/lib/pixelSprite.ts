/**
 * 도트 마을 캐릭터 — 16×24 픽셀, 코드로 만든 오리지널 스프라이트(앞·뒤·옆 3방향).
 * 프레임은 머리(11줄) + 몸(7줄) + 다리(6줄)를 이어 붙여 만든다.
 * 글자 → 색:  . 투명  o 외곽선  s 피부  e 눈  h 머리색  c 옷색  p 바지  b 신발  a 모자색  f 꽃
 * 왼쪽으로 걷는 모습은 옆모습(오른쪽을 봄)을 좌우 반전해서 쓴다 — 반전은 그리는 쪽(PixelVillage)의 몫이다.
 * 하객 id 를 해시해 머리색·옷색·모자를 정하므로 같은 하객은 항상 같은 모습이다.
 * (나중에 시트 PNG 로 교체해도 villageSim.ts 는 손대지 않도록 이 파일에만 그림 데이터를 둔다.)
 */

export const SPRITE_W = 16;
export const SPRITE_H = 24;

/** down = 앞(아래로 걸을 때), up = 뒤(위로 걸을 때), side = 옆(오른쪽을 봄) */
export type SpriteDir = "down" | "up" | "side";
export type SpriteAnim = "idle" | "walk1" | "walk2";
export type FrameName = `${SpriteDir}_${SpriteAnim}`;

export const SPRITE_DIRS: readonly SpriteDir[] = ["down", "up", "side"];
export const SPRITE_ANIMS: readonly SpriteAnim[] = ["idle", "walk1", "walk2"];
export const FRAME_NAMES: readonly FrameName[] = SPRITE_DIRS.flatMap((d) =>
  SPRITE_ANIMS.map((a): FrameName => `${d}_${a}`)
);

const HEAD: Record<SpriteDir, string[]> = {
  down: [
    "................",
    "....oooooooo....",
    "...ohhhhhhhho...",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhsssssshho..",
    "..ohssssssssho..",
    "..ohssessessho..",
    "..ohssssssssho..",
    "...osssssssso...",
    "....oooooooo....",
  ],
  up: [
    "................",
    "....oooooooo....",
    "...ohhhhhhhho...",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "...ohhhhhhhho...",
    "....oooooooo....",
  ],
  side: [
    "................",
    "....oooooooo....",
    "...ohhhhhhhho...",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhsssso..",
    "..ohhhhsssssso..",
    "..ohhhhsssesso..",
    "..ohhhhsssssso..",
    "...ohhhssssso...",
    "....oooooooo....",
  ],
};

const BODY_FRONT = [
  ".....occccco....",
  "...occcccccco...",
  "...occcccccco...",
  "...osccccccso...",
  "....occcccco....",
  "....occcccco....",
  "....oooooooo....",
];

const BODY_SIDE = [
  ".....occcco.....",
  "....occcccco....",
  "....occcccco....",
  "....occsscco....",
  "....occcccco....",
  "....occcccco....",
  "....oooooooo....",
];

const BODY: Record<SpriteDir, string[]> = {
  down: BODY_FRONT,
  up: BODY_FRONT,
  side: BODY_SIDE,
};

/** 앞·뒤는 왼발/오른발이 번갈아 앞서고, 옆은 다리를 벌렸다 모은다 */
const LEGS_FRONT: Record<SpriteAnim, string[]> = {
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
    "....oppooppo....",
    "....obbooppo....",
    "....ooooobbo....",
    "........oooo....",
    "................",
  ],
  walk2: [
    "....oppppppo....",
    "....oppooppo....",
    "....oppoobbo....",
    "....obbooooo....",
    "....oooo........",
    "................",
  ],
};

const LEGS_SIDE: Record<SpriteAnim, string[]> = {
  idle: [
    "....oppppppo....",
    "....oppppppo....",
    "....oppppppo....",
    "....obbbbbbo....",
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
};

const LEGS: Record<SpriteDir, Record<SpriteAnim, string[]>> = {
  down: LEGS_FRONT,
  up: LEGS_FRONT,
  side: LEGS_SIDE,
};

function dirOf(frame: FrameName): SpriteDir {
  return frame.split("_")[0] as SpriteDir;
}

function animOf(frame: FrameName): SpriteAnim {
  return frame.split("_")[1] as SpriteAnim;
}

/** 프레임 → 24줄 문자열 (테스트·렌더가 공유) */
export const FRAME_ROWS = Object.fromEntries(
  FRAME_NAMES.map((f) => [f, [...HEAD[dirOf(f)], ...BODY[dirOf(f)], ...LEGS[dirOf(f)][animOf(f)]]])
) as Record<FrameName, string[]>;

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
  /** 바지 색 — 없으면 기본 남색(FIXED.p). 신랑·신부 옷차림에 쓴다 */
  pants?: string;
}

/** 단상 위 신랑·신부 — 하객 id 해시가 아니라 고정 외형 */
export const GROOM_LOOK: Look = { hair: "#2a2018", cloth: "#2f3340", hat: 0, hatColor: "#000000", pants: "#1e1f26" };
export const BRIDE_LOOK: Look = { hair: "#2a2018", cloth: "#f6f3ee", hat: 2, hatColor: "#000000", pants: "#f6f3ee" };

type Patch = [row: number, col: number, ch: string];

const span = (row: number, c0: number, c1: number, ch: string): Patch[] =>
  Array.from({ length: c1 - c0 + 1 }, (_, i): Patch => [row, c0 + i, ch]);

/**
 * 모자 조각 — 머리 줄(0~10)에만 덮어쓴다. 야구모자는 앞에서는 챙이 가로로, 옆에서는 오른쪽으로 튀어나오고,
 * 뒤에서는 챙이 보이지 않는다. 꽃은 앞·뒤에서는 오른쪽 위, 옆에서는 뒤통수 쪽에 단다.
 */
export function hatPatches(dir: SpriteDir, hat: Hat): Patch[] {
  if (hat === 0) return [];
  if (hat === 2) {
    const c = dir === "side" ? 5 : 9;
    return [...span(2, c, c + 1, "f"), ...span(3, c, c + 1, "f")];
  }
  if (dir === "down") return [...span(2, 4, 11, "a"), ...span(3, 3, 12, "a"), ...span(4, 3, 12, "a")];
  if (dir === "up") return [...span(2, 4, 11, "a"), ...span(3, 3, 12, "a"), ...span(4, 3, 12, "a")];
  return [...span(2, 4, 11, "a"), ...span(3, 3, 12, "a"), ...span(4, 3, 15, "a")];
}

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
  for (const [r, c, ch] of hatPatches(dirOf(frame), look.hat)) rows[r][c] = ch;
  return rows.map((row) =>
    row.map((ch) => {
      if (ch === ".") return null;
      if (ch === "h") return look.hair;
      if (ch === "c") return look.cloth;
      if (ch === "a") return look.hatColor;
      if (ch === "p") return look.pants ?? FIXED.p;
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
