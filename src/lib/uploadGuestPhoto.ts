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
export type PhotoUploadStage = 'sending' | 'waiting' | 'confirming';
type RetryOptions = { attempts: number; timeout: number; budget: number; retry429?: boolean; onRetry?: () => void };
/** Bound retries, spread competing guests out, and honor the NAS's Retry-After. */
async function retryJson<T extends object>(url: string, options: RequestInit, retry: RetryOptions) {
  const deadline = Date.now() + retry.budget;
  let last: { res: Response; j: T | undefined } | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < retry.attempts && Date.now() < deadline; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(retry.timeout, deadline - Date.now()));
    let response: Response | undefined;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
      const body: unknown = await response.json().catch(() => undefined);
      last = { res: response, j: body && typeof body === 'object' && !Array.isArray(body) ? body as T : undefined };
      const transient = response.status === 408 || response.status === 425 || response.status >= 500 || (retry.retry429 && response.status === 429);
      if (!transient && !(response.ok && !last.j)) return last;
    } catch (error) { lastError = error; }
    finally { clearTimeout(timer); }
    if (attempt + 1 === retry.attempts) break;
    const header = response?.headers.get('Retry-After');
    const retryAfter = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
    const backoff = Math.min(10_000, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
    const wait = Math.max(backoff, Number.isFinite(retryAfter) ? retryAfter : 0);
    if (Date.now() + wait >= deadline) break;
    retry.onRetry?.();
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  if (last) return last;
  throw lastError ?? new Error('Photo request timed out');
}
type Result = { res: Response; j: { photo?: GuestPhoto; error?: string; code?: string } };
const parse = async (res: Response): Promise<Result> => ({ res, j: await res.json().catch(() => ({})) });
type NasReply = { receipt?: string; state?: string; lease?: string };
/** Keep public relay connections short while queued; only send bytes with a live slot. */
async function admittedUpload(plan: { uploadUrl: string; admissionUrl: string; ticket: string }, file: File, mime: string, onStage?: (stage: PhotoUploadStage) => void) {
  const deadline = Date.now() + 25 * 60_000;
  const headers = { Authorization: `Bearer ${plan.ticket}` };
  const request = (url: string, options: RequestInit, timeout: number) => retryJson<NasReply>(url,
    { ...options, credentials: 'omit', redirect: 'error', cache: 'no-store' },
    { attempts: 1, timeout, budget: Math.max(1, deadline - Date.now()) });
  while (Date.now() < deadline) {
    let delay = 2000;
    try {
      const slot = await request(plan.admissionUrl, { headers }, 20_000);
      if (!slot.res.ok) {
        if (slot.res.status < 500 && ![408, 425, 429].includes(slot.res.status)) return slot;
      } else if (slot.j?.state === 'stored' && slot.j.receipt) {
        return slot;
      } else if (slot.j?.state === 'ready' && typeof slot.j.lease === 'string') {
        onStage?.('sending');
        const sent = await request(plan.uploadUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': mime, 'X-Upload-Lease': slot.j.lease }, body: file }, 300_000);
        if (sent.res.ok && sent.j?.receipt) return sent;
        if (!sent.res.ok && sent.res.status < 500 && ![408, 425, 429].includes(sent.res.status)) return sent;
        // Query storage again first if the response was lost; never blindly resend.
      }
      const seconds = Number(slot.res.headers.get('Retry-After'));
      if (Number.isFinite(seconds) && seconds > 0) delay = Math.min(30_000, seconds * 1000);
    } catch { /* A public relay interruption does not discard this photo's place or ID. */ }
    onStage?.('waiting');
    await new Promise(resolve => setTimeout(resolve, Math.min(delay * (1 + Math.random() * .2), Math.max(1, deadline - Date.now()))));
  }
  fail('업로드 대기 시간이 길어졌어요. 연결을 확인하고 다시 시도해주세요.', 'NAS_WAIT_TIMEOUT');
}
/** Only the small authorization/metadata requests reach Next.js in NAS mode. */
export async function uploadGuestPhoto(fd: FormData, token: string, onStage?: (stage: PhotoUploadStage) => void): Promise<Result> {
  const file = fd.get('file');
  if (!(file instanceof File)) fail('사진이 없습니다.', 'PHOTO_MISSING');
  if (file.size < 1 || file.size > 20 * 1024 * 1024) fail('한 장당 20MB 이하의 사진을 선택해주세요.', 'PHOTO_SIZE');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime || bytes.length < 1 || bytes.length > 20 * 1024 * 1024) fail('20MB 이하의 JPG·PNG·WebP·HEIC 사진을 선택해주세요.', 'PHOTO_FORMAT');
  if (!globalThis.crypto?.subtle) fail('보안 연결에서 사진을 올려주세요. HTTPS 청첩장 주소로 다시 열어주세요.', 'PHOTO_CRYPTO');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
  const onRetry = () => onStage?.('waiting');
  const api = <T extends object>(body: object, attempts: number) => retryJson<T>('/api/guest-photos/direct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }) }, { attempts, timeout: 20_000, budget: 90_000, onRetry });
  const { res: prepared, j: plan } = await api<Result['j'] & { storage?: string; uploadUrl?: string; admissionUrl?: string; ticket?: string }>({ action: 'prepare', size: bytes.length, ext: EXT_BY_MIME[mime], sha256: hash, name: fd.get('name'), message: fd.get('message') }, 3).catch(() => fail('업로드 권한을 요청하지 못했어요. 연결을 확인하고 다시 시도해주세요.', 'UPLOAD_PREPARE'));
  if (!plan) fail('업로드 서버가 올바른 응답을 보내지 않았어요. 새로고침 후 다시 시도해주세요.', `PREPARE_${prepared.status}`);
  if (!prepared.ok) return { res: prepared, j: plan };
  if (plan.storage === 'supabase') {
    fd.set('token', token);
    return parse(await fetch('/api/guest-photos', { method: 'POST', body: fd }));
  }
  if (plan.storage !== 'nas' || typeof plan.uploadUrl !== 'string' || !plan.uploadUrl.startsWith('https://') || typeof plan.ticket !== 'string') fail('사진 저장소가 준비되지 않았어요. 잠시 후 다시 시도해주세요.', 'NAS_CONFIG');
  // A failed NAS request never silently uploads the photo to Supabase instead.
  let upload: { res: Response; j: { receipt?: string } | undefined };
  try {
    onStage?.('sending');
    // Reuse the exact URL, permission and bytes even if a saved response was lost.
    // Eight minutes leaves time before the ten-minute permission expires.
    if (plan.admissionUrl !== undefined) {
      if (plan.admissionUrl !== `${plan.uploadUrl}?admission=1`) fail('사진 대기 주소가 올바르지 않아요.', 'NAS_CONFIG');
      upload = await admittedUpload({ uploadUrl: plan.uploadUrl, admissionUrl: plan.admissionUrl, ticket: plan.ticket }, file, mime, onStage);
    } else {
      upload = await retryJson<{ receipt?: string }>(plan.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${plan.ticket}`, 'Content-Type': mime }, body: file, credentials: 'omit', redirect: 'error' }, { attempts: 12, timeout: 300_000, budget: 480_000, retry429: true, onRetry });
    }
  } catch (error) {
    if (error instanceof PhotoUploadError) throw error;
    fail('사진 저장소에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', 'NAS_CONNECT');
  }
  const uploaded = upload.res;
  if (!uploaded.ok) {
    const message = uploaded.status === 401
      ? '사진 저장소 인증에 실패했어요. 관리자에게 문의해주세요.'
      : uploaded.status === 403 ? '현재 청첩장 주소에서 사진 업로드가 허용되지 않았어요.'
      : uploaded.status === 413 ? '사진이 너무 커서 저장소가 거절했어요.'
      : uploaded.status === 404 ? '사진 업로드 주소를 찾지 못했어요. 관리자에게 문의해주세요.'
      : '사진 저장소가 업로드를 거절했어요. 잠시 후 다시 시도해주세요.';
    fail(message, `NAS_${uploaded.status}`);
  }
  const confirmation = upload.j;
  if (!confirmation) fail('사진 저장 완료 응답을 확인하지 못했어요.', 'NAS_RESPONSE');
  if (!confirmation || typeof confirmation.receipt !== 'string') fail('사진 저장 완료를 확인하지 못했어요. 잠시 후 앨범을 확인해주세요.', 'NAS_RECEIPT');
  const { receipt } = confirmation;
  onStage?.('confirming');
  // Retry metadata confirmation with the same receipt, never uploading again.
  const result = await api<Result['j']>({ action: 'complete', receipt }, 5).catch(() => fail('사진은 전송됐지만 등록 결과를 확인하지 못했어요. 잠시 후 앨범을 확인해주세요.', 'PHOTO_COMPLETE'));
  return { res: result.res, j: result.j ?? {} };
}
