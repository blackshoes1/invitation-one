import { describe, it, expect } from "vitest";
import {
  BRIDE_LOOK,
  FRAME_NAMES,
  GROOM_LOOK,
  FRAME_ROWS,
  SPRITE_DIRS,
  SPRITE_H,
  SPRITE_W,
  buildFrameGrid,
  hashId,
  hatPatches,
  lookFromId,
} from "@/lib/pixelSprite";

describe("도트 스프라이트 데이터", () => {
  it("앞·뒤·옆 × 정지·걷기 2 = 9 프레임이다", () => {
    expect(FRAME_NAMES).toHaveLength(9);
    expect(new Set(FRAME_NAMES).size).toBe(9);
  });

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

  it("방향마다 모양이 달라 앞·뒤·옆이 구분된다", () => {
    const joined = (f: (typeof FRAME_NAMES)[number]) => FRAME_ROWS[f].join("");
    expect(joined("down_idle")).not.toBe(joined("up_idle"));
    expect(joined("down_idle")).not.toBe(joined("side_idle"));
    expect(joined("up_idle")).not.toBe(joined("side_idle"));
  });

  it("방향마다 걷기 프레임이 정지·서로와 달라 애니메이션이 된다", () => {
    const joined = (f: (typeof FRAME_NAMES)[number]) => FRAME_ROWS[f].join("");
    for (const d of SPRITE_DIRS) {
      expect(joined(`${d}_idle`)).not.toBe(joined(`${d}_walk1`));
      expect(joined(`${d}_idle`)).not.toBe(joined(`${d}_walk2`));
      expect(joined(`${d}_walk1`)).not.toBe(joined(`${d}_walk2`));
    }
  });

  it("앞모습만 눈 두 개, 뒷모습은 눈이 없고, 옆모습은 눈 하나다", () => {
    const eyes = (f: (typeof FRAME_NAMES)[number]) => (FRAME_ROWS[f].join("").match(/e/g) ?? []).length;
    expect(eyes("down_idle")).toBe(2);
    expect(eyes("up_idle")).toBe(0);
    expect(eyes("side_idle")).toBe(1);
  });
});

describe("hatPatches — 모자 조각", () => {
  it("모자 없음은 조각이 없다", () => {
    for (const d of SPRITE_DIRS) expect(hatPatches(d, 0)).toEqual([]);
  });

  it("조각은 머리 줄(0~10)·화면 안에서 머리카락·외곽선·빈칸만 덮는다 (얼굴·눈은 가리지 않는다)", () => {
    for (const d of SPRITE_DIRS) {
      for (const hat of [1, 2] as const) {
        for (const [r, c] of hatPatches(d, hat)) {
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(10);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(SPRITE_W);
          expect("ho.").toContain(FRAME_ROWS[`${d}_idle`][r][c]);
        }
      }
    }
  });

  it("야구모자 챙: 옆에서는 오른쪽으로 튀어나오고, 뒤에서는 보이지 않는다", () => {
    const maxCol = (d: (typeof SPRITE_DIRS)[number]) => Math.max(...hatPatches(d, 1).map(([, c]) => c));
    expect(maxCol("side")).toBeGreaterThan(maxCol("down"));
    expect(maxCol("up")).toBe(maxCol("down"));
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

describe("바지 색 지정(pants)과 신랑·신부 외형", () => {
  const look = { hair: "#112233", cloth: "#445566", hat: 0 as const, hatColor: "#778899" };
  const countOf = (grid: (string | null)[][], color: string) => grid.flat().filter((c) => c === color).length;

  it("pants 를 지정하면 바지 칸이 그 색이고, 지정하지 않으면 기존 남색이다", () => {
    const withPants = buildFrameGrid("down_idle", { ...look, pants: "#abcdef" });
    const without = buildFrameGrid("down_idle", look);
    expect(countOf(withPants, "#abcdef")).toBeGreaterThan(0);
    expect(countOf(withPants, "#3d4a63")).toBe(0);
    expect(countOf(without, "#3d4a63")).toBe(countOf(withPants, "#abcdef"));
    expect(countOf(without, "#abcdef")).toBe(0);
  });

  it("신랑은 짙은 정장, 신부는 흰 옷에 머리 꽃을 단다", () => {
    expect(GROOM_LOOK.cloth).toBe("#2f3340");
    expect(GROOM_LOOK.pants).toBe("#1e1f26");
    expect(BRIDE_LOOK.cloth).toBe("#f6f3ee");
    expect(BRIDE_LOOK.pants).toBe("#f6f3ee");
    expect(BRIDE_LOOK.hat).toBe(2); // 머리 꽃
    expect(GROOM_LOOK.hat).toBe(0);
  });

  it("신랑·신부는 모든 프레임이 정상적으로 칠해지고 서로 다르게 보인다", () => {
    for (const f of FRAME_NAMES) {
      for (const l of [GROOM_LOOK, BRIDE_LOOK]) {
        const cells = buildFrameGrid(f, l).flat();
        expect(cells.every((c) => c === null || /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
      }
    }
    expect(JSON.stringify(buildFrameGrid("down_idle", GROOM_LOOK))).not.toBe(
      JSON.stringify(buildFrameGrid("down_idle", BRIDE_LOOK))
    );
    expect(buildFrameGrid("down_idle", BRIDE_LOOK).flat()).toContain("#f08aa5"); // 머리 꽃색
  });
});

describe("buildFrameGrid — 색 입히기", () => {
  const look = { hair: "#112233", cloth: "#445566", hat: 0 as const, hatColor: "#778899" };

  it("투명은 null, 머리·옷 칸에는 외형 색이 들어간다", () => {
    const g = buildFrameGrid("down_idle", look);
    expect(g).toHaveLength(SPRITE_H);
    expect(g[0][0]).toBeNull();
    const flat = g.flat();
    expect(flat).toContain("#112233");
    expect(flat).toContain("#445566");
    expect(flat).not.toContain("#778899"); // 모자 없음
  });

  it("야구모자(1)는 모자색을, 꽃(2)은 꽃색을 모든 방향에서 칠한다", () => {
    for (const d of SPRITE_DIRS) {
      expect(buildFrameGrid(`${d}_idle`, { ...look, hat: 1 }).flat()).toContain("#778899");
      expect(buildFrameGrid(`${d}_idle`, { ...look, hat: 2 }).flat()).toContain("#f08aa5");
    }
  });

  it("모든 프레임·모자 조합에서 칠한 칸은 16진 색이다 (undefined 없음)", () => {
    for (const f of FRAME_NAMES) {
      for (const hat of [0, 1, 2] as const) {
        const cells = buildFrameGrid(f, { ...look, hat }).flat();
        expect(cells.every((c) => c === null || /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
      }
    }
  });
});
