import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { siteOrigin } from "@/lib/siteUrl";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("siteOrigin", () => {
  it("env 가 있으면 env 우선 (끝 슬래시 제거), 요청 Host 는 무시", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://kkachi.vercel.app/";
    const req = new Request("https://evil.example/api/x");
    expect(siteOrigin(req)).toBe("https://kkachi.vercel.app");
  });
  it("env 없고 production 이면 고정 폴백 — 요청 Host 로 절대 바뀌지 않음", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const req = new Request("https://evil.example/api/x");
    expect(siteOrigin(req)).toBe("https://kkachi.vercel.app");
  });
  it("env 없고 개발이면 요청 origin 폴백", () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(siteOrigin(new Request("http://localhost:3000/api/x"))).toBe("http://localhost:3000");
  });
});
