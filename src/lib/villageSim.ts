import type { FrameName } from "@/lib/pixelSprite";

/**
 * 도트 마을 이동 로직 — 렌더·DOM 과 무관한 순수 함수 모음.
 * 좌표는 논리 해상도(192×128) 기준이고 (x, y) 는 캐릭터의 '발 밑 중앙'이다.
 * 발판은 메이플스토리처럼 아래에서 위로는 통과하고 위에서 떨어질 때만 밟는다(one-way).
 */

export const WORLD_W = 192;
export const WORLD_H = 128;
/** 캐릭터 가로 반폭 — 월드 벽에서 이만큼 안쪽까지만 간다 */
export const HALF_W = 8;
export const BOX_H = 24;

export interface Platform {
  x0: number;
  x1: number;
  /** 발판 윗면(= 발이 닿는 y) */
  y: number;
}

/** 0번이 바닥. 높이 간격 32px < 점프 최고점(약 43px) 이라 아래에서 점프해 올라탈 수 있다. */
export const PLATFORMS: readonly Platform[] = [
  { x0: HALF_W, x1: WORLD_W - HALF_W, y: 118 },
  { x0: 16, x1: 88, y: 86 },
  { x0: 104, x1: 176, y: 86 },
  { x0: 60, x1: 132, y: 54 },
];

export const WALK_SPEED = 24; // px/s
export const GRAVITY = 420; // px/s²
export const JUMP_VY = -190; // px/s
export const JUMP_VX = 28; // px/s
/** 하늘에서 떨어지는 새 하객의 시작 높이 (화면 위쪽 바깥) */
const SKY_Y = -BOX_H;

export type Rng = () => number;

/** mulberry32 — 시드가 같으면 같은 수열 (테스트 재현용) */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Mode = "idle" | "walk" | "jump" | "fall";

export interface Walker {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  mode: Mode;
  /** 서 있는 발판 인덱스, 공중이면 -1 */
  plat: number;
  /** 현재 행동이 끝나기까지 남은 시간(초) */
  timer: number;
  /** 걷기 프레임용 누적 시간(초) */
  clock: number;
}

/** fromSky=true 면 하늘에서 떨어지며 등장, 아니면 임의 발판 위에 서서 시작 */
export function spawnWalker(id: string, rng: Rng, fromSky: boolean): Walker {
  const facing: 1 | -1 = rng() < 0.5 ? 1 : -1;
  if (fromSky) {
    return {
      id,
      x: HALF_W + rng() * (WORLD_W - 2 * HALF_W),
      y: SKY_Y,
      vx: 0,
      vy: 0,
      facing,
      mode: "fall",
      plat: -1,
      timer: 0,
      clock: 0,
    };
  }
  const plat = Math.floor(rng() * PLATFORMS.length);
  const p = PLATFORMS[plat];
  return {
    id,
    x: p.x0 + rng() * (p.x1 - p.x0),
    y: p.y,
    vx: 0,
    vy: 0,
    facing,
    mode: "idle",
    plat,
    timer: 0.2 + rng() * 2,
    clock: rng() * 10,
  };
}

/** 이번 프레임에 밟는 발판(가장 높은 것) 인덱스, 없으면 -1 */
function landingPlatform(prevY: number, y: number, x: number): number {
  let best = -1;
  for (let i = 0; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i];
    if (prevY <= p.y && y >= p.y && x >= p.x0 && x <= p.x1) {
      if (best < 0 || p.y < PLATFORMS[best].y) best = i;
    }
  }
  return best;
}

function stepAir(n: Walker, prevY: number, dt: number): Walker {
  n.vy += GRAVITY * dt;
  n.x = Math.min(WORLD_W - HALF_W, Math.max(HALF_W, n.x + n.vx * dt));
  n.y += n.vy * dt;
  if (n.vy > 0) {
    const land = landingPlatform(prevY, n.y, n.x);
    if (land >= 0) {
      n.plat = land;
      n.y = PLATFORMS[land].y;
      n.vx = 0;
      n.vy = 0;
      n.mode = "idle";
      n.timer = 0.5;
      return n;
    }
  }
  n.mode = n.vy < 0 ? "jump" : "fall";
  return n;
}

function pickAction(n: Walker, rng: Rng): void {
  if (n.mode === "walk") {
    n.mode = "idle";
    n.timer = 0.6 + rng() * 2;
    return;
  }
  const r = rng();
  if (r < 0.55) {
    n.mode = "walk";
    n.facing = rng() < 0.5 ? 1 : -1;
    n.timer = 1.2 + rng() * 2.5;
  } else if (r < 0.7) {
    n.mode = "jump";
    n.vy = JUMP_VY;
    n.vx = rng() < 0.5 ? 0 : n.facing * JUMP_VX;
    n.plat = -1;
  } else {
    n.timer = 0.6 + rng() * 2;
  }
}

/**
 * 한 프레임 진행. 새 객체를 돌려주며 입력 w 는 바꾸지 않는다.
 * frozen=true(말풍선을 보는 중)면 땅에 서 있을 때 멈춘다. 공중이면 착지까지 계속 낙하한다.
 */
export function stepWalker(w: Walker, dt: number, rng: Rng, frozen = false): Walker {
  const n: Walker = { ...w, clock: w.clock + dt };
  if (n.plat < 0) return stepAir(n, w.y, dt);

  if (frozen) {
    n.mode = "idle";
    n.vx = 0;
    return n;
  }

  n.timer -= dt;
  const p = PLATFORMS[n.plat];
  if (n.mode === "walk") {
    n.x += n.facing * WALK_SPEED * dt;
    if (n.x < p.x0 || n.x > p.x1) {
      // 바닥 끝(월드 벽)은 항상 되돌아가고, 위쪽 발판 끝은 절반 확률로 걸어 내려간다.
      if (n.plat !== 0 && rng() < 0.5) {
        n.plat = -1;
        n.mode = "fall";
        n.vx = n.facing * WALK_SPEED;
        n.vy = 0;
        return n;
      }
      n.x = Math.min(p.x1, Math.max(p.x0, n.x));
      n.facing = n.facing === 1 ? -1 : 1;
    }
  }
  if (n.timer <= 0) pickAction(n, rng);
  return n;
}

const WALK_CYCLE: readonly FrameName[] = ["walk1", "idle", "walk2", "idle"];

/** 지금 그릴 스프라이트 프레임 */
export function frameFor(w: Walker): FrameName {
  if (w.plat < 0) return "jump";
  if (w.mode === "walk") return WALK_CYCLE[Math.floor(w.clock * 6) % WALK_CYCLE.length];
  return "idle";
}

/** 논리 좌표 (px, py) 를 누른 캐릭터 중 가장 앞(아래)에 그려진 것. 터치 여유 pad 포함. */
export function pickWalkerAt(
  walkers: Iterable<Walker>,
  px: number,
  py: number,
  pad = 3
): Walker | null {
  let hit: Walker | null = null;
  for (const w of walkers) {
    if (
      px >= w.x - HALF_W - pad &&
      px <= w.x + HALF_W + pad &&
      py >= w.y - BOX_H - pad &&
      py <= w.y + pad
    ) {
      if (!hit || w.y >= hit.y) hit = w;
    }
  }
  return hit;
}
