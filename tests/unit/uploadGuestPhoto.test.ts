import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadGuestPhoto, photoUploadErrorMessage } from '@/lib/uploadGuestPhoto';
const request = vi.fn();
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const form = () => { const fd = new FormData(); fd.set('file', new File([new Uint8Array([255,216,255,224])], 'photo.jpg', { type: 'image/jpeg' })); return fd; };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', request); });
describe('browser NAS photo flow', () => {
  it('sends bytes only to NAS and confirms metadata separately', async () => {
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photos/snap/photo.jpg', ticket: 'ticket' }))
      .mockResolvedValueOnce(json({ receipt: 'receipt' })).mockResolvedValueOnce(json({ photo: { id: 'saved' } }));
    expect((await uploadGuestPhoto(form(), 'session')).j.photo?.id).toBe('saved');
    expect(request.mock.calls[0][0]).toBe('/api/guest-photos/direct');
    expect(typeof request.mock.calls[0][1].body).toBe('string');
    expect(request.mock.calls[1][1].body).toBeInstanceOf(File);
    expect(request.mock.calls[1][0]).toBe('https://nas.invalid/photos/snap/photo.jpg');
    expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({ action: 'complete', receipt: 'receipt', token: 'session' });
  });
  it('never falls back to Supabase when NAS is offline', async () => {
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'ticket' })).mockRejectedValueOnce(new Error('offline'));
    await expect(uploadGuestPhoto(form(), 'session')).rejects.toThrow('연결하지 못했어요');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('retries only completion after a lost response', async () => {
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'ticket' }))
      .mockResolvedValueOnce(json({ receipt: 'receipt' })).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(json({ photo: { id: 'saved' } }));
    await uploadGuestPhoto(form(), 'session');
    expect(request.mock.calls.filter(c => c[1].method === 'PUT')).toHaveLength(1);
    expect(request.mock.calls[2][1].body).toBe(request.mock.calls[3][1].body);
  });
  it('uses legacy upload only when explicitly selected by the server', async () => {
    request.mockResolvedValueOnce(json({ storage: 'supabase' })).mockResolvedValueOnce(json({ photo: { id: 'old' } }));
    await uploadGuestPhoto(form(), 'session');
    expect(request.mock.calls[1][0]).toBe('/api/guest-photos');
    expect(request.mock.calls[1][1].body).toBeInstanceOf(FormData);
  });
});


describe('photo upload error details', () => {
  it('shows NAS authentication rejection without exposing raw response contents', async () => {
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'ticket' }))
      .mockResolvedValueOnce(json({ error: 'private response' }, 401));
    const error = await uploadGuestPhoto(form(), 'session').catch(e => e);
    expect(photoUploadErrorMessage(error)).toContain('[NAS_401]');
    expect(photoUploadErrorMessage(error)).toContain('인증');
    expect(photoUploadErrorMessage(error)).not.toContain('private response');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('labels a failed connection instead of hiding it behind the generic message', async () => {
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'ticket' })).mockRejectedValueOnce(new Error('offline'));
    const error = await uploadGuestPhoto(form(), 'session').catch(e => e);
    expect(photoUploadErrorMessage(error)).toContain('[NAS_CONNECT]');
  });
  it('identifies a non-JSON preparation response', async () => {
    request.mockResolvedValueOnce(new Response('<html>gateway</html>', { status: 502 }));
    const error = await uploadGuestPhoto(form(), 'session').catch(e => e);
    expect(photoUploadErrorMessage(error)).toContain('[PREPARE_502]');
  });
  it('keeps unexpected exception internals out of the public UI', () => {
    expect(photoUploadErrorMessage(new Error('secret=value'))).toContain('[PHOTO_PROCESS]');
    expect(photoUploadErrorMessage(new Error('secret=value'))).not.toContain('secret');
  });
});
