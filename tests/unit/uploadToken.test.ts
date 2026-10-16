import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ allow: vi.fn(), issue: vi.fn() }));
vi.mock('@/lib/supabaseAdmin', () => ({ isAdminConfigured: true }));
vi.mock('@/lib/privacy', () => ({ collectionGuard: () => null }));
vi.mock('@/lib/signedToken', () => ({ issueUploadToken: mocks.issue, UPLOAD_TOKEN_TTL_SEC: 7200 }));
vi.mock('@/lib/rateLimit', () => ({ clientIp: () => 'venue-wifi', rateLimitAllow: mocks.allow }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_INVITATION_KEY', 'test-invitation');
  mocks.issue.mockReturnValue('session-token');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('upload token refresh on venue Wi-Fi', () => {
  it('allows 60 guests on one IP to refresh without removing the shared rate limit', async () => {
    let hits = 0;
    mocks.allow.mockImplementation((_key, limit) => Promise.resolve(++hits <= limit));
    const { GET } = await import('@/app/api/guest-photos/token/route');
    const responses = await Promise.all(Array.from({ length: 60 }, () => GET(new Request('https://example.invalid/api/guest-photos/token?key=test-invitation'))));
    expect(responses.every(res => res.status === 200)).toBe(true);
    expect(mocks.allow).toHaveBeenCalledWith('upload-token:venue-wifi', 300, 600);
  });
  it('still rejects a wrong invitation key or exhausted refresh quota', async () => {
    const { GET } = await import('@/app/api/guest-photos/token/route');
    expect((await GET(new Request('https://example.invalid/api/guest-photos/token?key=wrong'))).status).toBe(403);
    expect(mocks.allow).not.toHaveBeenCalled();
    mocks.allow.mockResolvedValue(false);
    expect((await GET(new Request('https://example.invalid/api/guest-photos/token?key=test-invitation'))).status).toBe(429);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
