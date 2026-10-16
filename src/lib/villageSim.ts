import type { FrameName } from "@/lib/pixelSprite";

/**
 * 도트 마당 이동 로직 — 렌더·DOM 과 무관한 순수 함수 모음. (바람의 나라식 탑뷰, 정원 예식장)
 * 좌표는 논리 해상도(384×457, 배경 그림 768×914 의 절반) 기준이고 (x, y) 는 캐릭터의 '발 밑 중앙'이다.
 * 캐릭터는 상·하·좌·우 한 방향씩만 걷는다(대각선 없음). 발 위치로 의자를 피하고 하객과 간격을 둔다.
 * 신랑·신부처럼 `fixed` 인 캐릭터는 단상 위에 서서 움직이지 않는다.
 */

export const WORLD_W = 384;
/** 배경(village-bg.webp) 높이의 절반 — 원본 비율이 바뀌면 scripts/village-art/ingest-bg.mjs 출력에 맞춘다 */
export const WORLD_H = 457;
/** 캐릭터 가로 반폭 */
export const HALF_W = 20;
export const BOX_H = 64;
/** 이동 충돌은 몸 전체가 아니라 바닥에 닿는 발 주변만 검사한다. 몸은 앞쪽 의자를 자연스럽게 가릴 수 있다. */
export const FOOT_HALF_W = 10;
export const FOOT_H = 8;

/**
 * 걸을 수 있는 영역 — 발 위치 기준. 배경을 눈으로 재서 정했다.
 * 위: 단상 계단(논리 y 약 241)보다 조금 아래 — 바로 아래면 앞줄 하객 머리가 신랑·신부 얼굴을 가린다
 * 아래: 키 큰 풀 띠(약 390~) 위 — 풀 속에 서면 발이 묻혀 어색하다
 * 좌: 왼쪽 아래 이름 팻말(x 약 13~70)을 덜 가리게 / 우: 오른쪽 덤불·나무(약 317~)에 묻히지 않게
 * 좌우 의자 구역은 발 주변의 여유까지 고려해 따로 막는다.
 */
export const AREA = { x0: 72, x1: 304, y0: 258, y1: 388 } as const;

/** 배경 그림의 좌우 의자 진열 구역 — 논리 좌표 기준. */
export const CHAIR_AREAS = [
  { x0: 34, x1: 128, y0: 232, y1: 298 },
  { x0: 236, x1: 326, y0: 232, y1: 298 },
] as const;

export const WALK_SPEED = 28; // px/s — 정원을 여유롭게 산책하는 속도
const SPACE_X = 28;
const SPACE_Y = 24;
const MIN_SPACE_SQ = 0.75 ** 2; // 발 주변은 비워 두되 원근감에 따른 몸의 겹침은 허용한다.
const SPAWN_CANDIDATES = 48;
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

/** 발 위치 간격 — 상하로 서 있는 원근감은 살리면서 얼굴이 한곳에 겹치는 것을 줄인다. */
function nearestSpace(x: number, y: number, neighbors: readonly Walker[], id: string): number {
  let gap = Infinity;
  for (const other of neighbors) {
    if (other.id === id) continue;
    const dx = (x - other.x) / SPACE_X;
    const dy = (y - other.y) / SPACE_Y;
    gap = Math.min(gap, dx * dx + dy * dy);
  }
  return gap;
}

