import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadGuestPhoto, photoUploadErrorMessage } from '@/lib/uploadGuestPhoto';
const request = vi.fn();
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const form = () => { const fd = new FormData(); fd.set('file', new File([new Uint8Array([255,216,255,224])], 'photo.jpg', { type: 'image/jpeg' })); return fd; };
beforeEach(() => {
  request.mockReset();
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function settle<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  const result = await outcome;
  if ('error' in result) throw result.error;
  return result.value;
}
describe('browser NAS photo flow', () => {
  it('waits without sending bytes and recovers a saved file after losing its PUT response', async () => {
    const stage = vi.fn();
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', admissionUrl: 'https://nas.invalid/photo?admission=1', ticket: 'ticket' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'waiting' }), { status: 202, headers: { 'Retry-After': '12' } }))
      .mockResolvedValueOnce(json({ state: 'ready', lease: 'lease' }))
      .mockRejectedValueOnce(new Error('saved but response lost'))
      .mockResolvedValueOnce(json({ state: 'stored', receipt: 'receipt' }))
      .mockResolvedValueOnce(json({ photo: { id: 'saved' } }));
    const start = Date.now();
    expect((await settle(uploadGuestPhoto(form(), 'session', stage))).j.photo?.id).toBe('saved');
    expect(Date.now() - start).toBeGreaterThanOrEqual(12_000);
    const puts = request.mock.calls.filter(c => c[1].method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0][1].headers['X-Upload-Lease']).toBe('lease');
    expect(request.mock.calls[1][1].body).toBeUndefined();
    expect(stage).toHaveBeenCalledWith('waiting');
  });
  it('bounds admission waiting without sending any original bytes', async () => {
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', admissionUrl: 'https://nas.invalid/photo?admission=1', ticket: 'ticket' }))
      .mockResolvedValue(json({ state: 'waiting' }, 202));
    await expect(settle(uploadGuestPhoto(form(), 'session'))).rejects.toThrow('대기 시간이 길어졌어요');
    expect(request.mock.calls.some(c => c[1].method === 'PUT')).toBe(false);
  });
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
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'ticket' })).mockRejectedValue(new Error('offline'));
    await expect(settle(uploadGuestPhoto(form(), 'session'))).rejects.toThrow('연결하지 못했어요');
    expect(request).toHaveBeenCalledTimes(13);
    expect(request.mock.calls.slice(1).every(c => c[1].method === 'PUT')).toBe(true);
  });
  it('retries only completion after a lost response', async () => {
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'ticket' }))
      .mockResolvedValueOnce(json({ receipt: 'receipt' })).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(json({ photo: { id: 'saved' } }));
    await settle(uploadGuestPhoto(form(), 'session'));
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
    request.mockResolvedValueOnce(json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'ticket' })).mockRejectedValue(new Error('offline'));
    const error = await settle(uploadGuestPhoto(form(), 'session')).catch(e => e);
    expect(photoUploadErrorMessage(error)).toContain('[NAS_CONNECT]');
  });
  it('identifies a non-JSON preparation response', async () => {
    request.mockImplementation(() => Promise.resolve(new Response('<html>gateway</html>', { status: 502 })));
    const error = await settle(uploadGuestPhoto(form(), 'session')).catch(e => e);
    expect(photoUploadErrorMessage(error)).toContain('[PREPARE_502]');
  });
  it('keeps unexpected exception internals out of the public UI', () => {
    expect(photoUploadErrorMessage(new Error('secret=value'))).toContain('[PHOTO_PROCESS]');
    expect(photoUploadErrorMessage(new Error('secret=value'))).not.toContain('secret');
  });
});

describe('queued NAS retries', () => {
  const plan = () => json({ storage: 'nas', uploadUrl: 'https://nas.invalid/photo', ticket: 'same-ticket' });
  it('recovers from overload, disconnection and a lost receipt using the same photo permission', async () => {
    const stage = vi.fn();
    request.mockResolvedValueOnce(plan())
      .mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'Retry-After': '3' } }))
      .mockResolvedValueOnce(json({}, 429))
      .mockRejectedValueOnce(new Error('connection lost after saving'))
      .mockResolvedValueOnce(new Response('truncated receipt'))
      .mockResolvedValueOnce(json({ receipt: 'same-receipt' }))
      .mockResolvedValueOnce(json({ photo: { id: 'one-photo' } }));
    const started = Date.now();
    expect((await settle(uploadGuestPhoto(form(), 'session', stage))).j.photo?.id).toBe('one-photo');
    const puts = request.mock.calls.filter(c => c[1].method === 'PUT');
    expect(puts).toHaveLength(5);
    expect(puts.every(c => c[0] === puts[0][0] && c[1].body === puts[0][1].body && c[1].headers.Authorization === 'Bearer same-ticket')).toBe(true);
    expect(request.mock.calls.filter(c => c[1].method === 'POST')).toHaveLength(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(17_000);
    expect(stage.mock.calls.filter(c => c[0] === 'waiting')).toHaveLength(4);
    expect(stage).toHaveBeenLastCalledWith('confirming');
  });
  it.each([400, 401, 403, 404, 409, 410, 413])('does not retry permanent NAS rejection %i', async status => {
    request.mockResolvedValueOnce(plan()).mockResolvedValueOnce(json({}, status));
    await expect(uploadGuestPhoto(form(), 'session')).rejects.toMatchObject({ code: `NAS_${status}` });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not retry or consume more preparation quota after a real rate limit', async () => {
    request.mockResolvedValueOnce(json({ code: 'rate_limited' }, 429));
    expect((await uploadGuestPhoto(form(), 'session')).res.status).toBe(429);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retries preparation before any bytes leave the browser', async () => {
    request.mockRejectedValueOnce(new Error('lost prepare response')).mockResolvedValueOnce(plan())
      .mockResolvedValueOnce(json({ receipt: 'receipt' })).mockResolvedValueOnce(json({ photo: { id: 'saved' } }));
    expect((await settle(uploadGuestPhoto(form(), 'session'))).j.photo?.id).toBe('saved');
    expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body);
    expect(request.mock.calls.filter(c => c[1].method === 'PUT')).toHaveLength(1);
  });
  it('backs off on completion overload without retransmitting the photo', async () => {
    request.mockResolvedValueOnce(plan()).mockResolvedValueOnce(json({ receipt: 'receipt' }))
      .mockResolvedValueOnce(json({}, 503)).mockRejectedValueOnce(new Error('lost confirmation'))
      .mockResolvedValueOnce(json({ photo: { id: 'saved' } }));
    expect((await settle(uploadGuestPhoto(form(), 'session'))).j.photo?.id).toBe('saved');
    expect(request.mock.calls.filter(c => c[1].method === 'PUT')).toHaveLength(1);
    expect(new Set(request.mock.calls.slice(2).map(c => c[1].body)).size).toBe(1);
  });
  it('stops before the permission expires even if every transfer times out', async () => {
    request.mockResolvedValueOnce(plan()).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }));
    const started = Date.now();
    await expect(settle(uploadGuestPhoto(form(), 'session'))).rejects.toMatchObject({ code: 'NAS_CONNECT' });
    expect(Date.now() - started).toBe(480_000);
    expect(request.mock.calls.filter(c => c[1].method === 'PUT')).toHaveLength(2);
  });
});
