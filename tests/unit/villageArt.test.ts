import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "../../scripts/village-art/png.mjs";

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
