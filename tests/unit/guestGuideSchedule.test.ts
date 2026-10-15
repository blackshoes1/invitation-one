import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement } from "react";
import Home from "@/app/page";
import GuestGuide from "@/components/GuestGuide";
import Hero from "@/components/sections/Hero";
import LockedGate from "@/components/LockedGate";
import RememberInvitationKey from "@/components/RememberInvitationKey";

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

  it("키로 연 안내는 기억 쿠키와 공유 버튼을 준다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00+09:00"));
    const page = await Home({ searchParams: Promise.resolve({ key: "schedule-test-key", view: "accounts" }) });
    const children = Children.toArray(page.props.children).filter(isValidElement);
    expect(children.map(child => child.type)).toContain(RememberInvitationKey);
    const guide = children.find(child => child.type === GuestGuide) as ReactElement<{ shareable: boolean; query: object }>;
    expect(guide.props.shareable).toBe(true);
    expect(guide.props.query).toEqual({ key: "schedule-test-key" });
  });

  // 공개 후엔 주소만 치고 들어온 하객도 안내를 본다. 사진 청첩장만 키가 있어야 열린다.
  it.each([undefined, "wrong-key"])("공개 후에는 키가 %s 여도 안내가 열리지만 기억 쿠키·공유 버튼·틀린 키는 넘기지 않는다", async (key) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00+09:00"));
    for (const view of [undefined, "accounts", "route"]) {
      const page = await Home({ searchParams: Promise.resolve({ key, view }) });
      const children = Children.toArray(page.props.children).filter(isValidElement);
      expect(children.map(child => child.type)).not.toContain(RememberInvitationKey);
      const guide = children.find(child => child.type === GuestGuide) as ReactElement<{ shareable: boolean; query: object }>;
      expect(guide.props.shareable).toBe(false);
      expect(guide.props.query).toEqual({});
    }
  });

  it("공개 후에도 사진 청첩장은 유효한 접근 키가 필요하다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00+09:00"));
    for (const key of [undefined, "wrong-key"]) {
      const page = await Home({ searchParams: Promise.resolve({ key, view: "photos" }) });
      expect(page.type).toBe(LockedGate);
    }
  });

  it.each([undefined, "accounts", "route", "guest-snap", "photos"])("공개 전에는 키가 없으면 view=%s 도 잠금이다", async (view) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T23:59:59.999+09:00"));
    const page = await Home({ searchParams: Promise.resolve({ key: "wrong-key", view }) });
    expect(page.type).toBe(LockedGate);
  });
});
