import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement } from "react";
import Home from "@/app/page";
import GuestGuide from "@/components/GuestGuide";
import Hero from "@/components/sections/Hero";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/wedding", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/wedding")>(),
  INVITATION_KEY: "schedule-test-key",
}));

beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("하객 안내 공개 일정", () => {
  it("미리보기 배포에서는 공개 전에도 하객 안내를 볼 수 있다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00+09:00"));
    const page = await Home({ searchParams: Promise.resolve({ key: "schedule-test-key" }) });
    const types = Children.toArray(page.props.children).filter(isValidElement).map(child => child.type);
    expect(types).toContain(GuestGuide);
    expect(types).not.toContain(Hero);
  });

  it.each([
    ["2026-10-14T23:59:59.999+09:00", false],
    ["2026-10-15T00:00:00+09:00", true],
    ["2026-10-14T15:00:00Z", true],
    ["2026-10-16T11:00:00+09:00", true],
  ])("%s에는 하객 안내 공개=%s", async (time, active) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(time));
    const page = await Home({ searchParams: Promise.resolve({ key: "schedule-test-key" }) });
    const types = Children.toArray(page.props.children).filter(isValidElement).map(child => child.type);
    expect(types.includes(GuestGuide)).toBe(active);
    expect(types.includes(Hero)).toBe(!active);
  });

  it.each(["accounts", "route", "guest-snap"])("공개 전에는 view=%s로 안내 화면을 열 수 없다", async (view) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T23:59:59.999+09:00"));
    const page = await Home({ searchParams: Promise.resolve({ key: "schedule-test-key", view }) });
    const types = Children.toArray(page.props.children).filter(isValidElement).map(child => child.type);
    expect(types).toContain(Hero);
    expect(types).not.toContain(GuestGuide);
  });

  it("공개 후에도 사진 보기는 기존 청첩장으로 열린다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00+09:00"));
    const page = await Home({ searchParams: Promise.resolve({ key: "schedule-test-key", view: "photos" }) });
    const types = Children.toArray(page.props.children).filter(isValidElement).map(child => child.type);
    expect(types).toContain(Hero);
    expect(types).not.toContain(GuestGuide);
  });

  it("공개 후에도 유효한 접근 키가 필요하다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00+09:00"));
    const page = await Home({ searchParams: Promise.resolve({ key: "wrong-key" }) });
    expect(page.type).not.toBe(GuestGuide);
    expect(page.type).not.toBe("main");
  });
});
