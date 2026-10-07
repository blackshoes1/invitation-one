import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { COLUMNS, FRAME_H, FRAME_W, SHEET_SCALE } from "../../scripts/village-art/ingest.mjs";
import { webpSize } from "../helpers/webpSize";
import {
  BRIDE_ROW, FRAME_NAMES, GROOM_ROW, GUEST_LOOKS, SHEET_FRAME_H, SHEET_FRAME_W, SHEET_ROWS,
  SHEET_SCALE as APP_SCALE, SPRITE_H, SPRITE_W, frameRect, hashId, lookRowFromId,
} from "@/lib/pixelSprite";

describe("캐릭터 시트 규격", () => {
  it("논리 크기 40×64, 시트 프레임은 그 2배(80×128)", () => {
    expect(SPRITE_W).toBe(40);
    expect(SPRITE_H).toBe(64);
    expect(APP_SCALE).toBe(2);
    expect(SHEET_FRAME_W).toBe(SPRITE_W * APP_SCALE);
    expect(SHEET_FRAME_H).toBe(SPRITE_H * APP_SCALE);
  });

  it("열은 앞·뒤·왼쪽·오른쪽, 각각 정지→걷기1→걷기2 순서의 12프레임이다", () => {
    expect(FRAME_NAMES).toEqual([
      "down_idle", "down_walk1", "down_walk2",
      "up_idle", "up_walk1", "up_walk2",
      "left_idle", "left_walk1", "left_walk2",
      "right_idle", "right_walk1", "right_walk2",
    ]);
  });

  it("줄은 하객 → 신랑 → 신부 순서이고 서로 이어진다", () => {
    expect(GROOM_ROW).toBe(GUEST_LOOKS);
    expect(BRIDE_ROW).toBe(GUEST_LOOKS + 1);
    expect(SHEET_ROWS).toBe(GUEST_LOOKS + 2);
    expect(GUEST_LOOKS).toBeGreaterThanOrEqual(20);
  });
});

describe("앱 쪽 시트 규격과 변환 스크립트 규격이 같다", () => {
  it("프레임 크기·배율·열 순서가 scripts/village-art/ingest.mjs 와 일치한다", () => {
    expect(FRAME_W).toBe(SHEET_FRAME_W);
    expect(FRAME_H).toBe(SHEET_FRAME_H);
    expect(SHEET_SCALE).toBe(APP_SCALE);
    expect(COLUMNS).toEqual([...FRAME_NAMES]);
  });

  it("실제 시트 파일의 가로·세로가 상수와 맞는다 (WebP 헤더)", () => {
    const buf = readFileSync(path.resolve(process.cwd(), "public/pic/village-sprites.webp"));
    const { width, height } = webpSize(buf);
    expect(width).toBe(FRAME_NAMES.length * SHEET_FRAME_W);
    expect(height).toBe(SHEET_ROWS * SHEET_FRAME_H);
  });
});

describe("hashId / lookRowFromId — 하객 id → 시트 줄", () => {
  it("같은 id 는 항상 같은 값·같은 줄이다", () => {
    expect(hashId("guest-1")).toBe(hashId("guest-1"));
    expect(lookRowFromId("guest-1")).toBe(lookRowFromId("guest-1"));
  });

  it("줄은 항상 하객 줄(0~GUEST_LOOKS-1)의 정수이고 신랑·신부 줄은 나오지 않는다", () => {
    for (let i = 0; i < 2000; i++) {
      const row = lookRowFromId(`id-${i}`);
      expect(Number.isInteger(row)).toBe(true);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(GUEST_LOOKS);
    }
  });

  it("id 가 다르면 줄이 골고루 나온다 (500명이면 하객 줄의 90% 이상이 쓰인다)", () => {
    const rows = new Set(Array.from({ length: 500 }, (_, i) => lookRowFromId(`id-${i}`)));
    expect(rows.size).toBeGreaterThanOrEqual(Math.floor(GUEST_LOOKS * 0.9));
  });
});

describe("frameRect — 시트에서 잘라 낼 사각형", () => {
  it("첫 줄 첫 열은 (0, 0) 에서 80×128", () => {
    expect(frameRect(0, "down_idle")).toEqual({ sx: 0, sy: 0, sw: 80, sh: 128 });
  });

  it("열은 프레임 순서 × 80, 줄은 줄 번호 × 128", () => {
    expect(frameRect(3, "up_walk1")).toEqual({ sx: 4 * 80, sy: 3 * 128, sw: 80, sh: 128 });
    expect(frameRect(BRIDE_ROW, "right_walk2")).toEqual({ sx: 11 * 80, sy: BRIDE_ROW * 128, sw: 80, sh: 128 });
  });

  it("모든 줄·프레임의 사각형이 시트 안에 있고 서로 겹치지 않는다", () => {
    const seen = new Set<string>();
    for (let row = 0; row < SHEET_ROWS; row++) {
      for (const f of FRAME_NAMES) {
        const r = frameRect(row, f);
        expect(r.sx + r.sw).toBeLessThanOrEqual(12 * 80);
        expect(r.sy + r.sh).toBeLessThanOrEqual(SHEET_ROWS * 128);
        seen.add(`${r.sx},${r.sy}`);
      }
    }
    expect(seen.size).toBe(SHEET_ROWS * FRAME_NAMES.length);
  });
});
