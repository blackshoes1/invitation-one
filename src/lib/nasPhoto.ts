import { sign } from '../../ops/nas-upload/protocol.mjs';
import publicOrigins from '../../ops/nas-upload/public-origins.json';
export { sign, verify, MAX_SIZE, PATH_PATTERN } from '../../ops/nas-upload/protocol.mjs';

export function nasPhotoConfig() {
  const base = process.env.NAS_PHOTO_BASE_URL;
  const secret = process.env.NAS_PHOTO_SECRET;
  if (!base || !secret || secret.length < 32) throw new Error('NAS photo configuration missing');
  const configured = new URL(base);
  if (configured.protocol !== 'https:' || configured.username || configured.password || configured.search || configured.hash || configured.pathname !== '/') throw new Error('NAS photo URL must be an HTTPS origin');
  // Keep old photo links working while new traffic uses the verified direct HTTPS route.
  // The explicit override also allows operators to roll back without editing the mapping.
  const mapped = (publicOrigins as Record<string, string>)[configured.origin];
  const url = new URL(process.env.NAS_PHOTO_PUBLIC_BASE_URL || mapped || configured.origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('NAS photo URL must be an HTTPS origin');
  return { base: url.origin, secret };
}

export async function nasPhotoRequest(method: 'HEAD' | 'DELETE', path: string, claims: Record<string, unknown> = {}) {
  const { base, secret } = nasPhotoConfig();
  const token = sign({ ...claims, path }, method === 'HEAD' ? 'stat' : 'delete', secret, 60);
  return fetch(`${base}/photos/${path}`, {
    method, headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error',
  });
}
