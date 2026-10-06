import { sign } from '../../ops/nas-upload/protocol.mjs';
export { sign, verify, MAX_SIZE, PATH_PATTERN } from '../../ops/nas-upload/protocol.mjs';

export function nasPhotoConfig() {
  const base = process.env.NAS_PHOTO_BASE_URL;
  const secret = process.env.NAS_PHOTO_SECRET;
  if (!base || !secret || secret.length < 32) throw new Error('NAS photo configuration missing');
  const url = new URL(base);
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
