import { describe, it, expect } from "vitest";
import {
  AREA,
  BOX_H,
  DIRS,
  HALF_W,
  WALK_SPEED,
  WORLD_H,
  WORLD_W,
  makeRng,
  pickWalkerAt,
  spawnNpc,
  spawnWalker,
  spriteFor,
  stepWalker,
  type Walker,
} from "@/lib/villageSim";

const DT = 1 / 30;

function base(over: Partial<Walker> = {}): Walker {
  return {
    id: "t",
    x: 192,
    y: 300,
    dir: "right",
    mode: "idle",
    timer: 99,
    clock: 0,
    entering: false,
    fixed: false,
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
  it("영역 스폰은 걷는 영역 안에서 서 있는 상태로 시작한다", () => {
    const rng = makeRng(1);
    for (let i = 0; i < 100; i++) {
      const w = spawnWalker(`g${i}`, rng, false);
      expect(w.x).toBeGreaterThanOrEqual(AREA.x0);
      expect(w.x).toBeLessThanOrEqual(AREA.x1);
      expect(w.y).toBeGreaterThanOrEqual(AREA.y0);
      expect(w.y).toBeLessThanOrEqual(AREA.y1);
      expect(w.entering).toBe(false);
      expect(w.mode).toBe("idle");
    }
  });

  it("입장 스폰은 화면 아래 바깥에서 위쪽으로 걸어 들어오는 상태로 시작한다", () => {
    const w = spawnWalker("new", makeRng(2), true);
    expect(w.y).toBeGreaterThan(WORLD_H);
    expect(w.entering).toBe(true);
    expect(w.dir).toBe("up");
    expect(w.mode).toBe("walk");
  });
});

describe("세계 크기와 걷는 영역", () => {
  it("세계는 배경 그림(768×914)의 절반인 384×457 이다", () => {
    expect(WORLD_W).toBe(384);
    expect(WORLD_H).toBe(457);
  });

  it("걷는 영역은 단상 계단 아래 잔디·길이고 아래 키 큰 풀 띠 위에서 끝난다", () => {
    expect(AREA).toEqual({ x0: 72, x1: 304, y0: 258, y1: 388 });
    expect(AREA.x0).toBeLessThan(AREA.x1);
    expect(AREA.y0).toBeLessThan(AREA.y1);
    expect(AREA.y0).toBeGreaterThanOrEqual(230); // 단상·계단(논리 y 약 241 까지)에 올라서지 않는다
    expect(AREA.y1).toBeLessThanOrEqual(WORLD_H);
    expect(AREA.x0).toBeGreaterThanOrEqual(HALF_W);
    expect(AREA.x1).toBeLessThanOrEqual(WORLD_W - HALF_W);
  });
});

describe("spawnNpc / fixed — 신랑·신부", () => {
  it("고정 캐릭터는 주어진 자리에 앞모습으로 선다", () => {
    const w = spawnNpc("npc-groom", 162, 222);
    expect(w).toMatchObject({ id: "npc-groom", x: 162, y: 222, dir: "down", mode: "idle", entering: false, fixed: true });
  });

  it("고정 캐릭터는 시간이 흘러도(timer 가 0 이하여도) 위치·방향·상태가 변하지 않는다", () => {
    const rng = makeRng(21);
    let w = spawnNpc("npc-bride", 202, 222);
    w = { ...w, timer: -5 }; // 일반 캐릭터라면 곧바로 걷기를 시작했을 상황
    for (let i = 0; i < 600; i++) w = stepWalker(w, DT, rng); // frozen 없이 20초
    expect(w).toMatchObject({ x: 202, y: 222, dir: "down", mode: "idle", fixed: true });
  });

  it("같은 조건의 일반 캐릭터는 걷는다 — 위 테스트가 공허하지 않다는 대조군", () => {
    const rng = makeRng(21);
    let w = base({ x: 202, y: 300, dir: "down", mode: "idle", timer: -5 });
    let moved = false;
    for (let i = 0; i < 600; i++) {
      const next = stepWalker(w, DT, rng);
      if (next.x !== w.x || next.y !== w.y) moved = true;
      w = next;
    }
    expect(moved).toBe(true);
  });

  it("frozen 이어도 고정 캐릭터의 상태는 그대로다", () => {
    const rng = makeRng(23);
    const w0 = spawnNpc("npc-groom", 162, 222);
    const w1 = stepWalker(w0, 1, rng, true);
    expect(w1).toMatchObject({ x: 162, y: 222, dir: "down", mode: "idle", fixed: true });
  });

  it("고정 캐릭터가 있어도 하객은 그대로 걷고, 일반 스폰은 fixed 가 아니다", () => {
    const rng = makeRng(22);
    expect(spawnWalker("g", rng, false).fixed).toBe(false);
    expect(spawnWalker("g", rng, true).fixed).toBe(false);
    const w0 = base({ mode: "walk", dir: "right" });
    expect(stepWalker(w0, 0.5, rng).x).toBeGreaterThan(w0.x);
  });

  it("고정 캐릭터도 터치로 집을 수 있다", () => {
    const npc = spawnNpc("npc-groom", 162, 222);
    expect(pickWalkerAt([npc], 162, 222 - BOX_H / 2)?.id).toBe("npc-groom");
  });
});

