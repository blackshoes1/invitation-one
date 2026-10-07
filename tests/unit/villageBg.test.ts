import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { webpSize } from "../helpers/webpSize";
import { WORLD_H, WORLD_W } from "@/lib/villageSim";
import { BG_W, bgHeightFor } from "../../scripts/village-art/ingest-bg.mjs";

// vitest 는 저장소 루트에서 실행된다
const BG = path.resolve(process.cwd(), "public/pic/village-bg.webp");

describe("도트 마당 배경 village-bg.webp (ChatGPT 그림 @2x)", () => {
  it("가로 768 × 세로 WORLD_H*2 — 논리 세계(384×WORLD_H)의 정확히 2배라 늘어나거나 어긋나지 않는다", () => {
    expect(BG_W).toBe(WORLD_W * 2);
    expect(webpSize(readFileSync(BG))).toEqual({ width: 768, height: WORLD_H * 2 });
  });

  it("원본(1149×1368) 비율을 그대로 지킨다 — ingest-bg 의 높이 계산과 세계 높이가 같다", () => {
    expect(bgHeightFor(1149, 1368)).toBe(WORLD_H * 2);
    expect(Math.abs(768 / (WORLD_H * 2) - 1149 / 1368)).toBeLessThan(0.005);
  });

  it("높이 계산은 홀수면 짝수로 올린다 — 논리 높이가 정수가 되게", () => {
    expect(bgHeightFor(768, 915)).toBe(916);
    expect(bgHeightFor(768, 914)).toBe(914);
    expect(bgHeightFor(1536, 1000)).toBe(500);
  });

  it("용량 예산 — 400KB 이하", () => {
    expect(statSync(BG).size).toBeLessThanOrEqual(400 * 1024);
  });
});
