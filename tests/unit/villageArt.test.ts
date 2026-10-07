import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodePng, encodePng } from "../../scripts/village-art/png.mjs";
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
