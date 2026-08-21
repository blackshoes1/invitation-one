import crypto from "node:crypto";

/**
 * 서버 전용 HMAC 서명 단기 토큰 (P0-3 업로드 권한 등).
 *
 * 형식:  base64url(payload JSON) . base64url(HMAC-SHA256(payloadB64))
 * payload: { p: purpose, iat, exp, n: nonce }
 *
 * 서명 키: APP_SIGNING_SECRET(권장, 서버 전용) — 없으면 서버 전용 시크릿
 * (SUPABASE_SERVICE_ROLE_KEY + ADMIN_PASSWORD)에서 파생. NEXT_PUBLIC_* 는
 * 절대 키 재료로 쓰지 않는다. 키를 만들 수 없으면 fail-closed(null).
 */
export interface SignedPayload {
  p: string;
  iat: number;
  exp: number;
  n: string;
}

export type VerifyResult =
  | { ok: true; payload: SignedPayload }
  | { ok: false; reason: "no_key" | "format" | "signature" | "purpose" | "expired" };

const b64u = (buf: Buffer) => buf.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export function signingKeyFromEnv(
  env: Record<string, string | undefined> = process.env
): Buffer | null {
  if (env.APP_SIGNING_SECRET)
    return crypto.createHash("sha256").update(env.APP_SIGNING_SECRET).digest();
  const parts = [env.SUPABASE_SERVICE_ROLE_KEY, env.ADMIN_PASSWORD];
  if (parts.some((v) => !v)) return null;
  return crypto
    .createHash("sha256")
    .update("invitation-one:signing:" + parts.join(":"))
    .digest();
}

function hmac(key: Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

/** 서명 토큰 발급. ttlSec 동안 유효. 키가 없으면 null (fail-closed) */
export function signToken(
  purpose: string,
  ttlSec: number,
  key: Buffer | null = signingKeyFromEnv(),
  now: number = Date.now()
): string | null {
  if (!key) return null;
  const payload: SignedPayload = {
    p: purpose,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSec,
    n: crypto.randomBytes(12).toString("base64url"),
  };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64u(hmac(key, body))}`;
}

/** 서명·목적·만료 검증 (타이밍 안전 비교) */
export function verifyToken(
  token: unknown,
  purpose: string,
  key: Buffer | null = signingKeyFromEnv(),
  now: number = Date.now()
): VerifyResult {
  if (!key) return { ok: false, reason: "no_key" };
  if (typeof token !== "string" || token.length > 1024) return { ok: false, reason: "format" };
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "format" };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig))
    return { ok: false, reason: "format" };
  const expected = hmac(key, body);
  const given = fromB64u(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected))
    return { ok: false, reason: "signature" };
  let payload: SignedPayload;
  try {
    payload = JSON.parse(fromB64u(body).toString("utf8")) as SignedPayload;
  } catch {
    return { ok: false, reason: "format" };
  }
  if (payload?.p !== purpose || typeof payload.exp !== "number" || typeof payload.n !== "string")
    return { ok: false, reason: "purpose" };
  if (Math.floor(now / 1000) >= payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/** 하객 사진 업로드 토큰 (2시간) */
export const UPLOAD_TOKEN_PURPOSE = "guest-photo-upload";
export const UPLOAD_TOKEN_TTL_SEC = 2 * 60 * 60;
export function issueUploadToken(): string | null {
  return signToken(UPLOAD_TOKEN_PURPOSE, UPLOAD_TOKEN_TTL_SEC);
}
