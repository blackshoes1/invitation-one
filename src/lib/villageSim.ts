import type { FrameName } from "@/lib/pixelSprite";

/**
 * 도트 마당 이동 로직 — 렌더·DOM 과 무관한 순수 함수 모음. (바람의 나라식 탑뷰, 정원 예식장)
 * 좌표는 논리 해상도(192×176) 기준이고 (x, y) 는 캐릭터의 '발 밑 중앙'이다.
 * 캐릭터는 상·하·좌·우 한 방향씩만 걷는다(대각선 없음). 장애물·캐릭터끼리의 충돌은 없다.
 * 신랑·신부처럼 `fixed` 인 캐릭터는 단상 위에 서서 움직이지 않는다.
 */

export const WORLD_W = 192;
export const WORLD_H = 176;
/** 캐릭터 가로 반폭 */
export const HALF_W = 8;
export const BOX_H = 24;

/** 걸을 수 있는 영역 — 발 위치 기준. 단상·화단(위) 아래의 잔디밭 전체 */
export const AREA = { x0: HALF_W, x1: WORLD_W - HALF_W, y0: 72, y1: WORLD_H } as const;

export const WALK_SPEED = 24; // px/s
/** 새 하객이 걸어 들어오기 시작하는 발 위치 — 화면 아래 바깥(몸이 막 가려지는 높이) */
const ENTER_Y = WORLD_H + BOX_H;

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

export type Dir = "down" | "up" | "left" | "right";
export const DIRS: readonly Dir[] = ["down", "up", "left", "right"];
export type Mode = "idle" | "walk";

export interface Walker {
  id: string;
  x: number;
  y: number;
  /** 보고 있는(걷는) 방향 */
  dir: Dir;
  mode: Mode;
  /** 현재 행동이 끝나기까지 남은 시간(초) */
  timer: number;
  /** 걷기 프레임용 누적 시간(초) */
  clock: number;
  /** true 면 화면 아래 바깥에서 영역으로 걸어 들어오는 중 */
  entering: boolean;
  /** true 면 움직이지 않는 고정 캐릭터(신랑·신부) */
  fixed: boolean;
}

/** 신랑·신부 같은 고정 캐릭터 — (x, y) 에 앞모습으로 서서 움직이지 않는다 */
export function spawnNpc(id: string, x: number, y: number): Walker {
  return { id, x, y, dir: "down", mode: "idle", timer: 0, clock: 0, entering: false, fixed: true };
}

/** entering=true 면 화면 아래 가장자리 바깥에서 걸어 들어오며 등장, 아니면 영역 안 임의 위치에 서서 시작 */
export function spawnWalker(id: string, rng: Rng, entering: boolean): Walker {
  const x = AREA.x0 + rng() * (AREA.x1 - AREA.x0);
  if (entering) {
    return { id, x, y: ENTER_Y, dir: "up", mode: "walk", timer: 0, clock: 0, entering: true, fixed: false };
  }
  const y = AREA.y0 + rng() * (AREA.y1 - AREA.y0);
  return {
    id,
    x,
    y,
    dir: DIRS[Math.floor(rng() * DIRS.length)],
    mode: "idle",
    timer: 0.2 + rng() * 2,
    clock: rng() * 10,
    entering: false,
    fixed: false,
  };
}

function pickDirExcept(rng: Rng, blocked: Dir): Dir {
  const others = DIRS.filter((d) => d !== blocked);
  return others[Math.floor(rng() * others.length)];
}

/**
 * 한 프레임 진행. 새 객체를 돌려주며 입력 w 는 바꾸지 않는다.
 * frozen=true(말풍선을 보는 중)면 영역 안에서는 멈춘다. 입장 중이면 영역에 닿을 때까지 계속 걷는다.
 */
export function stepWalker(w: Walker, dt: number, rng: Rng, frozen = false): Walker {
  const n: Walker = { ...w, clock: w.clock + dt };

  if (n.fixed) return n;

  if (n.entering) {
    n.y -= WALK_SPEED * dt;
    if (n.y <= AREA.y1) {
      n.y = AREA.y1;
      n.entering = false;
      n.mode = "idle";
      n.timer = 0.5;
    }
    return n;
  }

  if (frozen) {
    n.mode = "idle";
    return n;
  }

  n.timer -= dt;
  if (n.mode === "walk") {
    const d = WALK_SPEED * dt;
    if (n.dir === "left") n.x -= d;
    else if (n.dir === "right") n.x += d;
    else if (n.dir === "up") n.y -= d;
    else n.y += d;
    const outX = n.x < AREA.x0 || n.x > AREA.x1;
    const outY = n.y < AREA.y0 || n.y > AREA.y1;
    if (outX || outY) {
      // 영역 끝에 닿으면 안쪽으로 되돌리고 막힌 방향을 뺀 다른 방향으로 계속 걷는다
      n.x = Math.min(AREA.x1, Math.max(AREA.x0, n.x));
      n.y = Math.min(AREA.y1, Math.max(AREA.y0, n.y));
      n.dir = pickDirExcept(rng, n.dir);
    }
  }

  if (n.timer <= 0) {
    if (n.mode === "walk") {
      n.mode = "idle";
      n.timer = 0.5 + rng() * 1.5;
    } else {
      n.mode = "walk";
      n.dir = DIRS[Math.floor(rng() * DIRS.length)];
      n.timer = 0.6 + rng() * 1.4;
    }
  }
  return n;
}

const WALK_CYCLE = ["walk1", "idle", "walk2", "idle"] as const;

/** 지금 그릴 스프라이트 프레임. 왼쪽은 옆모습을 좌우 반전(flip)해서 그린다. */
export function spriteFor(w: Walker): { frame: FrameName; flip: boolean } {
  const view = w.dir === "left" || w.dir === "right" ? "side" : w.dir;
  const anim = w.mode === "walk" ? WALK_CYCLE[Math.floor(w.clock * 6) % WALK_CYCLE.length] : "idle";
  return { frame: `${view}_${anim}`, flip: w.dir === "left" };
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