/** 의자를 피한 후보 중 기존 하객과 가장 떨어진 곳에서 시작한다. 입장 중인 하객은 도착 지점으로 비교한다. */
export function spawnWalker(id: string, rng: Rng, entering: boolean, neighbors: readonly Walker[] = []): Walker {
  let x = AREA.x0 + rng() * (AREA.x1 - AREA.x0);
  const minY = CHAIR_AREAS.reduce<number>((min, chair) =>
    x + FOOT_HALF_W > chair.x0 && x - FOOT_HALF_W < chair.x1
      ? Math.max(min, chair.y1 + FOOT_H)
      : min, AREA.y0);
  let y = minY + rng() * (AREA.y1 - minY);
  const nearby = neighbors.map(w => w.entering ? { ...w, y: AREA.y1 } : w);
  let bestGap = -1;
  for (let i = 0; i < SPAWN_CANDIDATES; i++) {
    const cx = AREA.x0 + rng() * (AREA.x1 - AREA.x0);
    const cy = entering ? AREA.y1 : AREA.y0 + rng() * (AREA.y1 - AREA.y0);
    if (CHAIR_AREAS.some(chair => cx + FOOT_HALF_W > chair.x0 && cx - FOOT_HALF_W < chair.x1 &&
      cy > chair.y0 && cy - FOOT_H < chair.y1)) continue;
    const gap = nearestSpace(cx, cy, nearby, id);
    if (gap > bestGap) {
      x = cx;
      y = cy;
      bestGap = gap;
    }
  }
  if (entering) {
    return { id, x, y: ENTER_Y, dir: "up", mode: "walk", timer: 0, clock: 0, entering: true, fixed: false };
  }
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

/** 한 방향 이동을 영역·의자·가까운 하객에 처음 닿는 위치까지로 제한한다. */
function advance(w: Walker, dir: Dir, distance: number, neighbors: readonly Walker[]) {
  let x = w.x;
  let y = w.y;
  if (dir === "left") x -= distance;
  else if (dir === "right") x += distance;
  else if (dir === "up") y -= distance;
  else y += distance;
  let blocked = x < AREA.x0 || x > AREA.x1 || y < AREA.y0 || y > AREA.y1;
  x = Math.min(AREA.x1, Math.max(AREA.x0, x));
  y = Math.min(AREA.y1, Math.max(AREA.y0, y));
  for (const chair of CHAIR_AREAS) {
    const left = chair.x0 - FOOT_HALF_W;
    const right = chair.x1 + FOOT_HALF_W;
    const top = chair.y0;
    const bottom = chair.y1 + FOOT_H;
    if (y > top && y < bottom) {
      if (w.x <= left && x > left) {
        x = left;
        blocked = true;
      } else if (w.x >= right && x < right) {
        x = right;
        blocked = true;
      }
    }
    if (x > left && x < right) {
      if (w.y <= top && y > top) {
        y = top;
        blocked = true;
      } else if (w.y >= bottom && y < bottom) {
        y = bottom;
        blocked = true;
      }
    }
  }
  if (neighbors.length > 0 && (x !== w.x || y !== w.y)) {
    const gap = nearestSpace(x, y, neighbors, w.id);
    if (gap < MIN_SPACE_SQ && gap < nearestSpace(w.x, w.y, neighbors, w.id)) {
      return { x: w.x, y: w.y, blocked: true };
    }
  }
  return { x, y, blocked };
}

/** 막힌 쪽을 매 프레임 다시 고르지 않도록, 앞으로 충분히 걸을 수 있는 방향을 미리 살핀다. */
function planWalk(w: Walker, rng: Rng, neighbors: readonly Walker[]): { dir: Dir; distance: number } | null {
  const candidates = DIRS.map(dir => {
    let probe = w;
    let distance = 0;
    for (let i = 0; i < 16; i++) {
      const next = advance(probe, dir, 6, neighbors);
      distance += Math.abs(next.x - probe.x) + Math.abs(next.y - probe.y);
      if (next.blocked) break;
      probe = { ...probe, x: next.x, y: next.y };
    }
    return { dir, distance };
  }).filter(candidate => candidate.distance >= 12);
  let choice: (typeof candidates)[number] | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = candidate.distance * (0.65 + rng() * 0.35);
    if (score > bestScore) {
      choice = candidate;
      bestScore = score;
    }
  }
  return choice && { dir: choice.dir, distance: Math.min(choice.distance, 36 + rng() * 48) };
}

/**
 * 한 프레임 진행. 새 객체를 돌려주며 입력 w 는 바꾸지 않는다.
 * frozen=true(말풍선을 보는 중)면 영역 안에서는 멈춘다. 입장 중이면 영역에 닿을 때까지 계속 걷는다.
 */
export function stepWalker(w: Walker, dt: number, rng: Rng, frozen = false, neighbors: readonly Walker[] = []): Walker {
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
    const next = advance(w, n.dir, WALK_SPEED * dt, neighbors);
    n.x = next.x;
    n.y = next.y;
    if (next.blocked) {
      // 움직일 수 없으면 걷기 애니메이션도 멈추고 양보한다. 제자리에서 방향을 연달아 바꾸지 않는다.
      n.mode = "idle";
      n.timer = 0.9 + rng() * 1.2;
      return n;
    }
  }

  if (n.timer <= 0) {
    if (n.mode === "walk") {
      n.mode = "idle";
      n.timer = 1.4 + rng() * 2.4;
    } else {
      const plan = planWalk(n, rng, neighbors);
      if (plan) {
        n.mode = "walk";
        n.dir = plan.dir;
        n.timer = plan.distance / WALK_SPEED;
      } else {
        n.timer = 0.9 + rng() * 1.2;
      }
    }
  }
  return n;
}

const WALK_CYCLE = ["walk1", "idle", "walk2", "idle"] as const;

/** 지금 그릴 스프라이트 프레임. 방향마다 시트에 따로 그려져 있어 반전이 필요 없다. */
export function spriteFor(w: Walker): { frame: FrameName } {
  const anim = w.mode === "walk" ? WALK_CYCLE[Math.floor(w.clock * 4) % WALK_CYCLE.length] : "idle";
  return { frame: `${w.dir}_${anim}` };
}

/** 논리 좌표 (px, py) 를 누른 캐릭터 중 가장 앞(아래)에 그려진 것. 터치 여유 pad 포함. */
export function pickWalkerAt(
  walkers: Iterable<Walker>,
  px: number,
  py: number,
  pad = 6
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
