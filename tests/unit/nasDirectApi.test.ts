import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), auth: vi.fn(), allow: vi.fn(), fetch: vi.fn(), storage: vi.fn() }));
vi.mock('@/lib/supabaseAdmin', () => ({ isAdminConfigured: true, supabaseAdmin: { from: mocks.from, storage: mocks.storage } }));
vi.mock('@/lib/signedToken', () => ({ verifyToken: mocks.auth, UPLOAD_TOKEN_PURPOSE: 'upload' }));
vi.mock('@/lib/rateLimit', () => ({ rateLimitAllow: mocks.allow, clientIp: () => 'test' }));
import { POST } from '@/app/api/guest-photos/direct/route';
import { sign, verify } from '@/lib/nasPhoto';
const secret = 'test-only-secret-'.repeat(4);
const req = (body: object) => POST(new Request('https://example.invalid/api/guest-photos/direct', { method: 'POST', body: JSON.stringify({ token: 'session', ...body }) }));
const prepare = { action: 'prepare', size: 100, sha256: 'a'.repeat(64), ext: 'jpg', name: '하객', message: '축하해요' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GUEST_PHOTO_STORAGE', 'nas');
  vi.stubEnv('NAS_PHOTO_BASE_URL', 'https://photos.example.invalid');
  vi.stubEnv('NAS_PHOTO_SECRET', secret);
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.auth.mockReturnValue({ ok: true, payload: { n: 'owner', exp: Date.now() / 1000 + 7200 } });
  mocks.allow.mockResolvedValue(true);
});
async function receipt() {
  const plan = await (await req(prepare)).json();
  return sign(verify(plan.ticket, 'upload', secret)!, 'receipt', secret);
}
describe('NAS direct photo API', () => {
  it('issues scoped tickets without uploading bytes or inserting metadata', async () => {
    const response = await req(prepare);
    const plan = await response.json();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(plan.uploadUrl).toMatch(/^https:\/\/photos.example.invalid\/photos\/snap\//);
    expect(verify(plan.ticket, 'upload', secret)).toMatchObject({ owner: 'owner', size: 100, name: '하객' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it('accepts original photos up to 20MB', async () => {
    expect((await req({ ...prepare, size: 20 * 1024 * 1024 })).status).toBe(200);
  });
  it('rejects missing permission, oversized files and rate limits', async () => {
    mocks.auth.mockReturnValueOnce({ ok: false, reason: 'expired' });
    expect((await req(prepare)).status).toBe(401);
    expect((await req({ ...prepare, size: 21 * 1024 * 1024 })).status).toBe(400);
    mocks.allow.mockResolvedValue(false);
    expect((await req(prepare)).status).toBe(429);
  });
  it('fails closed on missing NAS configuration and explicitly selects legacy mode only when disabled', async () => {
    vi.stubEnv('NAS_PHOTO_SECRET', '');
    expect((await req(prepare)).status).toBe(503);
    vi.stubEnv('GUEST_PHOTO_STORAGE', 'supabase');
    expect(await (await req(prepare)).json()).toEqual({ storage: 'supabase' });
  });
  it('rejects forged receipts and cross-session completion', async () => {
    expect((await req({ action: 'complete', receipt: 'forged' })).status).toBe(401);
    const proof = await receipt();
    mocks.auth.mockReturnValue({ ok: true, payload: { n: 'other' } });
    expect((await req({ action: 'complete', receipt: proof })).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not register missing or unreachable NAS files', async () => {
    const proof = await receipt();
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 404 })).mockRejectedValueOnce(new Error('offline'));
    expect((await req({ action: 'complete', receipt: proof })).status).toBe(502);
    expect((await req({ action: 'complete', receipt: proof })).status).toBe(502);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('confirms NAS contents then inserts idempotently without changing existing moderation', async () => {
    const proof = await receipt();
    const claims = verify(proof, 'receipt', secret)!;
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const select = vi.fn(); const eq = vi.fn();
    const q = { select, eq, single: vi.fn().mockResolvedValue({ data: { id: claims.id }, error: null }) };
    select.mockReturnValue(q); eq.mockReturnValue(q);
    mocks.from.mockReturnValueOnce({ upsert }).mockReturnValueOnce(q);
    expect((await req({ action: 'complete', receipt: proof, name: 'forged' })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: claims.id, name: '하객', path: `nas:${claims.path}` }), { onConflict: 'id', ignoreDuplicates: true });
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});