describe("stepWalker — 입장", () => {
  it("입장하면 결국 영역 아래 끝에 닿아 일반 상태로 바뀐다", () => {
    const rng = makeRng(3);
    let w = spawnWalker("new", rng, true);
    for (let i = 0; i < 300 && w.entering; i++) w = stepWalker(w, DT, rng);
    expect(w.entering).toBe(false);
    expect(w.y).toBe(AREA.y1);
    expect(w.mode).toBe("idle");
  });

  it("frozen 이어도 입장 중이면 영역에 닿을 때까지 계속 걷는다", () => {
    const rng = makeRng(4);
    let w = spawnWalker("new", rng, true);
    const y0 = w.y;
    w = stepWalker(w, DT, rng, true);
    expect(w.y).toBeLessThan(y0);
    for (let i = 0; i < 300 && w.entering; i++) w = stepWalker(w, DT, rng, true);
    expect(w.entering).toBe(false);
  });
});

describe("stepWalker — 걷기", () => {
  it("걷는 동안 방향대로 한 축만 움직인다", () => {
    const rng = makeRng(5);
    const cases = [
      { dir: "right", axis: "x", sign: 1 },
      { dir: "left", axis: "x", sign: -1 },
      { dir: "down", axis: "y", sign: 1 },
      { dir: "up", axis: "y", sign: -1 },
    ] as const;
    for (const c of cases) {
      const w0 = base({ mode: "walk", dir: c.dir });
      const w1 = stepWalker(w0, 0.5, rng);
      const dx = w1.x - w0.x;
      const dy = w1.y - w0.y;
      expect(c.axis === "x" ? dy : dx).toBe(0);
      expect(c.axis === "x" ? dx : dy).toBeCloseTo(c.sign * WALK_SPEED * 0.5, 9);
    }
  });

  it("오른쪽 끝에 닿으면 영역 안으로 되돌리고 다른 방향으로 바꾼다", () => {
    const rng = makeRng(6);
    const w = stepWalker(base({ x: AREA.x1 - 0.1, mode: "walk", dir: "right" }), 1, rng);
    expect(w.x).toBe(AREA.x1);
    expect(w.dir).not.toBe("right");
  });

  it("네 모서리·가장자리에서 모두 영역 안에 머물고 막힌 방향을 피한다", () => {
    const rng = makeRng(7);
    const edges = [
      { x: AREA.x0 + 0.1, y: 300, dir: "left" },
      { x: 192, y: AREA.y0 + 0.1, dir: "up" },
      { x: 192, y: AREA.y1 - 0.1, dir: "down" },
    ] as const;
    for (const e of edges) {
      const w = stepWalker(base({ x: e.x, y: e.y, mode: "walk", dir: e.dir }), 1, rng);
      expect(w.x).toBeGreaterThanOrEqual(AREA.x0);
      expect(w.y).toBeGreaterThanOrEqual(AREA.y0);
      expect(w.y).toBeLessThanOrEqual(AREA.y1);
      expect(w.dir).not.toBe(e.dir);
    }
  });

  it("frozen 이면 영역 안에서 걷지 않고 제자리에 선다", () => {
    const rng = makeRng(8);
    const w0 = base({ mode: "walk", dir: "right" });
    const w1 = stepWalker(w0, 1, rng, true);
    expect(w1.x).toBe(w0.x);
    expect(w1.y).toBe(w0.y);
    expect(w1.mode).toBe("idle");
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

  it("긴 시간 시뮬레이션해도 항상 영역 안이고, 한 프레임에 한 축만 변하며, 실제로 걷는다 (100명 × 2분)", () => {
    const rng = makeRng(2026);
    let ws = Array.from({ length: 100 }, (_, i) => spawnWalker(`g${i}`, rng, i % 3 === 0));
    // expect 를 36만 번 부르면 느리므로 위반 사례만 모았다가 마지막에 한 번 검사한다.
    const violations: string[] = [];
    let moved = 0;
    const dirsSeen = new Set<string>();
    for (let t = 0; t < 120 * 30; t++) {
      const next = ws.map((w) => stepWalker(w, DT, rng));
      for (let i = 0; i < next.length; i++) {
        const a = ws[i];
        const b = next[i];
        if (b.entering === false && a.entering === false) {
          const dx = Math.abs(b.x - a.x);
          const dy = Math.abs(b.y - a.y);
          // 영역 끝에서 안쪽으로 되돌릴 때를 빼면 한 축만 변해야 한다
          if (dx > 1e-9 && dy > 1e-9) violations.push(`diag t=${t} ${JSON.stringify(b)}`);
          if (dx > 1e-9 || dy > 1e-9) moved++;
          if (b.mode === "walk") dirsSeen.add(b.dir);
        }
        const bad =
          !Number.isFinite(b.x) ||
          !Number.isFinite(b.y) ||
          (!b.entering &&
            (b.x < AREA.x0 - 1e-6 || b.x > AREA.x1 + 1e-6 || b.y < AREA.y0 - 1e-6 || b.y > AREA.y1 + 1e-6));
        if (bad) violations.push(`out t=${t} ${JSON.stringify(b)}`);
      }
      ws = next;
      if (violations.length >= 5) break;
    }
    expect(violations.slice(0, 5)).toEqual([]);
    expect(moved).toBeGreaterThan(10000); // 걷기가 실제로 일어났다
    expect(dirsSeen).toEqual(new Set(DIRS)); // 네 방향 모두 쓰였다
    expect(ws.every((w) => !w.entering)).toBe(true); // 입장도 모두 끝났다
  });
});

describe("spriteFor", () => {
  it("방향마다 앞·뒤·왼쪽·오른쪽 프레임이 따로 나온다 (반전 없음)", () => {
    expect(spriteFor(base({ dir: "down" }))).toEqual({ frame: "down_idle" });
    expect(spriteFor(base({ dir: "up" }))).toEqual({ frame: "up_idle" });
    expect(spriteFor(base({ dir: "left" }))).toEqual({ frame: "left_idle" });
    expect(spriteFor(base({ dir: "right" }))).toEqual({ frame: "right_idle" });
  });

  it("왼쪽·오른쪽으로 걸으면 각자의 걷기 프레임이 나온다", () => {
    expect(spriteFor(base({ dir: "left", mode: "walk", clock: 0 })).frame).toBe("left_walk1");
    expect(spriteFor(base({ dir: "right", mode: "walk", clock: 0 })).frame).toBe("right_walk1");
  });

  it("걷는 중이면 걷기 프레임이 번갈아 나온다", () => {
    const seen = new Set<string>();
    for (let c = 0; c < 1; c += 0.05) seen.add(spriteFor(base({ mode: "walk", dir: "down", clock: c })).frame);
    expect(seen.has("down_walk1")).toBe(true);
    expect(seen.has("down_walk2")).toBe(true);
    expect(seen.has("down_idle")).toBe(true);
  });
});

describe("pickWalkerAt — 터치 판정", () => {
  const a = base({ id: "a", x: 100, y: 200 });
  const b = base({ id: "b", x: 108, y: 204 }); // a 와 겹침, 더 아래(앞)

  it("캐릭터 몸통 안을 누르면 그 캐릭터를 돌려준다", () => {
    expect(pickWalkerAt([a], 100, 200 - BOX_H / 2)?.id).toBe("a");
  });

  it("빈 곳을 누르면 null", () => {
    expect(pickWalkerAt([a], 300, 80)).toBeNull();
  });

  it("겹치면 더 앞(아래)에 그려진 캐릭터가 우선한다", () => {
    expect(pickWalkerAt([a, b], 104, 190)?.id).toBe("b");
    expect(pickWalkerAt([b, a], 104, 190)?.id).toBe("b");
  });

  it("몸통 좌우 끝 + 여유(pad) 밖은 누르지 않은 것으로 본다", () => {
    expect(pickWalkerAt([a], 100 + HALF_W + 6 + 0.5, 180)).toBeNull();
    expect(pickWalkerAt([a], 100 + HALF_W + 5, 180)?.id).toBe("a");
  });
});
