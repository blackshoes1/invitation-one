import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { webpSize } from "../helpers/webpSize";
import { COLUMNS, FRAME_H, FRAME_W, LAYOUTS, applyFrameOverrides, buildSheet, findComponents, sliceSource } from "../../scripts/village-art/ingest.mjs";

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

/**
 * 원본 시트 흉내: 블록 bx×by 개, 블록마다 프레임 3열 × 4줄. 칸(pw×ph) 가운데에 프레임 그림을 찍는다.
 * 프레임 색 = (블록·줄·프레임 번호) 라서 잘린 조각이 어느 칸인지 알 수 있다. shape 로 그림 모양을 바꾼다(기본: fw×fh 사각형).
 */
function sheetImage(bx: number, by: number, pw: number, ph: number, shape: (block: number) => [number, number][]) {
  const width = bx * 3 * pw, height = by * 4 * ph, rgba = new Uint8Array(width * height * 4);
  for (let fr = 0; fr < by * 4; fr++) for (let fc = 0; fc < bx * 3; fc++) {
    const block = Math.floor(fr / 4) * bx + Math.floor(fc / 3), row = fr % 4, frame = fc % 3;
    const rows = shape(block); // 줄마다 [폭, 높이] 띠를 위에서부터 쌓는다(가운데 맞춤)
    const totalH = rows.reduce((s, [, h]) => s + h, 0);
    let y = fr * ph + ((ph - totalH) >> 1);
    for (const [w, h] of rows) {
      const x0 = fc * pw + ((pw - w) >> 1);
      for (let yy = y; yy < y + h; yy++) for (let x = x0; x < x0 + w; x++) {
        rgba.set([10 + block * 20, 10 + row * 40, 10 + frame * 80, 255], (yy * width + x) * 4);
      }
      y += h;
    }
  }
  return { width, height, rgba };
}

type Sliced = { w: number; h: number; rgba: Uint8Array }[][][];

describe("sliceSource — 원본 종류별 배치(layout)", () => {
  it("배치 묘사: 하객 시트는 4×2 블록, 신랑·신부 시트는 2×1 블록(왼쪽 신랑, 오른쪽 신부)", () => {
    expect(LAYOUTS.guests).toMatchObject({ blocksX: 4, blocksY: 2 });
    expect(LAYOUTS.couple).toMatchObject({ blocksX: 2, blocksY: 1, roles: ["groom", "bride"] });
  });

  it("신랑·신부 시트(2블록 × 4줄 × 3프레임)를 블록 2개 × 4줄 × 3프레임 조각으로 자른다", () => {
    const img = sheetImage(2, 1, 70, 90, () => [[40, 60]]);
    const blocks: Sliced = sliceSource(img, LAYOUTS.couple);
    expect(blocks).toHaveLength(2);
    blocks.forEach((rows, block) => {
      expect(rows).toHaveLength(4);
      rows.forEach((frames, row) => {
        expect(frames).toHaveLength(3);
        frames.forEach((f, frame) => {
          expect([f.w, f.h]).toEqual([40, 60]);
          expect(Array.from(f.rgba.subarray(0, 4))).toEqual([10 + block * 20, 10 + row * 40, 10 + frame * 80, 255]);
        });
      });
    });
  });

  it("하객 시트는 블록 8개를 읽기 순서(왼→오, 위→아래)로 돌려준다", () => {
    const blocks: Sliced = sliceSource(sheetImage(4, 2, 60, 80, () => [[40, 60]]), LAYOUTS.guests);
    expect(blocks).toHaveLength(8);
    blocks.forEach((rows, block) => expect(rows[3][2].rgba[0]).toBe(10 + block * 20));
  });

  it("배치가 원본과 다르면 프레임 열 수가 안 맞아 멈춘다", () => {
    expect(() => sliceSource(sheetImage(2, 1, 70, 90, () => [[40, 60]]), LAYOUTS.guests)).toThrow(/프레임 열이 12개가 아니다: 6/);
  });
});

