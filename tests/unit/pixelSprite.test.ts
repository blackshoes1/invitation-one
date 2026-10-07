import { describe, it, expect } from "vitest";
import { COLUMNS, FRAME_H, FRAME_W, GUEST_LOOKS as ART_GUEST_LOOKS, allLooks } from "../../scripts/village-art/chargen.mjs";
import {
  BRIDE_ROW,
  FRAME_NAMES,
  GROOM_ROW,
  GUEST_LOOKS,
  SHEET_ROWS,
  SPRITE_H,
  SPRITE_W,
  frameRect,
  hashId,
  lookRowFromId,
} from "@/lib/pixelSprite";

describe("캐릭터 시트 규격", () => {
  it("프레임은 32×64 이다", () => {
    expect(SPRITE_W).toBe(32);
    expect(SPRITE_H).toBe(64);
  });

  it("열은 앞→뒤→옆, 각각 정지→걷기1→걷기2 순서의 9프레임이다", () => {
    expect(FRAME_NAMES).toEqual([
      "down_idle", "down_walk1", "down_walk2",
      "up_idle", "up_walk1", "up_walk2",
      "side_idle", "side_walk1", "side_walk2",
    ]);
  });

  it("줄은 하객 96종 → 신랑 → 신부 = 98줄이다", () => {
    expect(GUEST_LOOKS).toBe(96);
    expect(GROOM_ROW).toBe(96);
    expect(BRIDE_ROW).toBe(97);
    expect(SHEET_ROWS).toBe(98);
  });
});

describe("앱 쪽 시트 규격과 그림 생성 스크립트 규격이 같다", () => {
  it("프레임 크기·열 순서·줄 수가 scripts/village-art/chargen.mjs 와 일치한다", () => {
    expect(FRAME_W).toBe(SPRITE_W);
    expect(FRAME_H).toBe(SPRITE_H);
    expect(COLUMNS.map(([dir, anim]: string[]) => `${dir}_${anim}`)).toEqual([...FRAME_NAMES]);
    expect(ART_GUEST_LOOKS).toBe(GUEST_LOOKS);
    expect(allLooks()).toHaveLength(SHEET_ROWS);
  });
});

describe("hashId / lookRowFromId — 하객 id → 시트 줄", () => {
  it("같은 id 는 항상 같은 값·같은 줄이다", () => {
    expect(hashId("guest-1")).toBe(hashId("guest-1"));
    expect(lookRowFromId("guest-1")).toBe(lookRowFromId("guest-1"));
  });

  it("줄은 항상 하객 줄(0~95)의 정수이고 신랑·신부 줄은 나오지 않는다", () => {
    for (let i = 0; i < 2000; i++) {
      const row = lookRowFromId(`id-${i}`);
      expect(Number.isInteger(row)).toBe(true);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(GUEST_LOOKS);
      expect(row).not.toBe(GROOM_ROW);
      expect(row).not.toBe(BRIDE_ROW);
    }
  });

  it("id 가 다르면 줄이 골고루 나온다 (500명이면 96줄 중 85줄 이상 쓰인다)", () => {
    const rows = new Set(Array.from({ length: 500 }, (_, i) => lookRowFromId(`id-${i}`)));
    expect(rows.size).toBeGreaterThanOrEqual(85);
  });
});

describe("frameRect — 시트에서 잘라 낼 사각형", () => {
  it("첫 줄 첫 열은 (0, 0) 에서 32×64", () => {
    expect(frameRect(0, "down_idle")).toEqual({ sx: 0, sy: 0, sw: 32, sh: 64 });
  });

  it("열은 프레임 순서 × 32, 줄은 줄 번호 × 64", () => {
    expect(frameRect(3, "up_walk1")).toEqual({ sx: 4 * 32, sy: 3 * 64, sw: 32, sh: 64 });
    expect(frameRect(BRIDE_ROW, "side_walk2")).toEqual({ sx: 8 * 32, sy: 97 * 64, sw: 32, sh: 64 });
  });

  it("모든 줄·프레임의 사각형이 시트(288×6272) 안에 있고 서로 겹치지 않는다", () => {
    const seen = new Set<string>();
    for (let row = 0; row < SHEET_ROWS; row++) {
      for (const f of FRAME_NAMES) {
        const r = frameRect(row, f);
        expect(r.sx).toBeGreaterThanOrEqual(0);
        expect(r.sx + r.sw).toBeLessThanOrEqual(288);
        expect(r.sy + r.sh).toBeLessThanOrEqual(6272);
        seen.add(`${r.sx},${r.sy}`);
      }
    }
    expect(seen.size).toBe(SHEET_ROWS * FRAME_NAMES.length);
  });
});
