import { afterEach, describe, expect, it, vi } from 'vitest';
import { nasPhotoConfig } from '@/lib/nasPhoto';
afterEach(() => vi.unstubAllEnvs());
describe('NAS public routing', () => {
  it('moves the production origin to direct HTTPS and permits an explicit rollback', () => {
    vi.stubEnv('NAS_PHOTO_SECRET', 'test-secret-'.repeat(4));
    vi.stubEnv('NAS_PHOTO_BASE_URL', 'https://bokbok9.tail8b977f.ts.net');
    vi.stubEnv('NAS_PHOTO_PUBLIC_BASE_URL', '');
    expect(nasPhotoConfig().base).toBe('https://bokbok9.synology.me:1018');
    vi.stubEnv('NAS_PHOTO_PUBLIC_BASE_URL', 'https://bokbok9.tail8b977f.ts.net');
    expect(nasPhotoConfig().base).toBe('https://bokbok9.tail8b977f.ts.net');
  });
  it('leaves other installations unchanged and rejects credentials or non-HTTPS overrides', () => {
    vi.stubEnv('NAS_PHOTO_SECRET', 'test-secret-'.repeat(4));
    vi.stubEnv('NAS_PHOTO_BASE_URL', 'https://photos.example.invalid');
    vi.stubEnv('NAS_PHOTO_PUBLIC_BASE_URL', '');
    expect(nasPhotoConfig().base).toBe('https://photos.example.invalid');
    for (const base of ['http://photos.example.invalid', 'https://user:secret@photos.example.invalid', 'https://photos.example.invalid/path']) {
      vi.stubEnv('NAS_PHOTO_PUBLIC_BASE_URL', base);
      expect(() => nasPhotoConfig()).toThrow('HTTPS origin');
    }
  });
});
