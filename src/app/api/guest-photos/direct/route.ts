import { collectionGuard } from "@/lib/privacy";
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { verifyToken, UPLOAD_TOKEN_PURPOSE } from '@/lib/signedToken';
import { rateLimitAllow, clientIp } from '@/lib/rateLimit';
import { nasPhotoConfig, nasPhotoRequest, sign, verify, MAX_SIZE, PATH_PATTERN } from '@/lib/nasPhoto';

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(req: Request) {
  const closed = collectionGuard();
  if (closed) return closed;
  let input;
  try {
    const text = await req.text();
    if (text.length > 8192) return reply({ error: '요청이 너무 큽니다.' }, 413);
    input = JSON.parse(text);
    if (!input || typeof input !== 'object') throw new Error('invalid');
  } catch { return reply({ error: '잘못된 요청입니다.' }, 400); }
  if (!isAdminConfigured || !supabaseAdmin) return reply({ error: '서버 설정이 필요합니다.' }, 503);
  const auth = verifyToken(input.token, UPLOAD_TOKEN_PURPOSE);
  if (!auth.ok) return reply({ error: '청첩장을 새로고침 해주세요.', code: auth.reason === 'expired' ? 'token_expired' : 'token_invalid' }, auth.reason === 'no_key' ? 503 : 401);
  // Legacy behavior is explicitly selected before any file bytes leave the browser.
  if (process.env.GUEST_PHOTO_STORAGE !== 'nas') return reply({ storage: 'supabase' });
  let config;
  try { config = nasPhotoConfig(); }
  catch { return reply({ error: '사진 저장소 연결 설정이 필요합니다.' }, 503); }
  if (input.action === 'prepare') {
    if (auth.payload.exp < Date.now() / 1000 + 1860) return reply({ error: '업로드 권한을 갱신해주세요.', code: 'token_expired' }, 401);
    if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_SIZE || !/^[a-f0-9]{64}$/.test(input.sha256) || !['jpg','png','webp','heic'].includes(input.ext)) return reply({ error: '20MB 이하의 올바른 사진을 선택해주세요.' }, 400);
    const allowed = await Promise.all([
      rateLimitAllow(`upload:tok:${auth.payload.n}`, 30, 600),
      // Up to 100 guests sharing venue Wi-Fi, each using their 30-photo session quota.
      rateLimitAllow(`upload:ip:${clientIp(req)}`, 3000, 600),
    ]);
    if (allowed.some(v => !v)) return reply({ error: '잠시 후 다시 시도해주세요.', code: 'rate_limited' }, 429);
    const id = crypto.randomUUID();
    const path = `snap/${id}.${input.ext}`;
    const ticket = sign({ id, path, admission: 2, size: input.size, sha256: input.sha256, owner: auth.payload.n,
      name: String(input.name ?? '').trim().slice(0, 40) || null,
      message: String(input.message ?? '').trim().slice(0, 200) || null,
    }, 'upload', config.secret, 1800);
    return reply({ storage: 'nas', uploadUrl: `${config.base}/photos/${path}`, admissionUrl: `${config.base}/photos/${path}?admission=1`, ticket });
  }
  if (input.action !== 'complete') return reply({ error: '잘못된 요청입니다.' }, 400);
  const receipt = verify(input.receipt, 'receipt', config.secret);
  if (!receipt || receipt.owner !== auth.payload.n || typeof receipt.path !== 'string' || !PATH_PATTERN.test(receipt.path) || typeof receipt.id !== 'string' || !receipt.path.startsWith(`snap/${receipt.id}.`)) return reply({ error: '사진 저장 확인이 필요합니다.' }, 401);
  if (!await rateLimitAllow(`upload:complete:${auth.payload.n}`, 180, 600)) return reply({ error: '잠시 후 다시 시도해주세요.' }, 429);
  try {
    const stored = await nasPhotoRequest('HEAD', receipt.path, receipt);
    if (!stored.ok) return reply({ error: 'NAS에서 사진을 확인하지 못했어요. 다시 시도해주세요.' }, 502);
  } catch { return reply({ error: '사진 저장소에 연결하지 못했어요. 잠시 후 다시 시도해주세요.' }, 502); }
  // The ticket ID is the existing primary key: duplicate completion cannot create duplicate rows or undo moderation.
  const { error } = await supabaseAdmin.from('guest_photos').upsert({
    id: receipt.id, path: `nas:${receipt.path}`, url: `${config.base}/photos/${receipt.path}`,
    name: receipt.name, message: receipt.message,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return reply({ error: '사진은 저장됐지만 등록하지 못했어요. 다시 시도해주세요.' }, 503);
  const { data, error: readError } = await supabaseAdmin.from('guest_photos').select('id, url, name, message, created_at').eq('id', receipt.id).single();
  if (readError) return reply({ error: '사진 등록 결과를 확인하지 못했어요.' }, 503);
  return reply({ photo: data });
}
