# 방명록 '도트 마을' Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방명록에 `🏘️ 마을` 탭을 추가해, 글을 남긴 하객 1명 = 도트 캐릭터 1명이 메이플스토리 마을처럼 발판 위를 걷고 점프하며, 누르면 축하 메시지 말풍선이 뜨게 한다.

**Architecture:** Canvas 2D 한 장에 모든 캐릭터를 `requestAnimationFrame` 으로 그린다. 그림 데이터(`pixelSprite.ts`)와 이동 로직(`villageSim.ts`)은 DOM 과 무관한 순수 모듈로 분리해 vitest 로 검증하고, `PixelVillage.tsx` 는 렌더·터치·절전만 맡는다. `Guestbook.tsx` 는 이미 불러온 `celebrations`(→ `buildFeed`)를 그대로 넘기므로 DB·API 변경은 없다.

**Tech Stack:** Next.js 16.3.3 (App Router, 클라이언트 컴포넌트), React 19.2, TypeScript strict, Tailwind v4, vitest 3 (node 환경, `@` 별칭), Canvas 2D API. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-06-guestbook-pixel-village-design.md`

## Global Constraints

- **Next.js 16 은 학습 데이터와 다르다** (`AGENTS.md`): 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 관련 가이드를 읽고, 폐기 예고를 따른다.
- 논리 해상도 **192×128**, 캐릭터 **16×24**, Canvas 2D, `imageSmoothingEnabled = false` 로 도트를 선명하게 유지한다.
- 외부 이미지 파일·새 npm 의존성·DB/API 변경 **없음**. 메이플스토리 원본 이미지 사용 **금지**(저작권) — 도트는 전부 코드로 만든 오리지널.
- 마을은 **공개 필드만** 쓴다: `id`, `name`(이미 마스킹된 공개 이름), `kind`, `message`, `review`. 관리자 전용 `realNames` 는 마을에 쓰지 않는다.
- 표시 대상은 `buildFeed(celebrations)` 결과와 같다(마음배송 또는 별점 있는 직접배달). 표시 인원 상한은 두지 않는다.
- 말풍선: 캐릭터 터치 시 `name` + 메시지, **3줄 초과 시 말줄임**, **4초** 뒤 또는 다른 곳을 누르면 닫힘. 말풍선을 보는 캐릭터는 땅에서 잠시 멈춘다.
- 절전: 캔버스가 화면 밖(IntersectionObserver)이거나 `document.hidden` 이면 루프 정지. 프레임 `dt` 상한 **50ms**. 마을 탭이 아니면 컴포넌트가 언마운트되어 루프도 멈춘다.
- `prefers-reduced-motion` 이 켜져 있으면 가만히 서 있는 정지 화면만 그린다(터치·말풍선은 동작).
- 캔버스 컨텍스트 생성 실패 시 `마을을 불러오지 못했어요` 를 보여 준다. 메시지 탭은 영향 없다.
- 캔버스에 `role="img"` 와 `축하해 주신 N명의 도트 마을` 로 시작하는 `aria-label` 을 둔다.
- 테스트는 `tests/unit/**/*.test.ts` (vitest, node 환경, `@` → `src`). 외부 서비스에 접근하지 않는 순수 로직만 테스트한다. 렌더·터치는 브라우저 미리보기로 확인한다.
- 코드 주석은 한국어, 기존 파일처럼 "왜" 를 짧게 쓴다. 커밋은 `feat(guestbook): …` 형식의 한국어 메시지 + 아래 트레일러.

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

## File Structure

| 파일 | 구분 | 책임 |
|---|---|---|
| `src/lib/pixelSprite.ts` | 신규 | 16×24 도트 프레임 데이터, id 해시 → 외형(머리·옷·모자), 색 격자 생성, 오프스크린 캔버스 굽기 |
| `src/lib/villageSim.ts` | 신규 | 발판·상태 머신·충돌·터치 판정 (순수 함수, 렌더 무관) |
| `src/components/sections/PixelVillage.tsx` | 신규 | 캔버스 렌더, 말풍선·이름표, 터치, 절전 처리 |
| `src/components/sections/Guestbook.tsx` | 수정 | `ViewMode` 에 `"village"`, 토글 버튼 1개, 마을 탭 렌더 |
| `tests/unit/pixelSprite.test.ts` | 신규 | 스프라이트 데이터·외형·색 입히기 테스트 |
| `tests/unit/villageSim.test.ts` | 신규 | 이동 로직 테스트 |
| `src/app/village-preview/page.tsx` | **임시(커밋 금지)** | Supabase 없이 마을을 눈으로 확인하는 샘플 페이지 |

경계: `pixelSprite.ts` 는 `villageSim.ts` 의 타입(`FrameName`)만 공급하고, `villageSim.ts` 는 `pixelSprite.ts` 를 **type import 만** 한다(런타임 의존 없음). 나중에 스프라이트를 PNG 시트로 바꿔도 `villageSim.ts` 는 손대지 않는다.

---

### Task 1: 도트 스프라이트 데이터 (`pixelSprite.ts`)

**Files:**
- Create: `src/lib/pixelSprite.ts`
- Test: `tests/unit/pixelSprite.test.ts`
- Docs(커밋에 포함): `docs/superpowers/specs/2026-10-06-guestbook-pixel-village-design.md`, `docs/superpowers/plans/2026-10-06-guestbook-pixel-village.md`

**Interfaces:**
- Produces (Task 2·3 이 사용):
  - `SPRITE_W = 16`, `SPRITE_H = 24`
  - `type FrameName = "idle" | "walk1" | "walk2" | "jump"`, `FRAME_NAMES: readonly FrameName[]`
  - `FRAME_ROWS: Record<FrameName, string[]>` (24줄 × 16글자)
  - `type Hat = 0 | 1 | 2`, `interface Look { hair: string; cloth: string; hat: Hat; hatColor: string }`
  - `hashId(id: string): number`, `lookFromId(id: string): Look`
  - `buildFrameGrid(frame: FrameName, look: Look): (string | null)[][]`
  - `bakeFrame(grid): HTMLCanvasElement`, `bakeSprites(look: Look): Record<FrameName, HTMLCanvasElement>` (브라우저 전용)

- [ ] **Step 1: 작업 브랜치를 만들고 Next 16 문서를 훑는다**

```bash
git switch -c feat/guestbook-pixel-village
ls node_modules/next/dist/docs/01-app
```

클라이언트 컴포넌트(`"use client"`)·`useEffect` 관련 가이드를 `node_modules/next/dist/docs/01-app/` 아래에서 찾아 읽는다. 이 계획은 이미 `"use client"` 인 `Guestbook.tsx` 안에서만 쓰이는 클라이언트 컴포넌트를 추가하므로 큰 변경은 없을 것이다. 폐기 예고나 달라진 규칙을 발견하면 이 계획의 해당 코드를 그에 맞게 고치고 사용자에게 알린다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/unit/pixelSprite.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FRAME_NAMES,
  FRAME_ROWS,
  SPRITE_H,
  SPRITE_W,
  buildFrameGrid,
  hashId,
  lookFromId,
} from "@/lib/pixelSprite";

describe("도트 스프라이트 데이터", () => {
  it("모든 프레임이 16×24 이고 허용된 글자만 쓴다", () => {
    for (const f of FRAME_NAMES) {
      const rows = FRAME_ROWS[f];
      expect(rows).toHaveLength(SPRITE_H);
      for (const r of rows) {
        expect(r).toHaveLength(SPRITE_W);
        expect(r).toMatch(/^[.osehcpb]+$/); // 모자(a)·꽃(f)은 덮어쓰기 조각으로만 들어간다
      }
    }
  });

  it("프레임마다 모양이 달라 애니메이션이 된다", () => {
    const joined = (f: (typeof FRAME_NAMES)[number]) => FRAME_ROWS[f].join("");
    expect(joined("idle")).not.toBe(joined("walk1"));
    expect(joined("walk1")).not.toBe(joined("walk2"));
    expect(joined("idle")).not.toBe(joined("jump"));
  });
});

describe("lookFromId — 하객 id → 외형", () => {
  it("같은 id 는 항상 같은 외형이다", () => {
    expect(lookFromId("guest-1")).toEqual(lookFromId("guest-1"));
    expect(hashId("guest-1")).toBe(hashId("guest-1"));
  });

  it("id 가 다르면 외형이 다양하게 나온다 (머리·옷·모자 종류)", () => {
    const looks = Array.from({ length: 200 }, (_, i) => lookFromId(`id-${i}`));
    expect(new Set(looks.map((l) => l.hair)).size).toBeGreaterThan(3);
    expect(new Set(looks.map((l) => l.cloth)).size).toBeGreaterThan(3);
    expect(new Set(looks.map((l) => l.hat))).toEqual(new Set([0, 1, 2]));
  });
});

describe("buildFrameGrid — 색 입히기", () => {
  const look = { hair: "#112233", cloth: "#445566", hat: 0 as const, hatColor: "#778899" };

  it("투명은 null, 머리·옷 칸에는 외형 색이 들어간다", () => {
    const g = buildFrameGrid("idle", look);
    expect(g).toHaveLength(SPRITE_H);
    expect(g[0][0]).toBeNull();
    const flat = g.flat();
    expect(flat).toContain("#112233");
    expect(flat).toContain("#445566");
    expect(flat).not.toContain("#778899"); // 모자 없음
  });

  it("야구모자(1)는 모자색을, 꽃(2)은 꽃색을 칠한다", () => {
    const cap = buildFrameGrid("idle", { ...look, hat: 1 }).flat();
    expect(cap).toContain("#778899");
    const flower = buildFrameGrid("idle", { ...look, hat: 2 }).flat();
    expect(flower).toContain("#f08aa5");
  });

  it("모든 프레임에 칠할 글자가 빠짐없이 색으로 바뀐다 (undefined 없음)", () => {
    for (const f of FRAME_NAMES) {
      for (const hat of [0, 1, 2] as const) {
        const cells = buildFrameGrid(f, { ...look, hat }).flat();
        expect(cells.every((c) => c === null || /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/unit/pixelSprite.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/pixelSprite"` (모듈이 아직 없음)

