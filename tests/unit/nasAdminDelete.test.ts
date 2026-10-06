import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), remove: vi.fn(), nas: vi.fn() }));
vi.mock('@/lib/adminAuth', () => ({ adminGuard: async () => null }));
vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from, storage: { from: () => ({ remove: mocks.remove }) } } }));
vi.mock('@/lib/nasPhoto', () => ({ nasPhotoRequest: mocks.nas, PATH_PATTERN: /^snap\/[a-z0-9-]+\.jpg$/ }));
import { DELETE } from '@/app/api/admin/guest-photos/route';
const call = () => DELETE(new Request('https://example.invalid/api/admin/guest-photos?id=test'));
function row(path: string) {
  const q = { select: vi.fn(), eq: vi.fn(), single: vi.fn().mockResolvedValue({ data: { path } }) };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); return q;
}
beforeEach(() => vi.clearAllMocks());
describe('NAS administrator deletion', () => {
  it('keeps metadata when NAS deletion fails', async () => {
    mocks.from.mockReturnValue(row('nas:snap/photo.jpg'));
    mocks.nas.mockRejectedValue(new Error('offline'));
    expect((await call()).status).toBe(502);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('deletes from the correct backend before removing NAS metadata', async () => {
    mocks.from.mockReturnValueOnce(row('nas:snap/photo.jpg')).mockReturnValueOnce({ delete: () => ({ eq: async () => ({ error: null }) }) });
    mocks.nas.mockResolvedValue(new Response(null, { status: 200 }));
    expect((await call()).status).toBe(200);
    expect(mocks.nas).toHaveBeenCalledWith('DELETE', 'snap/photo.jpg');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('preserves deletion of existing Supabase files', async () => {
    mocks.from.mockReturnValueOnce(row('snap/old.jpg')).mockReturnValueOnce({ delete: () => ({ eq: async () => ({ error: null }) }) });
    mocks.remove.mockResolvedValue({ error: null });
    expect((await call()).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(['snap/old.jpg']);
    expect(mocks.nas).not.toHaveBeenCalled();
  });
});
