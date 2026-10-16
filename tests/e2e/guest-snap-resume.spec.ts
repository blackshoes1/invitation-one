import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import https from 'node:https';

const HOME = `/?key=${encodeURIComponent(process.env.NEXT_PUBLIC_INVITATION_KEY ?? 'ci-dummy-key')}&view=photos`;
const files = ['public/pic/gallery1.jpg', 'public/pic/gallery2.jpg', 'public/pic/gallery3.jpg'];
const DB = 'invitation-guest-uploads';
type Photo = { id: string; plan: object; sha256: string; bytes?: Buffer; puts: number; confirms: number };
test.use({ ignoreHTTPSErrors: true }); // Local test NAS only; its certificate is generated per worker.
let tlsDirectory: string;
let certificate: Buffer;
let privateKey: Buffer;
const servers: https.Server[] = [];
test.beforeAll(async () => {
  tlsDirectory = await mkdtemp(join(tmpdir(), 'invitation-photo-tls-'));
  const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tlsDirectory, 'key.pem'), '-out', join(tlsDirectory, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  certificate = readFileSync(join(tlsDirectory, 'cert.pem')); privateKey = readFileSync(join(tlsDirectory, 'key.pem'));
});
test.afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
test.afterAll(async () => { await unlink(join(tlsDirectory, 'key.pem')); await unlink(join(tlsDirectory, 'cert.pem')); await rmdir(tlsDirectory); });
async function backend(context: BrowserContext) {
  const photos = new Map<string, Photo>();
  let released = false;
  let lost = false;
  let refreshes = 0;
  let resumes = 0;
  const server = https.createServer({ cert: certificate, key: privateKey }, async (req, res) => {
    const headers = { 'Access-Control-Allow-Origin': req.headers.origin ?? '', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Upload-Lease', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Expose-Headers': 'Retry-After' };
    const reply = (body: object, status = 200, extra = {}) => { res.writeHead(status, { ...headers, ...extra, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    const id = new URL(req.url!, 'https://localhost').pathname.split('/').pop()!.slice(0, -4);
    const photo = photos.get(id)!;
    if (req.method === 'GET') {
      if (photo.bytes) {
        if (photo === [...photos.values()][1] && !released) return reply({ state: 'waiting' }, 202, { 'Retry-After': '1' });
        return reply({ state: 'stored', receipt: id });
      }
      return reply({ state: 'ready', lease: 'slot' });
    }
    const chunks: Buffer[] = [];
    try { for await (const chunk of req) chunks.push(chunk); } catch { res.destroy(); return; }
    photo.puts++; photo.bytes = Buffer.concat(chunks);
    if (createHash('sha256').update(photo.bytes).digest('hex') !== photo.sha256) return reply({ error: 'Original bytes changed' }, 400);
    // Drop the receipt after storing the body. Closing a reused socket can trigger
    // Chromium's own transparent PUT replay, outside the application's retry loop.
    if (photo === [...photos.values()][1] && !lost) { lost = true; return reply({ state: 'stored' }); }
    return reply({ receipt: id });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test NAS did not start');
  const nasOrigin = `https://127.0.0.1:${address.port}`;
  await context.route('**/api/guest-photos/token*', route => route.fulfill({ json: { token: `session-${++refreshes}` } }));
  await context.route('**/api/guest-photos/direct', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'prepare') {
      const id = randomUUID();
      const uploadUrl = `${nasOrigin}/photos/snap/${id}.jpg`;
      const photo: Photo = { id, sha256: body.sha256, puts: 0, confirms: 0, plan: { storage: 'nas', uploadUrl, admissionUrl: `${uploadUrl}?admission=1`, ticket: id, resumeCredential: id } };
      photos.set(id, photo);
      return route.fulfill({ json: photo.plan });
    }
    if (body.action === 'resume') {
      resumes++;
      return route.fulfill({ json: photos.get(body.resumeCredential)!.plan });
    }
    const photo = photos.get(body.receipt)!;
    expect(photo.bytes).toBeDefined();
    expect(body.resumeCredential).toBe(photo.id);
    photo.confirms++;
    return route.fulfill({ json: { photo: { id: photo.id, url: '/pic/gallery1.jpg', name: null, message: null, created_at: new Date().toISOString() } } });
  });
  return { photos, release: () => { released = true; }, resumes: () => resumes, refreshes: () => refreshes };
}
async function selectAndStart(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '앨범에서 고르기' }).click();
  await (await chooser).setFiles(files);
  await page.getByRole('button', { name: '3장 이대로 올리기' }).click();
}
async function counts(page: Page) {
  return page.evaluate(name => new Promise<Record<string, number>>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const result: Record<string, number> = {};
      const tx = db.transaction(['batch', 'jobs', 'files'], 'readonly');
      for (const name of ['batch', 'jobs', 'files']) { const count = tx.objectStore(name).count(); count.onsuccess = () => { result[name] = count.result; }; }
      tx.oncomplete = () => { db.close(); resolve(result); };
    };
  }), DB);
}
async function visibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}
async function assertFinished(page: Page, api: Awaited<ReturnType<typeof backend>>) {
  // A restored page initially has no dialog while IndexedDB is still opening.
  // Wait for server acknowledgements first so that initial render cannot pass as completion.
  await expect.poll(() => [...api.photos.values()].filter(photo => photo.confirms === 1).length, { timeout: 20_000 }).toBe(3);
  await expect.poll(() => counts(page)).toEqual({ batch: 0, jobs: 0, files: 0 });
  await expect(page.getByRole('dialog', { name: '사진 원본 확인' })).toBeHidden({ timeout: 20_000 });
  expect(api.photos.size).toBe(3);
  for (const photo of api.photos.values()) { expect(photo.puts).toBe(1); expect(photo.confirms).toBe(1); }
  expect([...api.photos.values()].map(photo => photo.sha256).sort()).toEqual(files.map(file => createHash('sha256').update(readFileSync(file)).digest('hex')).sort());
  expect(await counts(page)).toEqual({ batch: 0, jobs: 0, files: 0 });
}

