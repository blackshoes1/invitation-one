import { describe, it, expect } from "vitest";
import {
  BOX_H,
  HALF_W,
  JUMP_VY,
  PLATFORMS,
  WALK_SPEED,
  WORLD_W,
  frameFor,
  makeRng,
  pickWalkerAt,
  spawnWalker,
  stepWalker,
  type Walker,
} from "@/lib/villageSim";

const DT = 1 / 30;
const GROUND = PLATFORMS[0].y;
const TIER1 = PLATFORMS[1].y;

function base(over: Partial<Walker> = {}): Walker {
  return {
    id: "t",
    x: 50,
    y: GROUND,
    vx: 0,
    vy: 0,
    facing: 1,
    mode: "idle",
    plat: 0,
    timer: 99,
    clock: 0,
    ...over,
  };
}

describe("makeRng", () => {
  it("같은 시드는 같은 수열, 값은 [0,1)", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("spawnWalker", () => {
  it("땅 스폰은 발판 위(범위 안)에서 시작한다", () => {
    const rng = makeRng(1);
    for (let i = 0; i < 50; i++) {
      const w = spawnWalker(`g${i}`, rng, false);
      const p = PLATFORMS[w.plat];
      expect(w.y).toBe(p.y);
      expect(w.x).toBeGreaterThanOrEqual(p.x0);
      expect(w.x).toBeLessThanOrEqual(p.x1);
    }
  });

  it("하늘 스폰은 화면 위에서 낙하 상태로 시작한다", () => {
    const w = spawnWalker("new", makeRng(2), true);
    expect(w.y).toBeLessThan(0);
    expect(w.plat).toBe(-1);
    expect(w.mode).toBe("fall");
  });
});

describe("stepWalker", () => {
  it("하늘에서 떨어지면 결국 어느 발판 위에 착지한다", () => {
    const rng = makeRng(3);
    let w = spawnWalker("new", rng, true);
    for (let i = 0; i < 300 && w.plat < 0; i++) w = stepWalker(w, DT, rng);
    expect(w.plat).toBeGreaterThanOrEqual(0);
    expect(w.y).toBe(PLATFORMS[w.plat].y);
    expect(w.mode).toBe("idle");
  });

  it("바닥에서 점프하면 머리 위 발판에 올라탄다 (아래에서 통과)", () => {
    const rng = makeRng(4);
    let w = base({ x: 50, y: GROUND, plat: -1, mode: "jump", vy: JUMP_VY, vx: 0 });
    let maxRise = 0;
    for (let i = 0; i < 120 && w.plat < 0; i++) {
      w = stepWalker(w, DT, rng);
      maxRise = Math.max(maxRise, GROUND - w.y);
    }
    expect(maxRise).toBeGreaterThan(32); // 발판 높이 차이보다 높이 뛴다
    expect(w.plat).toBe(1);
    expect(w.y).toBe(TIER1);
  });

  it("점프 최고점이 발판에 못 미치면 제자리 바닥에 착지한다", () => {
    const rng = makeRng(5);
    // 바닥 x=150 위에는 발판(104~176)이 있으므로 낮은 점프로 시험
    let w = base({ x: 150, y: GROUND, plat: -1, mode: "jump", vy: -60, vx: 0 });
    for (let i = 0; i < 120 && w.plat < 0; i++) w = stepWalker(w, DT, rng);
    expect(w.plat).toBe(0);
    expect(w.y).toBe(GROUND);
  });

  it("바닥 끝에서는 항상 방향을 바꾸고 월드 밖으로 나가지 않는다", () => {
    const rng = makeRng(6);
    let w = base({ x: WORLD_W - HALF_W - 0.1, mode: "walk", facing: 1, timer: 99 });
    w = stepWalker(w, 1, rng); // 큰 dt 로 한 번에 벽을 넘긴다
    expect(w.facing).toBe(-1);
    expect(w.x).toBeLessThanOrEqual(WORLD_W - HALF_W);
    expect(w.plat).toBe(0);
  });

  it("frozen 이면 땅에서 걷지 않고 제자리에 선다", () => {
    const rng = makeRng(7);
    const w0 = base({ mode: "walk", facing: 1 });
    const w1 = stepWalker(w0, 1, rng, true);
    expect(w1.x).toBe(w0.x);
    expect(w1.mode).toBe("idle");
  });

  it("frozen 이어도 공중이면 착지까지 계속 떨어진다", () => {
    const rng = makeRng(8);
    let w = base({ y: 60, plat: -1, mode: "fall", vy: 0 });
    for (let i = 0; i < 120 && w.plat < 0; i++) w = stepWalker(w, DT, rng, true);
    expect(w.plat).toBeGreaterThanOrEqual(0);
  });

  it("입력 객체를 바꾸지 않는다 (순수 함수)", () => {
    const rng = makeRng(9);
    const w0 = base({ mode: "walk" });
    const snapshot = JSON.stringify(w0);
    stepWalker(w0, DT, rng);
    expect(JSON.stringify(w0)).toBe(snapshot);
  });

  it("같은 시드면 결과가 같다", () => {
    const run = (seed: number) => {
      const rng = makeRng(seed);
      let w = spawnWalker("a", rng, false);
      for (let i = 0; i < 600; i++) w = stepWalker(w, DT, rng);
      return JSON.stringify(w);
    };
    expect(run(11)).toBe(run(11));
  });

  it("긴 시간 시뮬레이션해도 항상 월드 안·발판 위·유한한 값이다 (100명 × 2분)", () => {
    const rng = makeRng(2026);
    let ws = Array.from({ length: 100 }, (_, i) => spawnWalker(`g${i}`, rng, i % 3 === 0));
    // expect 를 36만 번 부르면 느리므로 위반 사례만 모았다가 마지막에 한 번 검사한다.
    const violations: string[] = [];
    for (let t = 0; t < 120 * 30; t++) {
      ws = ws.map((w) => stepWalker(w, DT, rng));
      for (const w of ws) {
        const bad =
          !Number.isFinite(w.x) ||
          !Number.isFinite(w.y) ||
          w.x < HALF_W - 1e-6 ||
          w.x > WORLD_W - HALF_W + 1e-6 ||
          w.y > GROUND + 1e-6 ||
          (w.plat >= 0 && w.y !== PLATFORMS[w.plat].y) ||
          (w.plat >= 0 && (w.x < PLATFORMS[w.plat].x0 - 1e-6 || w.x > PLATFORMS[w.plat].x1 + 1e-6));
        if (bad && violations.length < 5) violations.push(`t=${t} ${JSON.stringify(w)}`);
      }
    }
    expect(violations).toEqual([]);
    // 2분 뒤에는 하늘에서 시작한 하객도 모두 화면 안으로 내려와 있다
    expect(ws.every((w) => w.y > -BOX_H)).toBe(true);
  });
});

describe("stepWalker — 위층 발판 끝", () => {
  const edge = () =>
    base({ x: PLATFORMS[1].x1 - 0.1, y: PLATFORMS[1].y, plat: 1, mode: "walk", facing: 1, timer: 99 });

  it("rng 가 낮으면 발판 밖으로 걸어 나가 떨어지고, 높으면 돌아선다", () => {
    const off = stepWalker(edge(), 1, () => 0);
    expect(off.plat).toBe(-1);
    expect(off.mode).toBe("fall");
    expect(off.vx).toBe(WALK_SPEED);
    expect(off.vy).toBe(0);

    const back = stepWalker(edge(), 1, () => 0.9);
    expect(back.facing).toBe(-1);
    expect(back.plat).toBe(1);
    expect(back.x).toBeLessThanOrEqual(PLATFORMS[1].x1);
    expect(back.y).toBe(PLATFORMS[1].y);
  });
});

describe("frameFor", () => {
  it("공중이면 jump, 걷는 중이면 걷기 프레임이 번갈아 나온다", () => {
    expect(frameFor(base({ plat: -1, mode: "fall" }))).toBe("jump");
    expect(frameFor(base({ mode: "idle" }))).toBe("idle");
    const seen = new Set<string>();
    for (let c = 0; c < 1; c += 0.05) seen.add(frameFor(base({ mode: "walk", clock: c })));
    expect(seen.has("walk1")).toBe(true);
    expect(seen.has("walk2")).toBe(true);
  });
});

describe("pickWalkerAt — 터치 판정", () => {
  const a = base({ id: "a", x: 50, y: GROUND });
  const b = base({ id: "b", x: 54, y: GROUND + 2 }); // a 와 겹침, 더 아래(앞)

  it("캐릭터 몸통 안을 누르면 그 캐릭터를 돌려준다", () => {
    expect(pickWalkerAt([a], 50, GROUND - 10)?.id).toBe("a");
  });

  it("빈 곳을 누르면 null", () => {
    expect(pickWalkerAt([a], 150, 40)).toBeNull();
  });

  it("겹치면 더 앞(아래)에 그려진 캐릭터가 우선한다", () => {
    expect(pickWalkerAt([a, b], 52, GROUND - 5)?.id).toBe("b");
    expect(pickWalkerAt([b, a], 52, GROUND - 5)?.id).toBe("b");
  });
});
