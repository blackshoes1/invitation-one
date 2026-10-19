import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), getPublicUrl: vi.fn(), allow: vi.fn(), auth: vi.fn(), single: vi.fn() }));
vi.mock('@/lib/supabaseAdmin', () => ({ isAdminConfigured: true, supabaseAdmin: { from: mocks.from, storage: { from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }) } } }));
vi.mock('@/lib/signedToken', () => ({ verifyToken: mocks.auth, UPLOAD_TOKEN_PURPOSE: 'upload' }));
vi.mock('@/lib/rateLimit', () => ({ rateLimitAllow: mocks.allow, clientIp: () => 'test' }));
import { POST } from '@/app/api/guest-photos/route';
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('GUEST_PHOTO_STORAGE', 'supabase');
  mocks.auth.mockReturnValue({ ok: true, payload: { n: 'owner' } }); mocks.allow.mockResolvedValue(true);
});
function request(name?: string | Blob) {
  const form = new FormData(); form.set('token', 'session');
  form.set('file', new File([new Uint8Array([255,216,255,224])], 'photo.jpg', { type: 'image/jpeg' }));
  if (name !== undefined) form.set('name', name);
  return POST(new Request('https://example.invalid/api/guest-photos', { method: 'POST', body: form }));
}
it.each([undefined, '', ' \t　', new Blob(['Not a name'])])('rejects missing, whitespace or file-valued names without storing a photo (%j)', async name => {
  const response = await request(name);
  expect(response.status).toBe(400); expect((await response.json()).code).toBe('name_required');
  expect(mocks.allow).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
it('stores a trimmed name when a valid photo is uploaded', async () => {
  mocks.upload.mockResolvedValue({ error: null }); mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.invalid/photo' } });
  mocks.single.mockResolvedValue({ data: { id: 'photo', name: '김하객' }, error: null });
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: mocks.single }) }); mocks.from.mockReturnValue({ insert });
  const response = await request('  김하객  ');
  expect(response.status).toBe(200); expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: '김하객' }));
});