describe("buildSheet — 하객 시트 + 신랑·신부 시트", () => {
  const guestSheet = { id: 0, layout: LAYOUTS.guests, image: sheetImage(4, 2, 60, 80, () => [[30, 60]]) };
  const opts = { mirrorRight: [], frameOverrides: [] };

  it("줄 순서는 하객(모든 블록) → 신랑(왼쪽 블록) → 신부(오른쪽 블록)", () => {
    const couple = { id: "couple", layout: LAYOUTS.couple, image: sheetImage(2, 1, 140, 160, () => [[80, 120]]) };
    const s = buildSheet([guestSheet, couple], opts);
    expect(s.guests).toBe(8);
    expect(s.rows.slice(-2)).toEqual([{ source: "couple", block: 0, role: "groom" }, { source: "couple", block: 1, role: "bride" }]);
    expect(s.rows.slice(0, 8).every((r: { role: string }) => r.role === "guest")).toBe(true);
    expect([s.width, s.height]).toEqual([12 * FRAME_W, 10 * FRAME_H]);
  });

  it("프레임 순서는 배치마다 다르다 — 하객 원본은 걷기1·정지·걷기2, 신랑·신부 원본은 정지·걷기1·걷기2", () => {
    expect(LAYOUTS.guests.frames).toEqual(["walk1", "idle", "walk2"]);
    expect(LAYOUTS.couple.frames).toEqual(["idle", "walk1", "walk2"]);
    const couple = { id: "couple", layout: LAYOUTS.couple, image: sheetImage(2, 1, 140, 160, () => [[80, 120]]) };
    const s = buildSheet([guestSheet, couple], opts);
    // 프레임 가운데 픽셀의 파랑 = 10 + 원본 프레임 번호 × 80
    const blueAt = (row: number, col: string) => s.rgba[((row * FRAME_H + 100) * s.width + COLUMNS.indexOf(col) * FRAME_W + 40) * 4 + 2];
    expect([blueAt(0, "down_walk1"), blueAt(0, "down_idle"), blueAt(0, "down_walk2")]).toEqual([10, 90, 170]);
    for (const row of [8, 9]) {
      expect([blueAt(row, "left_idle"), blueAt(row, "left_walk1"), blueAt(row, "left_walk2")]).toEqual([10, 90, 170]);
    }
  });

  it("신랑·신부는 따로 배율을 쓴다 — 하객 배율은 그대로, 머리 폭이 하객과 같아지게", () => {
    // 하객 30×60: 앞모습 높이 한도 120/60 = 2 → 머리 폭 60. 신랑·신부 80×120 → 60/80 = 0.75
    const couple = { id: "couple", layout: LAYOUTS.couple, image: sheetImage(2, 1, 140, 160, () => [[80, 120]]) };
    const s = buildSheet([guestSheet, couple], opts);
    expect(s.scale).toBeCloseTo(2, 6);
    expect(s.coupleScale).toBeCloseTo(0.75, 6);
    expect(s.report.coupleFit).toBe(1);
    // 하객 줄 그림은 신랑·신부 시트가 있든 없든 같다(신부가 넓어도 하객이 줄지 않는다)
    const wide = { id: "couple", layout: LAYOUTS.couple, image: sheetImage(2, 1, 140, 160, (b) => (b === 1 ? [[80, 48], [120, 72]] : [[80, 120]])) };
    const s2 = buildSheet([guestSheet, wide], opts);
    expect(s2.scale).toBe(s.scale);
    const guestBytes = 8 * FRAME_H * s.width * 4;
    expect(Buffer.from(s2.rgba.subarray(0, guestBytes)).equals(Buffer.from(s.rgba.subarray(0, guestBytes)))).toBe(true);
  });

  it("신부가 프레임에 안 들어가면 신랑·신부 배율을 함께 줄이고 그 비율을 알려 준다", () => {
    // 신부 치마 폭 120 → 76/120 = 0.6333 < 머리 맞춤 0.75
    const wide = { id: "couple", layout: LAYOUTS.couple, image: sheetImage(2, 1, 140, 160, (b) => (b === 1 ? [[80, 48], [120, 72]] : [[80, 120]])) };
    const s = buildSheet([guestSheet, wide], opts);
    expect(s.coupleScale).toBeCloseTo(76 / 120, 6);
    expect(s.report.coupleFit).toBeCloseTo(76 / 120 / 0.75, 6);
    expect(s.report.coupleLimitBy).toMatch(/폭 couple:1/);
  });

  it("신랑·신부 시트가 없으면 멈춘다", () => {
    expect(() => buildSheet([guestSheet], opts)).toThrow(/신랑·신부/);
  });
});

describe("buildSheet — 어느 블록에도 안 맞는 목록 항목은 조용히 넘기지 않는다", () => {
  // 블록을 돌려주는 가짜 자르기 — 이 검사는 크기 계산 전에 일어난다
  const blocks = (_img: unknown, layout: { blocksX: number; blocksY: number }) =>
    Array.from({ length: layout.blocksX * layout.blocksY }, () => Array.from({ length: 4 }, () => [{}, {}, {}]));
  const sources = [{ id: 0, layout: LAYOUTS.guests, image: {} }, { id: "couple", layout: LAYOUTS.couple, image: {} }];
  const opts = (o: object) => ({ mirrorRight: [], frameOverrides: [], slice: blocks, ...o });

  it("MIRROR_RIGHT 에 없는 블록이 있으면 그 키를 담아 오류", () => {
    expect(() => buildSheet(sources, opts({ mirrorRight: [{ source: 5, block: 0 }] }))).toThrow(/MIRROR_RIGHT.*5:0/);
  });

  it("FRAME_OVERRIDES 에 없는 블록이 있으면 그 키를 담아 오류", () => {
    expect(() => buildSheet(sources, opts({ frameOverrides: [{ source: 0, block: 9, frame: "up_idle", from: "down_idle" }] }))).toThrow(/FRAME_OVERRIDES.*0:9/);
  });

  it("신랑·신부 시트 블록은 source 'couple' 로 가리킨다(블록 2개뿐)", () => {
    expect(() => buildSheet(sources, opts({ mirrorRight: [{ source: "couple", block: 2 }] }))).toThrow(/MIRROR_RIGHT.*couple:2/);
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
