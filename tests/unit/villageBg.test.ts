import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// vitest 는 저장소 루트에서 실행된다
const pic = (name: string) => path.resolve(process.cwd(), "public/pic", name);

function pngSize(file: string): { width: number; height: number; signature: string } {
  const buf = readFileSync(file);
  return { signature: buf.subarray(1, 4).toString("ascii"), width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("도트 마당 이미지 규격 (public/pic)", () => {
  it("배경 village-bg.png 는 384×352 PNG 이다 — 세계 크기와 같아야 늘어나거나 번지지 않는다", () => {
    expect(pngSize(pic("village-bg.png"))).toEqual({ signature: "PNG", width: 384, height: 352 });
  });

  it("배경은 가볍다 — 200KB 미만", () => {
    expect(statSync(pic("village-bg.png")).size).toBeLessThan(200 * 1024);
  });
});
