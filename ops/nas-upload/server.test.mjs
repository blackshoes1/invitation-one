import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createPhotoServer } from './server.mjs';
import { sign, verify } from './protocol.mjs';

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
    await rm(root, { recursive: true, force: true });
  }
});