- [ ] **Step 4: 구현을 쓴다**

`src/lib/pixelSprite.ts`:

```ts
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
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/unit/pixelSprite.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 6: 설계·계획 문서와 함께 커밋한다**

```bash
git add docs/superpowers/specs/2026-10-06-guestbook-pixel-village-design.md docs/superpowers/plans/2026-10-06-guestbook-pixel-village.md src/lib/pixelSprite.ts tests/unit/pixelSprite.test.ts
git commit -m "feat(guestbook): 도트 마을 — 캐릭터 스프라이트·외형 생성" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 이동 로직 (`villageSim.ts`)

**Files:**
- Create: `src/lib/villageSim.ts`
- Test: `tests/unit/villageSim.test.ts`

**Interfaces:**
- Consumes: `type FrameName` from `@/lib/pixelSprite` (type import 만)
- Produces (Task 3 이 사용):
  - 상수: `WORLD_W = 192`, `WORLD_H = 128`, `HALF_W = 8`, `BOX_H = 24`, `WALK_SPEED`, `GRAVITY`, `JUMP_VY`, `JUMP_VX`
  - `interface Platform { x0: number; x1: number; y: number }`, `PLATFORMS: readonly Platform[]` (0번 = 바닥)
  - `type Rng = () => number`, `makeRng(seed: number): Rng`
  - `type Mode = "idle" | "walk" | "jump" | "fall"`
  - `interface Walker { id: string; x: number; y: number; vx: number; vy: number; facing: 1 | -1; mode: Mode; plat: number; timer: number; clock: number }` — `(x, y)` 는 발 밑 중앙, `plat = -1` 이면 공중
  - `spawnWalker(id: string, rng: Rng, fromSky: boolean): Walker`
  - `stepWalker(w: Walker, dt: number, rng: Rng, frozen?: boolean): Walker` (입력을 바꾸지 않고 새 객체 반환)
  - `frameFor(w: Walker): FrameName`
  - `pickWalkerAt(walkers: Iterable<Walker>, px: number, py: number, pad?: number): Walker | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/villageSim.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BOX_H,
  HALF_W,
  JUMP_VY,
  PLATFORMS,
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
          (w.plat >= 0 && w.y !== PLATFORMS[w.plat].y);
        if (bad && violations.length < 5) violations.push(`t=${t} ${JSON.stringify(w)}`);
      }
    }
    expect(violations).toEqual([]);
    // 2분 뒤에는 하늘에서 시작한 하객도 모두 화면 안으로 내려와 있다
    expect(ws.every((w) => w.y > -BOX_H)).toBe(true);
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/unit/villageSim.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/villageSim"`

