import { sniffImage, EXT_BY_MIME } from './imageSniff';
import type { GuestPhoto } from './supabase';
type Result = { res: Response; j: { photo?: GuestPhoto; error?: string; code?: string } };
const parse = async (res: Response): Promise<Result> => ({ res, j: await res.json().catch(() => ({})) });
/** Only the small authorization/metadata requests reach Next.js in NAS mode. */
export async function uploadGuestPhoto(fd: FormData, token: string): Promise<Result> {
  const file = fd.get('file');
  if (!(file instanceof File)) throw new Error('사진이 없습니다.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime || bytes.length < 1 || bytes.length > 6 * 1024 * 1024) throw new Error('6MB 이하의 JPG·PNG·WebP·HEIC 사진을 선택해주세요.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
  const api = (body: object) => fetch('/api/guest-photos/direct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }), signal: AbortSignal.timeout(20_000) });
  const prepared = await api({ action: 'prepare', size: bytes.length, ext: EXT_BY_MIME[mime], sha256: hash, name: fd.get('name'), message: fd.get('message') });
  const plan = await prepared.json();
  if (!prepared.ok) return { res: prepared, j: plan };
  if (plan.storage === 'supabase') {
    fd.set('token', token);
    return parse(await fetch('/api/guest-photos', { method: 'POST', body: fd }));
  }
  if (plan.storage !== 'nas' || typeof plan.uploadUrl !== 'string' || !plan.uploadUrl.startsWith('https://') || typeof plan.ticket !== 'string') throw new Error('사진 저장소 설정을 확인해주세요.');
  // A failed NAS request never silently uploads the photo to Supabase instead.
  let uploaded: Response;
  try {
    uploaded = await fetch(plan.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${plan.ticket}`, 'Content-Type': mime }, body: file, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(90_000) });
  } catch { throw new Error('사진 저장소에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'); }
  if (!uploaded.ok) throw new Error('사진을 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
  const { receipt } = await uploaded.json();
  // Retry metadata confirmation with the same receipt, never creating a second photo ID.
  let result: Result | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await parse(await api({ action: 'complete', receipt }));
      if (result.res.status < 500) return result;
    } catch { /* Retry a lost response with the same receipt. */ }
  }
  if (result) return result;
  throw new Error('사진은 전송됐지만 등록 결과를 확인하지 못했어요. 잠시 후 앨범을 확인해주세요.');
}
