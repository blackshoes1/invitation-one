import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, link, unlink, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAX_SIZE, PATH_PATTERN, sign, verify, sniff } from './protocol.mjs';

export async function createPhotoServer({ root, secret, origins, maxQueuedUploads = 100, queueWaitMs = 45_000, leaseWaitMs = 45_000, pollExpiryMs = 120_000 }) {
  if (!root || !secret || secret.length < 32 || !origins?.length) throw new Error('Configure NAS_PHOTO_SECRET, PHOTO_ROOT and ALLOWED_ORIGINS');
  await mkdir(join(root, 'snap'), { recursive: true });
  await mkdir(join(root, 'deleted'), { recursive: true });
  let active = 0;
  let uploads = 0;
  const waiting = [];
  const reservations = new Map();
  const reserved = () => [...reservations.values()].filter(e => e.state === 'ready').length;
  const hasUploadSlot = () => active < 8 && uploads + reserved() < 2;
  const admit = () => {
    const now = Date.now();
    for (const [path, entry] of reservations) {
      if (entry.state !== 'uploading' && (entry.expires <= now || entry.claims.exp * 1000 <= now)) reservations.delete(path);
    }
    for (const entry of reservations.values()) {
      if (entry.state !== 'queued' || !hasUploadSlot()) continue;
      entry.state = 'ready';
      entry.expires = now + leaseWaitMs;
      entry.lease = randomUUID();
      entry.waiters?.forEach(notify => notify());
    }
  };
  const drain = () => {
    admit();
    while (waiting.length && hasUploadSlot()) waiting[0].finish(true);
  };
  const acquireUpload = (req, res) => {
    // Apply backpressure while queued: do not buffer dozens of 20MB photos in RAM.
    req.pause();
    if (!waiting.length && hasUploadSlot()) {
      active++; uploads++;
      return Promise.resolve(true);
    }
    if (waiting.length >= maxQueuedUploads) return Promise.resolve(false);
    return new Promise(resolve => {
      let settled = false;
      const entry = { finish: admitted => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        res.off('close', cancelled);
        waiting.splice(waiting.indexOf(entry), 1);
        if (admitted) { active++; uploads++; }
        resolve(admitted);
      } };
      const cancelled = () => entry.finish(false);
      const timer = setTimeout(cancelled, queueWaitMs);
      res.once('close', cancelled);
      waiting.push(entry);
    });
  };
  const server = http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    const busy = () => { res.setHeader('Retry-After', '2'); return json(503, { error: 'Busy, please retry' }); };
    // A disconnected queued request may emit an error before body iteration starts.
    req.on('error', () => {});
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin) {
      if (!origins.includes(origin)) return json(403, { error: 'Origin not allowed' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'PUT, GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Upload-Lease');
      res.setHeader('Access-Control-Max-Age', '600');
      res.writeHead(204); return res.end();
    }
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { return json(400, { error: 'Invalid URL' }); }
    if (url.pathname === '/health' && req.method === 'GET') {
      try { await access(root, 2); return json(200, { service: 'invitation-nas-photos', version: 2 }); }
      catch { return json(503, { error: 'Photo folder unavailable' }); }
    }
    const path = url.pathname.replace(/^\/photos\//, '');
    if (!url.pathname.startsWith('/photos/') || !PATH_PATTERN.test(path)) return json(404, { error: 'Not found' });
    const file = join(root, path);
    const tombstone = join(root, 'deleted', path.slice(5));
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const admission = req.method === 'GET' && url.searchParams.get('admission') === '1';
    const purpose = admission ? 'upload' : { PUT: 'upload', HEAD: 'stat', DELETE: 'delete' }[req.method];
    const claims = purpose ? verify(token, purpose, secret) : null;
    if ((req.method !== 'GET' || admission) && (!claims || claims.path !== path)) return json(401, { error: 'Invalid or expired permission' });
    if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(req.method)) return json(405, { error: 'Method not allowed' });
    if (admission) {
      if (!Number.isSafeInteger(claims.size) || claims.size < 1 || claims.size > MAX_SIZE || !/^[a-f0-9]{64}$/.test(claims.sha256)) return json(400, { error: 'Invalid photo size or checksum' });
      try {
        await stat(tombstone);
        return json(410, { error: 'Photo deleted' });
      } catch (e) { if (e.code !== 'ENOENT') return busy(); }
      // A lost PUT response is recovered without retransmitting the original.
      try {
        const bytes = await readFile(file);
        if (bytes.length !== claims.size || createHash('sha256').update(bytes).digest('hex') !== claims.sha256) return json(409, { error: 'Photo mismatch' });
        return json(200, { state: 'stored', receipt: sign(claims, 'receipt', secret, 3600) });
      } catch (e) { if (e.code !== 'ENOENT') return busy(); }
      admit();
      let entry = reservations.get(path);
      const joined = !entry;
      if (!entry) {
        if (reservations.size >= maxQueuedUploads + 2) return busy();
        entry = { claims, state: 'queued', expires: Date.now() + pollExpiryMs };
        reservations.set(path, entry);
        admit();
      }
      if (entry.state === 'queued') entry.expires = Date.now() + pollExpiryMs;
      const position = [...reservations.values()].filter(e => e.state !== 'uploading').indexOf(entry) + 1;
      // The first two waiters can receive their turn as soon as an upload ends.
      // Only tiny control requests wait here; no original file body is in transit.
      if (!joined && entry.state === 'queued' && position <= 2) await new Promise(resolve => {
        const done = () => { clearTimeout(timer); res.off('close', done); entry.waiters.delete(done); resolve(); };
        const timer = setTimeout(done, 15_000);
        entry.waiters ??= new Set();
        entry.waiters.add(done);
        res.once('close', done);
      });
      if (res.destroyed) return;
      if (entry.state === 'ready') return json(200, { state: 'ready', lease: entry.lease });
      res.setHeader('Retry-After', String(Math.min(5, Math.max(1, Math.ceil(position / 3)))));
      return json(202, { state: 'waiting', position: Math.max(1, position) });
    }
    if (req.method === 'PUT') {
      if (!Number.isSafeInteger(claims.size) || claims.size < 1 || claims.size > MAX_SIZE || !/^[a-f0-9]{64}$/.test(claims.sha256)) return json(400, { error: 'Invalid photo size or checksum' });
      if (req.headers['content-length'] && Number(req.headers['content-length']) !== claims.size) return json(400, { error: 'Size mismatch' });
      // v2 tickets reserve a slot using small GETs before sending any file bytes.
      // Old clients remain compatible during the web deployment transition.
      if (claims.admission === 2) {
        admit();
        const entry = reservations.get(path);
        if (!entry || entry.state !== 'ready' || entry.lease !== req.headers['x-upload-lease']) return busy();
        entry.state = 'uploading';
        active++; uploads++;
      } else if (!await acquireUpload(req, res)) {
        if (!res.destroyed) return busy();
        return;
      }
    } else {
      if (active >= 8) return busy();
      active++;
    }
    try {
      // Waiting never extends a signed permission's lifetime.
      if (res.destroyed) return;
      if (claims && !verify(token, purpose, secret)) return json(401, { error: 'Permission expired while waiting' });
      if (req.method === 'DELETE') {
        // Tombstone blocks replay of a still-valid upload ticket after deletion.
        await writeFile(tombstone, '', { mode: 0o600 });
        await unlink(file).catch(e => { if (e.code !== 'ENOENT') throw e; });
        return json(200, { deleted: true });
      }
      try { await stat(tombstone); return json(410, { error: 'Photo deleted' }); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const bytes = await readFile(file);
        const ext = sniff(bytes);
        if (!ext) return json(404, { error: 'Not found' });
        if (req.method === 'HEAD' && (claims.sha256 !== createHash('sha256').update(bytes).digest('hex') || claims.size !== bytes.length)) return json(409, { error: 'Photo mismatch' });
        res.writeHead(200, { 'Content-Type': { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' }[ext], 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > claims.size) { json(413, { error: 'Photo too large' }); req.destroy(); return; }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (size !== claims.size || createHash('sha256').update(bytes).digest('hex') !== claims.sha256 || sniff(bytes) !== path.split('.').pop()) return json(400, { error: 'Photo validation failed' });
      const temp = join(root, `.${randomUUID()}.part`);
      try {
        await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
        try { await link(temp, file); }
        catch (e) {
          if (e.code !== 'EEXIST') throw e;
          if (!(await readFile(file)).equals(bytes)) return json(409, { error: 'File already exists' });
        }
      } finally { await unlink(temp).catch(() => {}); }
      // A concurrent administrator delete must win over this upload.
      try { await stat(tombstone); await unlink(file).catch(() => {}); return json(410, { error: 'Photo deleted' }); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      return json(200, { receipt: sign(claims, 'receipt', secret, 3600) });
    } catch (e) {
      if (!res.headersSent) json(e.code === 'ENOENT' ? 404 : 503, { error: e.code === 'ENOENT' ? 'Not found' : 'Photo storage unavailable' });
      else res.destroy();
      if (e.code !== 'ENOENT') console.error('Photo service error:', e.code || 'request failed');
    } finally {
      active--;
      if (req.method === 'PUT') { uploads--; reservations.delete(path); }
      drain();
    }
  });
  server.requestTimeout = 300_000;
  server.headersTimeout = 15_000;
  server.timeout = 300_000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createPhotoServer({ root: process.env.PHOTO_ROOT || '/photos', secret: process.env.NAS_PHOTO_SECRET, origins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean) });
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
