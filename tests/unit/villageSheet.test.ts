import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { webpSize } from "../helpers/webpSize";
import { COLUMNS, FRAME_H, FRAME_W, applyFrameOverrides, buildSheet, findComponents } from "../../scripts/village-art/ingest.mjs";

/** w×h 투명 이미지에 (x0,y0)-(x1,y1) 불투명 사각형들을 찍는다 */
function image(w: number, h: number, rects: [number, number, number, number, number?][]) {
  const rgba = new Uint8Array(w * h * 4);
  for (const [x0, y0, x1, y1, a = 255] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const o = (y * w + x) * 4; rgba[o] = 200; rgba[o + 3] = a; }
  }
  return { w, h, rgba };
}

describe("findComponents — 알파 연결 성분", () => {
  it("떨어진 덩어리를 각각의 경계 상자로 찾는다", () => {
    const { w, h, rgba } = image(40, 30, [[2, 3, 9, 12], [20, 5, 33, 25]]);
    const comps = findComponents(rgba, w, h, { alphaMin: 128 });
    const boxes = comps.map((c: { x0: number; y0: number; x1: number; y1: number }) => [c.x0, c.y0, c.x1, c.y1]).sort();
    expect(boxes).toEqual([[2, 3, 9, 12], [20, 5, 33, 25]]);
  });

  it("옅은 알파(번짐)는 임계값 아래면 무시하고, 맞닿은 번짐이 덩어리를 이어 붙이지 않는다", () => {
    const { w, h, rgba } = image(40, 20, [[2, 2, 10, 15], [14, 2, 22, 15], [11, 2, 13, 15, 20]]);
    const comps = findComponents(rgba, w, h, { alphaMin: 128 });
    expect(comps).toHaveLength(2);
  });

  it("알파가 임계값 이상인 픽셀이 없으면 빈 목록", () => {
    const { w, h, rgba } = image(10, 10, [[1, 1, 5, 5, 100]]);
    expect(findComponents(rgba, w, h, { alphaMin: 128 })).toEqual([]);
  });

  it("대각선으로만 닿은 픽셀은 같은 덩어리가 아니다(4방향 연결)", () => {
    const { w, h, rgba } = image(6, 6, [[1, 1, 2, 2], [3, 3, 4, 4]]);
    expect(findComponents(rgba, w, h, { alphaMin: 128 })).toHaveLength(2);
  });
});

type Crop = { w: number; h: number; rgba: Uint8Array; colX: number };

describe("applyFrameOverrides — 프레임 덮어쓰기", () => {
  // 2×1 크롭: 왼쪽 픽셀 알파 = id, 오른쪽 픽셀 알파 = 255 (반전되면 순서가 바뀐다)
  const crop = (id: number): Crop => ({ w: 2, h: 1, rgba: Uint8Array.from([0, 0, 0, id, 0, 0, 0, 255]), colX: 0.5 });
  const views = () => {
    let id = 1;
    const v: Record<string, Crop[]> = {};
    for (const view of ["down", "up", "left", "right"]) v[view] = [crop(id++), crop(id++), crop(id++)]; // 원본 순서: 걷기1·가운데·걷기2
    return v;
  };

  it("목록의 프레임만 다른 프레임의 반전으로 바꾸고 나머지는 그대로 둔다", () => {
    const before = views();
    const after = applyFrameOverrides(before, [
      { frame: "left_walk1", from: "right_walk1", mirror: true },
      { frame: "right_walk2", from: "left_walk2", mirror: true },
    ]);
    // left_walk1(원본 0번) ← right 원본 0번(id 10)의 반전
    expect(Array.from(after.left[0].rgba)).toEqual([0, 0, 0, 255, 0, 0, 0, 10]);
    expect(after.left[0].colX).toBe(1.5);
    // right_walk2(원본 2번) ← 덮어쓰기 전 left 원본 2번(id 9)의 반전
    expect(Array.from(after.right[2].rgba)).toEqual([0, 0, 0, 255, 0, 0, 0, 9]);
    // 나머지 10개 프레임은 같은 객체, 입력은 바뀌지 않는다
    for (const v of ["down", "up", "left", "right"]) for (let i = 0; i < 3; i++) {
      if ((v === "left" && i === 0) || (v === "right" && i === 2)) continue;
      expect(after[v][i]).toBe(before[v][i]);
    }
    expect(before.left[0].rgba[3]).toBe(7);
  });

  it("반전 없이 그대로 가져올 수도 있고, 모르는 프레임 이름은 오류", () => {
    const before = views();
    expect(applyFrameOverrides(before, [{ frame: "up_idle", from: "down_idle", mirror: false }]).up[1]).toBe(before.down[1]);
    expect(() => applyFrameOverrides(before, [{ frame: "side_walk1", from: "down_idle" }])).toThrow();
  });
});