- [ ] **Step 3: 구현을 쓴다**

`src/lib/villageSim.ts`:

```ts
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
```

- [ ] **Step 4: 전체 단위 테스트가 통과하는지 확인한다**

Run: `npm test`
Expected: PASS — 기존 테스트 + `villageSim` 16 tests + `pixelSprite` 7 tests 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/villageSim.ts tests/unit/villageSim.test.ts
git commit -m "feat(guestbook): 도트 마을 — 발판·점프·낙하 이동 로직" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 마을 캔버스 컴포넌트 (`PixelVillage.tsx`)

**Files:**
- Create: `src/components/sections/PixelVillage.tsx`
- Create(임시, 커밋 금지): `src/app/village-preview/page.tsx`

**Interfaces:**
- Consumes:
  - from `@/lib/pixelSprite`: `SPRITE_W`, `SPRITE_H`, `bakeSprites`, `lookFromId`, `type FrameName`
  - from `@/lib/villageSim`: `PLATFORMS`, `WORLD_W`, `WORLD_H`, `frameFor`, `makeRng`, `pickWalkerAt`, `spawnWalker`, `stepWalker`, `type Rng`, `type Walker`
  - from `@/lib/supabase`: `type Celebration`
- Produces (Task 4 가 사용): `default export function PixelVillage({ items, highlightId }: { items: Celebration[]; highlightId?: string | null })`

