import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  hashManageToken,
  generateManageToken,
  isManageTokenFormat,
  manageUrl,
  MANAGE_TOKEN_RE,
} from "@/lib/manageToken";
import {
  signToken,
  verifyToken,
  signingKeyFromEnv,
  UPLOAD_TOKEN_PURPOSE,
} from "@/lib/signedToken";
import { sniffImage } from "@/lib/imageSniff";

describe("manage token", () => {
  it("generate: 128-bit hex, 매번 다름", () => {
    const a = generateManageToken();
    const b = generateManageToken();
    expect(MANAGE_TOKEN_RE.test(a)).toBe(true);
    expect(a).not.toBe(b);
  });
  it("hash: sha256 hex, 결정적 — DB 에는 이 값만 저장", () => {
    const t = "0123456789abcdef0123456789abcdef";
    expect(hashManageToken(t)).toBe(crypto.createHash("sha256").update(t).digest("hex"));
    expect(hashManageToken(t)).toHaveLength(64);
    expect(hashManageToken(t)).not.toBe(t);
  });
  it("format: UUID·짧은 값·대문자 거부", () => {
    expect(isManageTokenFormat("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isManageTokenFormat("359ed748-0000-4000-8000-000000000000")).toBe(false);
    expect(isManageTokenFormat("0123456789ABCDEF0123456789ABCDEF")).toBe(false);
    expect(isManageTokenFormat(null)).toBe(false);
  });
  it("manageUrl", () => {
    expect(manageUrl("https://kkachi.vercel.app", "ab")).toBe("https://kkachi.vercel.app/delivery/manage/ab");
  });
});

describe("signed token (업로드 토큰)", () => {
  const key = crypto.createHash("sha256").update("test-key").digest();
  const other = crypto.createHash("sha256").update("other-key").digest();

  it("sign → verify 왕복, payload 목적·만료 포함", () => {
    const t = signToken(UPLOAD_TOKEN_PURPOSE, 60, key, 1_000_000_000)!;
    const v = verifyToken(t, UPLOAD_TOKEN_PURPOSE, key, 1_000_000_000 + 30_000);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.p).toBe(UPLOAD_TOKEN_PURPOSE);
      expect(v.payload.exp).toBe(1_000_000 + 60);
      expect(v.payload.n.length).toBeGreaterThan(8);
    }
  });
  it("만료 → expired", () => {
    const t = signToken(UPLOAD_TOKEN_PURPOSE, 60, key, 1_000_000_000)!;
    const v = verifyToken(t, UPLOAD_TOKEN_PURPOSE, key, 1_000_000_000 + 61_000);
    expect(v).toEqual({ ok: false, reason: "expired" });
  });
  it("다른 키 / 변조 / 형식 / 목적 불일치 / 키 없음", () => {
    const t = signToken(UPLOAD_TOKEN_PURPOSE, 60, key)!;
    expect(verifyToken(t, UPLOAD_TOKEN_PURPOSE, other).ok).toBe(false);
    const [body, sig] = t.split(".");
    const tampered = Buffer.from(JSON.stringify({ p: UPLOAD_TOKEN_PURPOSE, iat: 0, exp: 9e9, n: "x" })).toString("base64url");
    expect(verifyToken(`${tampered}.${sig}`, UPLOAD_TOKEN_PURPOSE, key)).toEqual({ ok: false, reason: "signature" });
    expect(verifyToken(`${body}.AAAA`, UPLOAD_TOKEN_PURPOSE, key)).toEqual({ ok: false, reason: "signature" });
    expect(verifyToken("no-dot", UPLOAD_TOKEN_PURPOSE, key)).toEqual({ ok: false, reason: "format" });
    expect(verifyToken(42, UPLOAD_TOKEN_PURPOSE, key)).toEqual({ ok: false, reason: "format" });
    expect(verifyToken(t, "other-purpose", key)).toEqual({ ok: false, reason: "purpose" });
    expect(verifyToken(t, UPLOAD_TOKEN_PURPOSE, null)).toEqual({ ok: false, reason: "no_key" });
    expect(signToken(UPLOAD_TOKEN_PURPOSE, 60, null)).toBeNull();
  });
  it("signingKeyFromEnv: APP_SIGNING_SECRET 우선, 없으면 서버 시크릿 파생, 둘 다 없으면 null (NEXT_PUBLIC 미사용)", () => {
    expect(signingKeyFromEnv({})).toBeNull();
    expect(signingKeyFromEnv({ NEXT_PUBLIC_INVITATION_KEY: "pub" })).toBeNull();
    const derived = signingKeyFromEnv({ SUPABASE_SERVICE_ROLE_KEY: "s", ADMIN_PASSWORD: "p" });
    expect(derived).not.toBeNull();
    expect(signingKeyFromEnv({ SUPABASE_SERVICE_ROLE_KEY: "s" })).toBeNull();
    const explicit = signingKeyFromEnv({ APP_SIGNING_SECRET: "x", SUPABASE_SERVICE_ROLE_KEY: "s", ADMIN_PASSWORD: "p" });
    expect(explicit!.equals(derived!)).toBe(false);
  });
});

describe("sniffImage (magic bytes)", () => {
  it("JPEG/PNG/WebP/HEIC 시그니처 판별, 그 외 null", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = new Uint8Array(12); webp.set(Buffer.from("RIFF"), 0); webp.set(Buffer.from("WEBP"), 8);
    expect(sniffImage(webp)).toBe("image/webp");
    const heic = new Uint8Array(12); heic.set(Buffer.from("ftyp"), 4); heic.set(Buffer.from("heic"), 8);
    expect(sniffImage(heic)).toBe("image/heic");
    expect(sniffImage(Buffer.from("<svg xmlns=..."))).toBeNull();
    expect(sniffImage(Buffer.from("hello"))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});
