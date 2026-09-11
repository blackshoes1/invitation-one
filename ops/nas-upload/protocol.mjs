import { createHmac, timingSafeEqual } from 'node:crypto';
export const MAX_SIZE = 6 * 1024 * 1024;
export const PATH_PATTERN = /^snap\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|heic)$/;
/** @param {Record<string, unknown>} claims @param {string} purpose @param {string} secret @param {number} ttl */
export function sign(claims, purpose, secret, ttl = 600) {
  if (secret.length < 32) throw new Error('NAS secret must be at least 32 characters');
  const body = Buffer.from(JSON.stringify({ ...claims, purpose, exp: Math.floor(Date.now() / 1000) + ttl })).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
/** @param {unknown} token @param {string} purpose @param {string} secret @returns {Record<string, unknown> | null} */
export function verify(token, purpose, secret) {
  if (secret.length < 32 || typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!claims || claims.purpose !== purpose || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000) return null;
    return claims;
  } catch { return null; }
}
/** @param {Uint8Array} b */
export function sniff(b) {
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (b.length >= 8 && Buffer.from(b.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  const s = Buffer.from(b.subarray(0, 12)).toString('ascii');
  if (s.startsWith('RIFF') && s.slice(8) === 'WEBP') return 'webp';
  if (s.slice(4, 8) === 'ftyp' && ['heic','heix','hevc','hevx','mif1','msf1','heim','heis'].includes(s.slice(8))) return 'heic';
  return null;
}