- [ ] **Step 1: 컴포넌트를 쓴다**

`src/components/sections/PixelVillage.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Celebration } from "@/lib/supabase";
import {
  SPRITE_H,
  SPRITE_W,
  bakeSprites,
  lookFromId,
  type FrameName,
} from "@/lib/pixelSprite";
import {
  PLATFORMS,
  WORLD_H,
  WORLD_W,
  frameFor,
  makeRng,
  pickWalkerAt,
  spawnWalker,
  stepWalker,
  type Rng,
  type Walker,
} from "@/lib/villageSim";

const BUBBLE_MS = 4000;
/** 탭 복귀 직후 순간이동을 막는 프레임 시간 상한(초) */
const MAX_DT = 0.05;
const TAG_MAX_CHARS = 7;
const BUBBLE_MAX_W = 104;
const BUBBLE_MAX_LINES = 3;
const FONT = "7px sans-serif";
const CLOUDS: ReadonlyArray<readonly [number, number, number]> = [
  [18, 14, 24],
  [104, 26, 30],
  [150, 10, 20],
];

type Sprites = Record<FrameName, HTMLCanvasElement>;

interface Bubble {
  id: string;
  /** performance.now() 기준 만료 시각 */
  until: number;
}

interface Info {
  name: string;
  text: string;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clipName(name: string): string {
  const chars = Array.from(name);
  return chars.length > TAG_MAX_CHARS ? chars.slice(0, TAG_MAX_CHARS).join("") + "…" : name;
}

function drawScene(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#cfe9f5";
  ctx.fillRect(0, 0, WORLD_W, Math.round(WORLD_H * 0.55));
  ctx.fillStyle = "#e3f2ef";
  ctx.fillRect(0, Math.round(WORLD_H * 0.55), WORLD_W, WORLD_H);

  ctx.fillStyle = "#ffffff";
  for (const [x, y, w] of CLOUDS) {
    ctx.fillRect(x, y, w, 4);
    ctx.fillRect(x + 4, y - 3, w - 8, 4);
  }

  PLATFORMS.forEach((p, i) => {
    // 바닥은 화면 폭 전체, 위쪽 발판은 캐릭터 반폭만큼 양옆으로 넓게 그린다
    const x0 = i === 0 ? 0 : p.x0 - 6;
    const x1 = i === 0 ? WORLD_W : p.x1 + 6;
    const bottom = i === 0 ? WORLD_H : p.y + 5;
    ctx.fillStyle = "#a9855a";
    ctx.fillRect(x0, p.y, x1 - x0, bottom - p.y);
    ctx.fillStyle = "#788c63";
    ctx.fillRect(x0, p.y, x1 - x0, 3);
    ctx.fillStyle = "#94a67f";
    ctx.fillRect(x0, p.y, x1 - x0, 1);
  });
}

function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, sprite: HTMLCanvasElement): void {
  const dx = Math.round(w.x - SPRITE_W / 2);
  const dy = Math.round(w.y - SPRITE_H);
  if (w.facing === 1) {
    ctx.drawImage(sprite, dx, dy);
    return;
  }
  ctx.save();
  ctx.translate(dx + SPRITE_W, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, 0, 0);
  ctx.restore();
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  mine: boolean
): void {
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = Math.ceil(ctx.measureText(text).width) + 4;
  const x = Math.round(Math.min(WORLD_W - w - 1, Math.max(1, cx - w / 2)));
  ctx.fillStyle = mine ? "#b89b6e" : "rgba(43,33,24,0.62)";
  ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x + w / 2, y + 4.4);
}

/** 글자 단위 줄바꿈(한글 대응). maxLines 를 넘으면 마지막 줄을 말줄임표로 끝낸다. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number
): string[] {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  const lines: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < chars.length; i++) {
    const ch = chars[i];
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      lines.push(cur);
      cur = ch === " " ? "" : ch;
      if (lines.length === maxLines) break;
    } else {
      cur += ch;
    }
  }
  if (lines.length < maxLines) {
    if (cur) lines.push(cur);
    return lines;
  }
  const rest = (cur + chars.slice(i + 1).join("")).trim();
  if (!rest) return lines;
  let last = lines[maxLines - 1];
  while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
  lines[maxLines - 1] = last + "…";
  return lines;
}

function drawBubble(ctx: CanvasRenderingContext2D, w: Walker, info: Info): void {
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const padX = 4;
  const padY = 3;
  const lineH = 9;
  const title = clipName(info.name);
  const lines = wrapText(ctx, info.text, BUBBLE_MAX_W, BUBBLE_MAX_LINES);
  let textW = ctx.measureText(title).width;
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
  const bw = Math.ceil(textW) + padX * 2;
  const bh = (lines.length + 1) * lineH + padY * 2 - 1;
  const x = Math.round(Math.min(WORLD_W - bw - 2, Math.max(2, w.x - bw / 2)));
  const y = Math.max(2, Math.round(w.y - SPRITE_H - 5 - bh));
  const tailX = Math.round(Math.min(x + bw - 6, Math.max(x + 6, w.x)));

  ctx.fillStyle = "#b89b6e";
  ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, bw, bh);
  ctx.beginPath();
  ctx.moveTo(tailX - 3, y + bh);
  ctx.lineTo(tailX + 3, y + bh);
  ctx.lineTo(tailX, y + bh + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#b89b6e";
  ctx.font = `bold ${FONT}`;
  ctx.fillText(title, x + padX, y + padY);
  ctx.font = FONT;
  ctx.fillStyle = "#444444";
  lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + lineH * (i + 1)));
}

/**
 * 🏘️ 도트 마을 — 글을 남긴 하객 1명 = 도트 캐릭터 1명.
 * 캔버스 한 장에 모든 캐릭터를 그리고, 캐릭터를 누르면 그 하객의 메시지가 말풍선으로 뜬다.
 * 화면 밖·백그라운드 탭에서는 루프를 멈추고, 모션 줄이기 설정이면 정지 화면만 그린다.
 */
export default function PixelVillage({
  items,
  highlightId,
}: {
  /** buildFeed() 결과 — 메시지 탭과 같은 목록 */
  items: Celebration[];
  highlightId?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const walkersRef = useRef<Map<string, Walker>>(new Map());
  const spritesRef = useRef<Map<string, Sprites>>(new Map());
  const infoRef = useRef<Map<string, Info>>(new Map());
  const mineRef = useRef<string | null>(null);
  const bubbleRef = useRef<Bubble | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const drawRef = useRef<() => void>(() => {});
  /** 첫 목록을 받은 뒤부터 새로 들어온 하객은 하늘에서 떨어지며 등장한다 */
  const seededRef = useRef(false);
  const [failed, setFailed] = useState(false);

  // 캔버스 준비 + 렌더 루프 + 터치
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) {
      setFailed(true);
      return;
    }
    const rng = (rngRef.current ??= makeRng(Date.now()));
    const reduced = prefersReducedMotion();
    let scale = 3;
    let raf = 0;
    let last = 0;
    let visible = true;

    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawScene(ctx);
      const list = [...walkersRef.current.values()].sort((a, b) => a.y - b.y);
      for (const w of list) {
        const sp = spritesRef.current.get(w.id);
        if (sp) drawWalker(ctx, w, sp[frameFor(w)]);
      }
      for (const w of list) {
        const info = infoRef.current.get(w.id);
        if (info) drawTag(ctx, clipName(info.name), w.x, Math.round(w.y) + 1, w.id === mineRef.current);
      }
      const b = bubbleRef.current;
      if (b) {
        const w = walkersRef.current.get(b.id);
        const info = infoRef.current.get(b.id);
        if (w && info) drawBubble(ctx, w, info);
      }
    };
    drawRef.current = draw;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth || WORLD_W;
      scale = Math.max(2, Math.ceil((cssW * dpr) / WORLD_W));
      canvas.width = WORLD_W * scale;
      canvas.height = WORLD_H * scale;
      draw();
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(Math.max(0, (t - last) / 1000), MAX_DT);
      last = t;
      if (bubbleRef.current && t > bubbleRef.current.until) bubbleRef.current = null;
      const frozenId = bubbleRef.current?.id;
      const next = new Map<string, Walker>();
      for (const [id, w] of walkersRef.current) {
        next.set(id, stepWalker(w, dt, rng, id === frozenId));
      }
      walkersRef.current = next;
      draw();
    };

    const sync = () => {
      const shouldRun = visible && !document.hidden && !reduced;
      if (shouldRun && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * WORLD_W;
      const py = ((e.clientY - r.top) / r.height) * WORLD_H;
      const hit = pickWalkerAt(walkersRef.current.values(), px, py);
      bubbleRef.current = hit ? { id: hit.id, until: performance.now() + BUBBLE_MS } : null;
      draw();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0 }
    );
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    canvas.addEventListener("pointerdown", onPointer);
    resize();
    sync();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("pointerdown", onPointer);
      drawRef.current = () => {};
    };
  }, []);

  // 하객 목록 동기화 — 기존 캐릭터는 그대로 두고 새 하객만 추가, 사라진 하객은 제거
  useEffect(() => {
    const rng = (rngRef.current ??= makeRng(Date.now()));
    const dropFromSky = seededRef.current && !prefersReducedMotion();
    const prev = walkersRef.current;
    const next = new Map<string, Walker>();
    const ids = new Set<string>();
    for (const it of items) {
      ids.add(it.id);
      infoRef.current.set(it.id, {
        name: it.name,
        text: ((it.kind === "직접배달" ? it.review : it.message) ?? "").trim(),
      });
      if (!spritesRef.current.has(it.id)) spritesRef.current.set(it.id, bakeSprites(lookFromId(it.id)));
      next.set(it.id, prev.get(it.id) ?? spawnWalker(it.id, rng, dropFromSky));
    }
    for (const id of [...infoRef.current.keys()]) {
      if (ids.has(id)) continue;
      infoRef.current.delete(id);
      spritesRef.current.delete(id);
      if (bubbleRef.current?.id === id) bubbleRef.current = null;
    }
    walkersRef.current = next;
    mineRef.current = highlightId ?? null;
    if (items.length > 0) seededRef.current = true;
    drawRef.current();
  }, [items, highlightId]);

  return (
    <div ref={wrapRef} className="space-y-2">
      {failed && <p className="text-sm text-neutral-400 py-8">마을을 불러오지 못했어요</p>}
      <canvas
        ref={canvasRef}
        width={WORLD_W * 2}
        height={WORLD_H * 2}
        role="img"
        aria-label={`축하해 주신 ${items.length}명의 도트 마을. 캐릭터를 누르면 축하 메시지가 보여요.`}
        className={failed ? "hidden" : "block w-full h-auto rounded-sm border border-wedding-gold/20"}
        style={{ imageRendering: "pixelated" }}
      />
      {!failed && (
        <p className="text-[11px] text-neutral-400">
          {items.length === 0
            ? "아직 마을에 놀러 온 친구가 없어요 🛵"
            : "캐릭터를 눌러 축하 메시지를 읽어보세요 👆"}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입·린트를 확인한다**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npx eslint src/components/sections/PixelVillage.tsx src/lib/pixelSprite.ts src/lib/villageSim.ts`