describe("buildSheet — 어느 블록에도 안 맞는 목록 항목은 조용히 넘기지 않는다", () => {
  // 블록 8개(4줄 × 3프레임)를 돌려주는 가짜 자르기 — 이 검사는 크기 계산 전에 일어난다
  const blocks = () => Array.from({ length: 8 }, () => Array.from({ length: 4 }, () => [{}, {}, {}]));
  const picks = { groom: { source: 0, block: 0 }, bride: { source: 0, block: 1 } };
  const opts = (o: object) => ({ mirrorRight: [], frameOverrides: [], slice: blocks, ...o });

  it("MIRROR_RIGHT 에 없는 블록이 있으면 그 키를 담아 오류", () => {
    expect(() => buildSheet([{}], picks, opts({ mirrorRight: [{ source: 5, block: 0 }] }))).toThrow(/MIRROR_RIGHT.*5:0/);
  });

  it("FRAME_OVERRIDES 에 없는 블록이 있으면 그 키를 담아 오류", () => {
    expect(() => buildSheet([{}], picks, opts({ frameOverrides: [{ source: 0, block: 9, frame: "up_idle", from: "down_idle" }] }))).toThrow(/FRAME_OVERRIDES.*0:9/);
  });
});

const SHEET = path.resolve(process.cwd(), "public/pic/village-sprites.webp");

describe("결과 시트 village-sprites.webp", () => {
  it("규격: 12열 × 80, 줄은 128 의 배수이고 최소 하객 20명 + 신랑 + 신부", () => {
    expect(FRAME_W).toBe(80);
    expect(FRAME_H).toBe(128);
    expect(COLUMNS).toHaveLength(12);
    const { width, height } = webpSize(readFileSync(SHEET));
    expect(width).toBe(12 * FRAME_W);
    expect(height % FRAME_H).toBe(0);
    expect(height / FRAME_H).toBeGreaterThanOrEqual(22);
  });

  it("용량 예산 — 1.2MB 이하", () => {
    expect(statSync(SHEET).size).toBeLessThanOrEqual(1.2 * 1024 * 1024);
  });
});

// sharp 가 있을 때만 도는 픽셀 속성 검사 (CI 에 sharp 가 없으면 건너뛴다)
const sharpMod = await import("sharp").then((m) => m.default).catch(() => null);

describe.skipIf(!sharpMod)("결과 시트 픽셀 속성", () => {
  it("모든 프레임에 캐릭터가 있고 발끝이 아래 가까이, 몸이 가운데에 있으며 잘리지 않는다", async () => {
    const { data, info } = await sharpMod!(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rows = info.height / FRAME_H;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < COLUMNS.length; col++) {
        let x0 = FRAME_W, x1 = -1, y0 = FRAME_H, y1 = -1, opaque = 0;
        for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
          const a = data[((row * FRAME_H + y) * info.width + col * FRAME_W + x) * 4 + 3];
          if (a >= 128) { opaque++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        const at = `row ${row} col ${col}`; // 어느 프레임이 깨졌는지 바로 보이게
        expect(opaque, at).toBeGreaterThan(800);
        expect(y1, at).toBeGreaterThanOrEqual(FRAME_H - 8); // 발끝이 아래 가까이
        expect(y1, at).toBeLessThanOrEqual(FRAME_H - 1);
        expect(x0, at).toBeGreaterThanOrEqual(1);          // 좌우로 잘리지 않음
        expect(x1, at).toBeLessThanOrEqual(FRAME_W - 2);
        expect(y0, at).toBeGreaterThanOrEqual(1);          // 위로 잘리지 않음
        expect((x0 + x1) / 2, at).toBeGreaterThanOrEqual(FRAME_W / 2 - 14);
        expect((x0 + x1) / 2, at).toBeLessThanOrEqual(FRAME_W / 2 + 14);
      }
    }
  });

  it("옅은 번짐이 없다 — 알파가 1~47 인 픽셀은 전체의 1% 미만", async () => {
    const { data, info } = await sharpMod!(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let faint = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0 && data[i] < 48) faint++;
    expect(faint / (info.width * info.height)).toBeLessThan(0.01);
  });
});
