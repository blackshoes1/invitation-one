import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createPhotoServer } from './server.mjs';
import { sign, verify } from './protocol.mjs';

async function removeTestFolder(root) {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.match(basename(root), /^nas-direct-/);
  await rm(root, { recursive: true, force: true });
}

test('direct NAS upload: permissions, validation, idempotency, serving and deletion replay protection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nas-direct-'));
  const secret = 'test-only-secret-'.repeat(4);
  const server = await createPhotoServer({ root, secret, origins: ['https://example.invalid'] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Larger than the previous 6MB limit; opaque payload must survive byte-for-byte.
  const bytes = Buffer.concat([Buffer.from([255, 216, 255, 224, 1, 2, 3]), Buffer.alloc(7 * 1024 * 1024, 0x34)]);
  const id = randomUUID();
  const path = `snap/${id}.jpg`;
  const claims = { id, path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const url = `${base}/photos/${path}`;
  const upload = (ticket, body = bytes, origin = 'https://example.invalid') => fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${ticket}`, Origin: origin }, body });
  const ticket = sign(claims, 'upload', secret);
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await upload('forged')).status, 401);
    assert.equal((await upload(sign(claims, 'upload', secret, -1))).status, 401);
    assert.equal((await upload(ticket, bytes, 'https://evil.invalid')).status, 403);
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://example.invalid' } });
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://example.invalid');
    assert.equal((await upload(ticket, Buffer.from('bad'))).status, 400);
    const wrong = sign({ ...claims, sha256: '0'.repeat(64) }, 'upload', secret);
    assert.equal((await upload(wrong)).status, 400);
    const invalid = Buffer.from('not-a-photo');
    assert.equal((await upload(sign({ ...claims, size: invalid.length, sha256: createHash('sha256').update(invalid).digest('hex') }, 'upload', secret), invalid)).status, 400);
    const first = await upload(ticket);
    assert.equal(first.status, 200);
    const receipt = (await first.json()).receipt;
    assert.equal(verify(receipt, 'receipt', secret).path, path);
    assert.equal(verify(receipt, 'upload', secret), null);
    assert.deepEqual(await readFile(join(root, path)), bytes);
    assert.equal((await upload(ticket)).status, 200);
    assert.equal((await fetch(url, { method: 'HEAD', headers: { Authorization: `Bearer ${sign(claims, 'stat', secret)}` } })).status, 200);
    assert.equal((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${ticket}` } })).status, 401);
    const photo = await fetch(url);
    assert.equal(photo.headers.get('Content-Type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), bytes);
    assert.equal((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${sign({ path }, 'delete', secret)}` } })).status, 200);
    assert.equal((await fetch(url)).status, 410);
    assert.equal((await upload(ticket)).status, 410);
    assert.equal((await fetch(`${base}/photos/other.txt`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await removeTestFolder(root);
  }
});

async function setup(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'nas-direct-'));
  const secret = 'queue-test-only-secret-'.repeat(3);
  const origin = 'https://example.invalid';
  const server = await createPhotoServer({ root, secret, origins: [origin], ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const held = [];
  t.after(async () => {
    held.forEach(req => req.destroy());
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await removeTestFolder(root);
  });
  const bytes = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(1024 * 1024, 0x34)]);
  const plan = (ttl = 600) => {
    const id = randomUUID();
    const path = `snap/${id}.jpg`;
    const claims = { id, path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    return { id, path, url: `${base}/photos/${path}`, ticket: sign(claims, 'upload', secret, ttl) };
  };
  const send = (photo, signal) => fetch(photo.url, { method: 'PUT', headers: { Authorization: `Bearer ${photo.ticket}`, Origin: origin }, body: bytes, signal });
  const hold = photo => {
    let req;
    const done = new Promise(resolve => {
      req = http.request(photo.url, { method: 'PUT', headers: { Authorization: `Bearer ${photo.ticket}`, Origin: origin, 'Content-Length': bytes.length } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', () => resolve(0));
    });
    held.push(req);
    req.write(bytes.subarray(0, 4));
    return { done, finish: () => req.end(bytes.subarray(4)), cancel: () => req.destroy() };
  };
  const arrivals = count => new Promise(resolve => {
    const observe = req => {
      if (req.method === 'PUT' && --count === 0) { server.off('request', observe); resolve(); }
    };
    server.on('request', observe);
  });
  return { root, secret, server, base, bytes, plan, send, hold, arrivals };
}

test('50 simultaneous photos wait for two upload slots, keep metadata access available and all save intact', { timeout: 20_000 }, async t => {
  const s = await setup(t);
  const photos = Array.from({ length: 50 }, () => s.plan());
  const firstArrived = s.arrivals(2);
  const first = s.hold(photos[0]);
  const second = s.hold(photos[1]);
  await firstArrived;
  const queuedArrived = s.arrivals(48);
  const queued = photos.slice(2).map(async photo => {
    const res = await s.send(photo);
    assert.equal(res.status, 200);
    assert.equal(verify((await res.json()).receipt, 'receipt', s.secret).id, photo.id);
  });
  await queuedArrived;
  assert.equal((await fetch(`${s.base}/health`)).status, 200);
  // Queued uploads must not occupy the six slots reserved for reads/confirmation.
  assert.equal((await fetch(photos[0].url)).status, 404);
  first.finish();
  // Keep the second slot blocked: all 48 queued requests still drain successfully.
  await Promise.all(queued);
  second.finish();
  assert.deepEqual(await Promise.all([first.done, second.done]), [200, 200]);
  assert.equal((await readdir(join(s.root, 'snap'))).length, 50);
  for (const photo of photos) assert.deepEqual(await readFile(join(s.root, photo.path)), s.bytes);
});

test('a full queue returns Retry-After and a disconnected waiter releases its place', { timeout: 10_000 }, async t => {
  const s = await setup(t, { maxQueuedUploads: 1 });
  const firstArrived = s.arrivals(2);
  const first = s.hold(s.plan());
  const second = s.hold(s.plan());
  await firstArrived;
  const queuedArrived = s.arrivals(1);
  const cancelled = new Promise(resolve => s.server.once('request', (_req, res) => res.once('close', resolve)));
  const abandoned = s.hold(s.plan());
  await queuedArrived;
  const photo = s.plan();
  const busy = await s.send(photo);
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get('Retry-After'), '2');
  assert.equal(busy.headers.get('Access-Control-Expose-Headers'), 'Retry-After');
  await busy.arrayBuffer();
  abandoned.cancel();
  await abandoned.done;
  await cancelled;
  const nextArrived = s.arrivals(1);
  const next = s.send(photo);
  await nextArrived;
  first.finish(); second.finish();
  const res = await next;
  assert.equal(res.status, 200);
  await res.arrayBuffer();
  assert.deepEqual(await Promise.all([first.done, second.done]), [200, 200]);
});

test('waiting is bounded and the same permission succeeds after a queue timeout', { timeout: 10_000 }, async t => {
  const s = await setup(t, { queueWaitMs: 30 });
  const firstArrived = s.arrivals(2);
  const first = s.hold(s.plan());
  const second = s.hold(s.plan());
  await firstArrived;
  const photo = s.plan();
  const busy = await s.send(photo);
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get('Retry-After'), '2');
  await busy.arrayBuffer();
  first.finish(); second.finish();
  assert.deepEqual(await Promise.all([first.done, second.done]), [200, 200]);
  const retried = await s.send(photo);
  assert.equal(retried.status, 200);
  await retried.arrayBuffer();
});

test('a lost upload response can be replayed concurrently without duplicate files', { timeout: 10_000 }, async t => {
  const s = await setup(t);
  const photo = s.plan();
  await Promise.all(Array.from({ length: 12 }, async () => {
    const res = await s.send(photo);
    assert.equal(res.status, 200);
    assert.equal(verify((await res.json()).receipt, 'receipt', s.secret).id, photo.id);
  }));
  assert.deepEqual(await readdir(join(s.root, 'snap')), [basename(photo.path)]);
  assert.deepEqual(await readFile(join(s.root, photo.path)), s.bytes);
});

test('a permission that expires in the queue cannot save a photo', { timeout: 10_000 }, async t => {
  const s = await setup(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const firstArrived = s.arrivals(2);
  const first = s.hold(s.plan());
  const second = s.hold(s.plan());
  await firstArrived;
  const queuedArrived = s.arrivals(1);
  const queued = s.send(s.plan(1));
  await queuedArrived;
  now += 2000;
  first.finish(); second.finish();
  const expired = await queued;
  assert.equal(expired.status, 401);
  await expired.arrayBuffer();
  assert.deepEqual(await Promise.all([first.done, second.done]), [200, 200]);
  assert.equal((await readdir(join(s.root, 'snap'))).length, 2);
});