Expected: 오류·경고 없음

- [ ] **Step 3: 임시 미리보기 페이지를 만든다**

로컬에는 `.env.local` 이 없어 Supabase 가 꺼져 있고, 그러면 `Guestbook` 이 빈 상태라 마을 탭이 안 보인다. 컴포넌트만 눈으로 확인하려고 샘플 데이터 페이지를 임시로 만든다. 아래 페이지 아래쪽의 큰 빈 `div` 는 "화면 밖에서 루프가 멈추는지" 확인할 스크롤 여백이다.

`src/app/village-preview/page.tsx`:

```tsx
import PixelVillage from "@/components/sections/PixelVillage";
import type { Celebration } from "@/lib/supabase";

const NAMES = [
  "수줍은 펭귄",
  "용감한 수달",
  "행복한 다람쥐",
  "다정한 고래",
  "느긋한 판다",
  "씩씩한 코알라",
  "김*수",
  "이*영",
  "박*준",
  "최*아",
];

const items: Celebration[] = Array.from({ length: 24 }, (_, i) => ({
  id: `preview-${i}`,
  kind: "마음배송",
  name: NAMES[i % NAMES.length],
  area: "서울",
  date: null,
  stamp: "💌",
  message:
    i % 4 === 0
      ? "결혼 진심으로 축하드려요! 오래오래 행복하세요. 두 분의 앞날에 늘 웃음만 가득하길 바랍니다. 정말 정말 축하해요 💐"
      : "축하해요!",
  rating: null,
  review: null,
  reply: null,
  replied_at: null,
  created_at: new Date(2026, 9, 1 + i).toISOString(),
}));

export default function VillagePreview() {
  return (
    <main className="max-w-sm mx-auto p-6 bg-wedding-cream min-h-screen">
      <PixelVillage items={items} highlightId="preview-3" />
      <div style={{ height: "200vh" }} />
    </main>
  );
}
```

