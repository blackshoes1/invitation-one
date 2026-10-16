import type { GuestPhoto } from './supabase';
import type { UploadCheckpoint } from './uploadGuestPhoto';

export const GUEST_UPLOAD_DB = 'invitation-guest-uploads';
const RETENTION = 7 * 86400_000;
// A discarded page cannot reliably release a lease; takeover must remain quick.
const LEASE = 12_000;
type Batch = { key: 'active'; id: string; createdAt: number; label: string; mission: string | null; owner?: string; leaseUntil?: number; failed?: boolean; preparing?: boolean };
export type UploadJob = { id: string; order: number; filename: string; type: string; lastModified: number; checkpoint?: UploadCheckpoint; photo?: GuestPhoto; error?: string };
export type UploadBatch = { batch: Batch; jobs: UploadJob[] };
type Controls<T> = { done: (value: T) => void; fail: (error: unknown) => void };
export const leaseLost = () => new DOMException('Another page is handling this upload', 'AbortError');

async function open() {
  if (typeof indexedDB === 'undefined') throw new Error('기기에 사진을 임시 저장할 수 없어요. 브라우저의 저장 공간을 확인해주세요.');
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(GUEST_UPLOAD_DB, 1);
    let settled = false;
    const fail = (error: unknown) => { settled = true; clearTimeout(timer); reject(error); };
    const timer = setTimeout(() => fail(new Error('기기 임시 저장소 응답이 늦어요. 청첩장을 다시 열어주세요.')), 15_000);
    request.onupgradeneeded = () => {
      for (const name of ['batch', 'jobs', 'files']) request.result.createObjectStore(name, { keyPath: name === 'batch' ? 'key' : 'id' });
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('다른 청첩장 화면을 닫은 뒤 다시 시도해주세요.'));
    request.onsuccess = () => { clearTimeout(timer); if (settled) request.result.close(); else { settled = true; resolve(request.result); } };
  });
}
/** Resolve writes on transaction completion, never merely on an individual request's success. */
async function transaction<T>(names: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, controls: Controls<T>) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(names, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
    catch (error) { db.close(); reject(error); return; }
    let value: T;
    let failure: unknown;
    const fail = (error: unknown) => { failure = error; tx.abort(); };
    const timer = setTimeout(() => {
      failure = new Error('사진 임시 저장소 응답이 늦어요. 다시 시도해주세요.');
      try { tx.abort(); } catch { /* A suspended browser may have already ended the transaction. */ }
      db.close(); reject(failure);
    }, 15_000);
    tx.oncomplete = () => { clearTimeout(timer); db.close(); resolve(value); };
    tx.onabort = () => { clearTimeout(timer); db.close(); reject(failure ?? tx.error ?? new Error('사진 임시 저장이 중단됐어요. 저장 공간을 확인해주세요.')); };
    tx.onerror = () => { failure ??= tx.error; };
    try { work(tx, { done: result => { value = result; }, fail }); }
    catch (error) { fail(error); }
  });
}
function owned<T>(tx: IDBTransaction, owner: string, controls: Controls<T>, work: (batch: Batch) => void) {
  const request = tx.objectStore('batch').get('active');
  request.onsuccess = () => {
    try {
      const batch = request.result as Batch | undefined;
      if (!batch || batch.owner !== owner) return controls.fail(leaseLost());
      work(batch);
    } catch (error) { controls.fail(error); }
  };
}
export const guestUploadStore = {
  async read(): Promise<UploadBatch | null> {
    const state = await transaction<UploadBatch | null>(['batch', 'jobs'], 'readonly', (tx, { done }) => {
      const batch = tx.objectStore('batch').get('active');
      const jobs = tx.objectStore('jobs').getAll();
      jobs.onsuccess = () => done(batch.result ? { batch: batch.result, jobs: (jobs.result as UploadJob[]).sort((a, b) => a.order - b.order) } : null);
    });
    if (state && state.batch.createdAt + RETENTION < Date.now()) {
      await transaction(['batch', 'jobs', 'files'], 'readwrite', (tx, { done }) => {
        const current = tx.objectStore('batch').get('active');
        current.onsuccess = () => {
          if (current.result?.id === state.batch.id && current.result.createdAt + RETENTION < Date.now()) {
            for (const name of ['batch', 'jobs', 'files']) tx.objectStore(name).clear();
          }
          done(undefined);
        };
      });
      throw new Error('임시 저장 기간 7일이 지났어요. 앨범을 확인한 뒤 남은 사진을 다시 선택해주세요.');
    }
    return state;
  },
  async create(files: File[], label: string, mission: string | null) {
    if (!files.length || files.length > 10) throw new Error('한 번에 10장까지 선택해주세요.');
    const owner = crypto.randomUUID();
    await transaction(['batch', 'jobs'], 'readwrite', (tx, { done, fail }) => {
      const request = tx.objectStore('batch').get('active');
      request.onsuccess = () => {
        if (request.result) return fail(new Error('이전에 올리던 사진부터 마쳐주세요.'));
        tx.objectStore('batch').add({ key: 'active', id: owner, owner, leaseUntil: Date.now() + LEASE, preparing: true, createdAt: Date.now(), label, mission } satisfies Batch);
        files.forEach((file, order) => {
          const id = crypto.randomUUID();
          tx.objectStore('jobs').add({ id, order, filename: file.name, type: file.type, lastModified: file.lastModified } satisfies UploadJob);
        });
        done(undefined);
      };
    });
    const heartbeat = setInterval(() => { void guestUploadStore.renew(owner).catch(() => {}); }, 3000);
    try {
      const state = await guestUploadStore.read();
      if (!state || state.batch.owner !== owner) throw leaseLost();
      // WebKit private/ephemeral contexts cannot store Blob/File values. ArrayBuffers
      // retain the exact bytes and keep peak memory bounded to one original at a time.
      for (const job of state.jobs) {
        const bytes = await files[job.order].arrayBuffer();
        await transaction(['batch', 'files'], 'readwrite', (tx, controls) => owned(tx, owner, controls, () => {
          tx.objectStore('files').put({ id: job.id, bytes }); controls.done(undefined);
        }));
      }
      await transaction(['batch'], 'readwrite', (tx, controls) => owned(tx, owner, controls, batch => {
        tx.objectStore('batch').put({ ...batch, preparing: false, owner: undefined, leaseUntil: 0 }); controls.done(undefined);
      }));
    } catch (error) {
      await guestUploadStore.abandon(owner, true).catch(() => {});
      throw error;
    } finally { clearInterval(heartbeat); }
  },
  abandon(id: string, ownCreation = false): Promise<void> {
    return transaction(['batch', 'jobs', 'files'], 'readwrite', (tx, { done }) => {
      const request = tx.objectStore('batch').get('active');
      request.onsuccess = () => {
        const batch = request.result as Batch | undefined;
        if (batch?.id === id && batch.preparing && (ownCreation || (batch.leaseUntil ?? 0) <= Date.now())) {
          for (const name of ['batch', 'jobs', 'files']) tx.objectStore(name).clear();
        }
        done(undefined);
      };
    });
  },
  file(job: UploadJob): Promise<File> {
    return transaction(['files'], 'readonly', (tx, { done, fail }) => {
      const request = tx.objectStore('files').get(job.id);
      request.onsuccess = () => {
        const bytes = request.result?.bytes ?? request.result?.blob;
        if (bytes instanceof ArrayBuffer || bytes instanceof Blob) done(new File([bytes], job.filename, { type: job.type, lastModified: job.lastModified }));
        else fail(new Error('기기에 저장한 사진을 찾지 못했어요. 남은 사진을 다시 선택해주세요.'));
      };
    });
  },
  claim(owner: string): Promise<boolean> {
    return transaction(['batch'], 'readwrite', (tx, { done }) => {
      const request = tx.objectStore('batch').get('active');
      request.onsuccess = () => {
        const batch = request.result as Batch | undefined;
        if (!batch || (batch.owner && batch.owner !== owner && (batch.leaseUntil ?? 0) > Date.now())) return done(false);
        tx.objectStore('batch').put({ ...batch, owner, leaseUntil: Date.now() + LEASE });
        done(true);
      };
    });
  },
  renew(owner: string): Promise<void> {
    return transaction(['batch'], 'readwrite', (tx, controls) => owned(tx, owner, controls, batch => {
      tx.objectStore('batch').put({ ...batch, leaseUntil: Date.now() + LEASE }); controls.done(undefined);
    }));
  },
  release(owner: string): Promise<void> {
    return transaction(['batch'], 'readwrite', (tx, { done }) => {
      const request = tx.objectStore('batch').get('active');
      request.onsuccess = () => {
        if (request.result?.owner === owner) tx.objectStore('batch').put({ ...request.result, owner: undefined, leaseUntil: 0 });
        done(undefined);
      };
    });
  },
  update(owner: string, job: UploadJob): Promise<void> {
    return transaction(['batch', 'jobs', 'files'], 'readwrite', (tx, controls) => owned(tx, owner, controls, () => {
      tx.objectStore('jobs').put(job);
      if (job.photo) tx.objectStore('files').delete(job.id);
      controls.done(undefined);
    }));
  },
  failed(owner: string, failed: boolean): Promise<void> {
    return transaction(['batch'], 'readwrite', (tx, controls) => owned(tx, owner, controls, batch => {
      tx.objectStore('batch').put({ ...batch, failed }); controls.done(undefined);
    }));
  },
  clear(owner: string): Promise<void> {
    return transaction(['batch', 'jobs', 'files'], 'readwrite', (tx, controls) => owned(tx, owner, controls, () => {
      for (const name of ['batch', 'jobs', 'files']) tx.objectStore(name).clear();
      controls.done(undefined);
    }));
  },
};
