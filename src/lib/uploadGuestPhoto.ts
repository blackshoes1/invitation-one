import { sniffImage, EXT_BY_MIME } from './imageSniff';
import type { GuestPhoto } from './supabase';
export class PhotoUploadError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}
export function photoUploadErrorMessage(error: unknown): string {
  return error instanceof PhotoUploadError
    ? `${error.message} [${error.code}]`
    : '사진을 처리하지 못했어요. 다른 사진으로 다시 시도해주세요. [PHOTO_PROCESS]';
}
function fail(message: string, code: string): never { throw new PhotoUploadError(message, code); }
async function timedFetch(url: string, options: RequestInit, timeout: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
type Result = { res: Response; j: { photo?: GuestPhoto; error?: string; code?: string } };
const parse = async (res: Response): Promise<Result> => ({ res, j: await res.json().catch(() => ({})) });
/** Only the small authorization/metadata requests reach Next.js in NAS mode. */
export async function uploadGuestPhoto(fd: FormData, token: string): Promise<Result> {
  const file = fd.get('file');
  if (!(file instanceof File)) fail('사진이 없습니다.', 'PHOTO_MISSING');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime || bytes.length < 1 || bytes.length > 6 * 1024 * 1024) fail('6MB 이하의 JPG·PNG·WebP·HEIC 사진을 선택해주세요.', 'PHOTO_FORMAT');
  if (!globalThis.crypto?.subtle) fail('보안 연결에서 사진을 올려주세요. HTTPS 청첩장 주소로 다시 열어주세요.', 'PHOTO_CRYPTO');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
  const api = (body: object) => timedFetch('/api/guest-photos/direct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }) }, 20_000);
  const prepared = await api({ action: 'prepare', size: bytes.length, ext: EXT_BY_MIME[mime], sha256: hash, name: fd.get('name'), message: fd.get('message') }).catch(() => fail('업로드 권한을 요청하지 못했어요. 연결을 확인하고 다시 시도해주세요.', 'UPLOAD_PREPARE'));
  const plan = await prepared.json().catch(() => fail('업로드 서버가 올바른 응답을 보내지 않았어요. 새로고침 후 다시 시도해주세요.', `PREPARE_${prepared.status}`));
  if (!plan || typeof plan !== 'object') fail('업로드 서버 응답을 확인하지 못했어요.', 'PREPARE_RESPONSE');
  if (!prepared.ok) return { res: prepared, j: plan };
  if (plan.storage === 'supabase') {
    fd.set('token', token);
    return parse(await fetch('/api/guest-photos', { method: 'POST', body: fd }));
  }
  if (plan.storage !== 'nas' || typeof plan.uploadUrl !== 'string' || !plan.uploadUrl.startsWith('https://') || typeof plan.ticket !== 'string') fail('사진 저장소 설정을 확인해주세요.', 'NAS_CONFIG');
  // A failed NAS request never silently uploads the photo to Supabase instead.
  let uploaded: Response;
  try {
    uploaded = await timedFetch(plan.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${plan.ticket}`, 'Content-Type': mime }, body: file, credentials: 'omit', redirect: 'error' }, 90_000);
  } catch { fail('사진 저장소에 연결하지 못했어요. 접속 주소와 업로드 허용 설정을 확인해주세요.', 'NAS_CONNECT'); }
  if (!uploaded.ok) {
    const message = uploaded.status === 401
      ? '사진 저장소 인증에 실패했어요. 서버와 NAS의 비밀키 및 시간을 확인해주세요.'
      : uploaded.status === 403 ? '현재 청첩장 주소에서 사진 업로드가 허용되지 않았어요.'
      : uploaded.status === 413 ? '사진이 너무 커서 저장소가 거절했어요.'
      : uploaded.status === 404 ? '사진 업로드 주소를 찾지 못했어요. 저장소 주소를 확인해주세요.'
      : '사진 저장소가 업로드를 거절했어요. 잠시 후 다시 시도해주세요.';
    fail(message, `NAS_${uploaded.status}`);
  }
  const confirmation = await uploaded.json().catch(() => fail('사진 저장 완료 응답을 확인하지 못했어요.', 'NAS_RESPONSE'));
  if (!confirmation || typeof confirmation.receipt !== 'string') fail('사진 저장 확인서가 없어요. 저장소 연결을 확인해주세요.', 'NAS_RECEIPT');
  const { receipt } = confirmation;
  // Retry metadata confirmation with the same receipt, never creating a second photo ID.
  let result: Result | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await parse(await api({ action: 'complete', receipt }));
      if (result.res.status < 500) return result;
    } catch { /* Retry a lost response with the same receipt. */ }
  }
  if (result) return result;
  fail('사진은 전송됐지만 등록 결과를 확인하지 못했어요. 잠시 후 앨범을 확인해주세요.', 'PHOTO_COMPLETE');
}