- [ ] **Step 4: 개발 서버를 띄우고 미리보기를 연다**

`preview_start` 를 `{ name: "dev" }` 로 호출해(`.claude/launch.json` 에 `dev` 설정이 있다) 서버를 띄우고, `http://localhost:3000/village-preview` 로 이동한다. 서버 실행에 Bash 를 쓰지 않는다.

- [ ] **Step 5: 화면과 콘솔을 확인한다**

`read_console_messages` 로 오류가 없는지 본 뒤, 모바일 폭(`resize_window` preset `mobile`)에서 `computer screenshot` 으로 확인한다. 확인할 것:
  - 하늘·구름·풀 바닥·발판 2~3단이 도트로 선명하게 보인다(번지지 않는다).
  - 캐릭터 24명이 서 있거나 걷고, 가끔 점프한다. 발판 끝에서 돌아서거나 걸어 내려온다.
  - 캐릭터마다 머리색·옷색·모자가 다르다. 걷는 방향으로 몸이 뒤집힌다.
  - 발밑 이름표가 보이고, `preview-3` 의 이름표만 금색이다.

이상이 있으면 소스를 고치고 이 단계부터 다시 확인한다(HMR 이라 새로고침은 보통 불필요).

- [ ] **Step 6: 말풍선 터치를 확인한다**

