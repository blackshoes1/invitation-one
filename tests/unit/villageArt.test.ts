import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodePng, encodePng } from "../../scripts/village-art/png.mjs";
import {
  COLUMNS,
  FRAME_H,
  FRAME_W,
  GUEST_LOOKS,
  allLooks,
  buildGuestLooks,
  buildSheet,
} from "../../scripts/village-art/chargen.mjs";
import { GARDEN_H, GARDEN_W, drawGarden } from "../../scripts/village-art/garden.mjs";

const pic = (name: string) => path.resolve(process.cwd(), "public/pic", name);
const readPng = (name: string) => decodePng(readFileSync(pic(name)));

describe("PNG 인코더/디코더", () => {
  // 필터가 줄마다 달라지도록 가로·세로 그라데이션·잡음이 섞인 그림
  const w = 23, h = 17;
  const rgba = new Uint8Array(w * h * 4);
  let seed = 5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const o = (y * w + x) * 4;
      rgba[o] = y < 6 ? x * 10 : (seed >>> 24);
      rgba[o + 1] = y * 14;
      rgba[o + 2] = (x * 7 + y * 5) & 0xff;
      rgba[o + 3] = x % 5 === 0 ? 0 : 255;
    }
  }

  it("인코딩한 PNG 를 디코딩하면 원래 픽셀과 크기가 그대로 나온다", () => {
    const png = encodePng(w, h, rgba);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const back = decodePng(png);
    expect(back.width).toBe(w);
    expect(back.height).toBe(h);
    expect(Buffer.from(back.rgba).equals(Buffer.from(rgba))).toBe(true);
  });

  it("픽셀 길이가 가로×세로×4 와 다르면 거부한다", () => {
    expect(() => encodePng(3, 3, new Uint8Array(10))).toThrow();
  });

  it("PNG 가 아닌 바이트는 디코딩을 거부한다", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow();
  });
});

describe("캐릭터 생성기 (scripts/village-art/chargen.mjs)", () => {
  let sheet: { width: number; height: number; rgba: Uint8Array };
  beforeAll(() => {
    sheet = buildSheet();
  }, 60_000);

  const rows = allLooks().length;
  /** 시트의 (줄, 열) 프레임 바이트 */
  const frameBytes = (row: number, col: number) => {
    const out = Buffer.alloc(FRAME_W * FRAME_H * 4);
    for (let y = 0; y < FRAME_H; y++) {
      const o = ((row * FRAME_H + y) * sheet.width + col * FRAME_W) * 4;
      Buffer.from(sheet.rgba.buffer, sheet.rgba.byteOffset + o, FRAME_W * 4).copy(out, y * FRAME_W * 4);
    }
    return out;
  };
  const sha = (b: Buffer) => createHash("sha1").update(b).digest("hex");

  it("시트는 9열 × (하객 64 + 신랑 + 신부 = 66)줄의 32×48 프레임이다", () => {
    expect(FRAME_W).toBe(32);
    expect(FRAME_H).toBe(48);
    expect(COLUMNS).toHaveLength(9);
    expect(rows).toBe(GUEST_LOOKS + 2);
    expect(sheet.width).toBe(9 * 32);
    expect(sheet.height).toBe(66 * 48);
  });

  it("하객 64종은 서로 다른 조합이고 머리 모양·옷·피부색이 골고루 나온다 (정장은 없다)", () => {
    const looks = buildGuestLooks(64);
    expect(new Set(looks.map((l: object) => JSON.stringify(l))).size).toBe(64);
    const count = (key: string) => {
      const m = new Map<string, number>();
      for (const l of looks as Record<string, string>[]) m.set(l[key], (m.get(l[key]) ?? 0) + 1);
      return m;
    };
    const styles = count("hairStyle");
    expect(styles.size).toBe(6);
    for (const n of styles.values()) expect(n).toBeGreaterThanOrEqual(8);
    const outfits = count("outfit");
    expect(outfits.has("suit")).toBe(false);
    expect(outfits.size).toBe(4);
    for (const n of outfits.values()) expect(n).toBeGreaterThanOrEqual(10);
    const skins = count("skin");
    expect(skins.size).toBe(5);
    for (const n of skins.values()) expect(n).toBeGreaterThanOrEqual(10);
  });

  it("같은 시드는 같은 결과를 낸다", () => {
    expect(JSON.stringify(buildGuestLooks(64))).toBe(JSON.stringify(buildGuestLooks(64)));
  });

  it("모든 줄·열 프레임에 불투명 픽셀이 있고 투명 배경(알파 0)도 있다", () => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < COLUMNS.length; col++) {
        const f = frameBytes(row, col);
        let opaque = 0;
        for (let i = 3; i < f.length; i += 4) if (f[i] === 255) opaque++;
        expect(opaque).toBeGreaterThan(100);
        expect(opaque).toBeLessThan(FRAME_W * FRAME_H); // 전부 칠해지면 배경이 사라진 것
      }
    }
  });

  it("앞·뒤·옆과 정지·걷기 프레임이 서로 달라 방향이 구분되고 걷기 애니메이션이 된다", () => {
    for (const row of [0, 10, 33, 63]) {
      const shas = Array.from({ length: COLUMNS.length }, (_, col) => sha(frameBytes(row, col)));
      expect(new Set(shas).size).toBe(COLUMNS.length); // 9프레임이 모두 다르다
    }
  });

  it("신랑·신부는 서로 다르고 하객 줄과도 다르다", () => {
    const shas = Array.from({ length: rows }, (_, row) => sha(frameBytes(row, 0)));
    expect(new Set(shas).size).toBe(rows); // 66줄 모두 다르다
  });

  it("커밋된 캐릭터 시트 PNG 는 생성기 결과와 픽셀까지 같다 (스크립트를 고치면 npm run village:art 로 다시 만들어야 한다)", () => {
    const committed = readPng("village-sprites.png");
    expect(committed.width).toBe(sheet.width);
    expect(committed.height).toBe(sheet.height);
    expect(Buffer.from(committed.rgba).equals(Buffer.from(sheet.rgba))).toBe(true);
  });
});

describe("정원 배경 생성기 (scripts/village-art/garden.mjs)", () => {
  it("384×352 이고 시드가 같으면 같은 그림이며 모든 픽셀이 불투명하다", () => {
    const a = drawGarden();
    const b = drawGarden();
    expect(a.width).toBe(GARDEN_W);
    expect(a.height).toBe(GARDEN_H);
    expect(GARDEN_W).toBe(384);
    expect(GARDEN_H).toBe(352);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
    for (let i = 3; i < a.rgba.length; i += 4) {
      if (a.rgba[i] !== 255) throw new Error(`transparent pixel at ${(i - 3) / 4}`);
    }
  });

  it("커밋된 배경 PNG 는 생성기 결과와 픽셀까지 같다", () => {
    const art = drawGarden();
    const committed = readPng("village-bg.png");
    expect(committed.width).toBe(art.width);
    expect(committed.height).toBe(art.height);
    expect(Buffer.from(committed.rgba).equals(Buffer.from(art.rgba))).toBe(true);
  });
});
