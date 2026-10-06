import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// vitest 는 저장소 루트에서 실행된다
const FILE = path.resolve(process.cwd(), "public/pic/village-bg.png");

describe("도트 마당 배경 이미지 (public/pic/village-bg.png)", () => {
  it("192×176 PNG 이다 — 논리 해상도와 같아야 늘어나거나 번지지 않는다", () => {
    const buf = readFileSync(FILE);
    expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(buf.readUInt32BE(16)).toBe(192); // IHDR 너비
    expect(buf.readUInt32BE(20)).toBe(176); // IHDR 높이
  });

  it("가볍다 — 100KB 미만", () => {
    expect(statSync(FILE).size).toBeLessThan(100 * 1024);
  });
});