스크린샷에서 캐릭터 하나의 좌표를 찾아 `computer left_click` 한다. 확인할 것:
  - 그 캐릭터 위에 `이름 + 메시지` 말풍선이 뜨고, 그 캐릭터는 땅에서 멈춘다.
  - 긴 메시지(`i % 4 === 0` 인 하객)는 3줄에서 `…` 로 잘린다.
  - 4초 뒤 말풍선이 닫히고 다시 움직인다. 빈 곳을 누르면 즉시 닫힌다.

- [ ] **Step 7: 화면 밖에서 루프가 멈추는지 확인한다**

`javascript_tool` 로 아래를 실행해 `fillRect` 호출 수를 센다(루프가 돌 때만 증가한다).

```js
let n = 0;
const orig = CanvasRenderingContext2D.prototype.fillRect;
CanvasRenderingContext2D.prototype.fillRect = function (...a) { n++; return orig.apply(this, a); };
const count = (ms) => new Promise((r) => { n = 0; setTimeout(() => r(n), ms); });
const visible = await count(500);
window.scrollTo(0, document.body.scrollHeight);
await new Promise((r) => setTimeout(r, 300)); // IntersectionObserver 반영 대기
const hidden = await count(500);
window.scrollTo(0, 0);
CanvasRenderingContext2D.prototype.fillRect = orig;
({ visible, hidden });
```

Expected: `visible` 은 수백 이상, `hidden` 은 `0`.

- [ ] **Step 8: 임시 페이지를 지우고 커밋한다**

```bash
rm -r src/app/village-preview
git status --short
```

`git status` 에 `village-preview` 가 **나오지 않아야** 한다. 서버는 `preview_stop` 으로 끈다.