test('app switching resumes only unfinished photos, including a saved photo whose receipt was lost', async ({ page, context }) => {
  const api = await backend(context);
  await page.goto(HOME); await selectAndStart(page);
  await expect.poll(() => [...api.photos.values()].filter(photo => photo.bytes).length).toBe(2);
  await expect(page.getByText('3장 중 1장 등록 완료 · 남은 2장')).toBeVisible();
  await visibility(page, 'hidden');
  await expect.poll(() => counts(page).then(c => c.files)).toBe(2);
  api.release();
  await visibility(page, 'visible');
  await assertFinished(page, api);
  expect(api.resumes()).toBeGreaterThan(0);
});

test('a page discarded by the phone restores original bytes, completed IDs and pending permissions after reload', async ({ page, context }) => {
  const api = await backend(context);
  await page.goto(HOME); await selectAndStart(page);
  await expect.poll(() => [...api.photos.values()].filter(photo => photo.bytes).length).toBe(2);
  await expect(page.getByText('3장 중 1장 등록 완료 · 남은 2장')).toBeVisible();
  api.release();
  await page.reload();
  await assertFinished(page, api);
  expect(api.resumes()).toBeGreaterThan(0);
  expect(api.refreshes()).toBeGreaterThanOrEqual(2);
});

test('two open pages share one upload owner and do not create a second batch', async ({ page, context }) => {
  await context.addInitScript(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }));
  const api = await backend(context);
  await page.goto(HOME); await selectAndStart(page);
  await expect.poll(() => [...api.photos.values()].filter(photo => photo.bytes).length).toBe(2);
  const other = await context.newPage();
  await other.goto(HOME);
  await expect(other.getByText('다른 청첩장 화면에서 이어 올리고 있어요.')).toBeVisible();
  expect(api.photos.size).toBe(2);
  api.release();
  await assertFinished(page, api);
  await expect(other.getByRole('dialog', { name: '사진 원본 확인' })).toBeHidden();
});

test('losing connectivity pauses the saved batch and reconnecting resumes without duplicate bodies', async ({ page, context }) => {
  const api = await backend(context);
  await page.goto(HOME); await selectAndStart(page);
  await expect.poll(() => [...api.photos.values()].filter(photo => photo.bytes).length).toBe(2);
  await context.setOffline(true);
  await expect(page.getByText('사진을 임시 저장했어요. 연결이 돌아오면 남은 사진부터 이어 올려요.')).toBeVisible();
  api.release();
  await context.setOffline(false);
  await assertFinished(page, api);
});

test('no file leaves the phone when temporary storage is unavailable', async ({ page, context }) => {
  const api = await backend(context);
  await page.addInitScript(() => { indexedDB.open = () => { throw new DOMException('Storage unavailable', 'QuotaExceededError'); }; });
  await page.goto(HOME); await selectAndStart(page);
  await expect(page.getByRole('dialog').getByText('사진을 기기에 임시 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해주세요.')).toBeVisible();
  expect(api.photos.size).toBe(0);
});
