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