```bash
git add src/components/sections/PixelVillage.tsx
git commit -m "feat(guestbook): 도트 마을 — 캔버스 렌더·말풍선·절전 처리" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 방명록에 `🏘️ 마을` 탭 연결 (`Guestbook.tsx`)

**Files:**
- Modify: `src/components/sections/Guestbook.tsx` (import 1줄, `ViewMode` 1줄, 토글 버튼 1개, 렌더 분기 1개)

**Interfaces:**
- Consumes: `default export PixelVillage({ items: Celebration[]; highlightId?: string | null })` (Task 3)
- Produces: 없음 (최종 연결)

- [ ] **Step 1: import 를 추가한다**

`src/components/sections/Guestbook.tsx` 에서:

old:
```tsx
import VerifyBadge from "@/components/sections/VerifyBadge";
```
new:
```tsx
import VerifyBadge from "@/components/sections/VerifyBadge";
import PixelVillage from "@/components/sections/PixelVillage";
```

- [ ] **Step 2: `ViewMode` 에 `"village"` 를 추가한다**

old:
```tsx
type ViewMode = "map" | "messages";
```
new:
```tsx
type ViewMode = "map" | "messages" | "village";
```

- [ ] **Step 3: 토글 버튼을 추가한다**

old:
```tsx
                <ToggleBtn
                  active={mode === "messages"}
                  onClick={() => setMode("messages")}
                >
                  💬 메시지
                </ToggleBtn>
```
new:
```tsx
                <ToggleBtn
                  active={mode === "messages"}
                  onClick={() => setMode("messages")}
                >
                  💬 메시지
                </ToggleBtn>
                <ToggleBtn
                  active={mode === "village"}
                  onClick={() => setMode("village")}
                >
                  🏘️ 마을
                </ToggleBtn>
```

- [ ] **Step 4: 마을 탭 렌더 분기를 추가한다**

기존 삼항(`map` ? 지도 : 메시지) 맨 앞에 `village` 분기를 끼운다. 마을 탭이 아니면 `PixelVillage` 가 언마운트되어 루프가 멈춘다.

old:
```tsx
              {mode === "map" ? (
```
new:
```tsx
              {mode === "village" ? (
                <PixelVillage items={feed} highlightId={mineId} />
              ) : mode === "map" ? (
```

- [ ] **Step 5: 전체 검증을 돌린다**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 새로 생긴 오류 없음 (기존 경고는 그대로여도 된다)

Run: `npm test`
Expected: PASS — 전체 단위 테스트 통과

Run: `npm run build`
Expected: 빌드 성공 (`Guestbook` 이 `PixelVillage` 를 정상 번들링). 환경변수 부재로 실패하면 실패 메시지가 이번 변경과 무관한지 확인하고 그대로 보고한다.

Run: `npm run test:e2e` (실행 환경이 갖춰진 경우)
Expected: 기존 e2e 통과 — 마을 탭은 기존 e2e 가 건드리는 흐름이 아니므로 회귀 확인용이다. 환경이 없어 못 돌렸다면 못 돌렸다고 그대로 보고한다.

- [ ] **Step 6: 실제 방명록에서 탭을 확인한다**

`.env.local`(`.env.local.example` 참고)에 Supabase 가 설정되어 있고 방명록에 글이 있으면, `preview_start` `{ name: "dev" }` 후 청첩장 메인(`/?key=<INVITATION_KEY>`)의 `💝 우리를 축하해준 사람들` 섹션에서 확인한다:
  - 토글이 `🗺️ 지도 / 💬 메시지 / 🏘️ 마을` 세 개로 한 줄에 들어간다(모바일 폭).
  - `🏘️ 마을` 을 누르면 글을 남긴 하객 수만큼 캐릭터가 나오고, 다른 탭으로 갔다 와도 정상 동작한다.
  - 25초 폴링으로 새 하객이 들어오면 하늘에서 떨어져 등장한다(가능하면 새 마음 배송 1건으로 확인).
  - QR 진입(`?via=qr`) 후 본인 확인을 마치면 내 캐릭터 이름표만 금색이다.

환경변수가 없어 방명록이 비어 있으면 토글 자체가 보이지 않는다(기존 `empty` 동작). 이때는 위 항목을 확인하지 못했다고 사용자에게 그대로 알리고, 배포 미리보기에서 확인하도록 안내한다.

- [ ] **Step 7: 커밋한다**

```bash
git add src/components/sections/Guestbook.tsx
git commit -m "feat(guestbook): 방명록에 🏘️ 마을 탭 추가" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
