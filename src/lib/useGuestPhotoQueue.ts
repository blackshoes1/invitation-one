"use client";
import { useEffect, useRef, useState } from 'react';
import { guestUploadStore as store, leaseLost, type UploadBatch } from './guestUploadStore';
import { uploadGuestPhoto, uploadAborted, PhotoUploadError, photoUploadErrorMessage, type PhotoUploadStage, type UploadContext } from './uploadGuestPhoto';
import { INVITATION_KEY } from './wedding';
import type { GuestPhoto } from './supabase';

type Status = 'restoring' | 'ready' | 'saving' | 'running' | 'paused' | 'other' | 'failed' | 'needs-name';
type View = { status: Status; state: UploadBatch | null; files: File[]; stage: PhotoUploadStage; error: string | null };
type Actions = { start: (files: File[], label: string, mission: string | null) => Promise<void>; resume: (name?: string) => Promise<void>; discard: () => Promise<void> };
const initial: View = { status: 'restoring', state: null, files: [], stage: 'sending', error: null };

export function useGuestPhotoQueue(uploadToken: string | null, onPhoto: (photo: GuestPhoto) => void, onMission: (mission: string) => void) {
  const [view, setView] = useState<View>(initial);
  const callbacks = useRef({ onPhoto, onMission });
  const token = useRef(uploadToken);
  const actions = useRef<Actions | null>(null);
  useEffect(() => { callbacks.current = { onPhoto, onMission }; }, [onPhoto, onMission]);
  useEffect(() => { if (uploadToken) token.current = uploadToken; }, [uploadToken]);
  useEffect(() => {
    let live = true;
    let task: Promise<void> | undefined;
    let controller: AbortController | undefined;
    let activeOwner: string | undefined;
    let requested = false;
    let forced = false;
    let creating = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const active = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const display = (patch: Partial<View>) => { if (live) setView(previous => ({ ...previous, ...patch })); };
    const publish = async (state: UploadBatch | null, status: Status, error: string | null = null) => {
      const first = state?.jobs.find(job => !job.photo);
      // Preview one original only; loading ten 20MB ArrayBuffers at once can evict a mobile page.
      // Another tab may finish and remove this preview between our two read transactions.
      const files = first ? await store.file(first).then(file => [file]).catch(() => []) : [];
      display({ state, files, status, error });
    };
    const refreshToken = async (signal: AbortSignal) => {
      const response = await fetch(`/api/guest-photos/token?key=${encodeURIComponent(INVITATION_KEY)}`, { cache: 'no-store', signal });
      const body = await response.json();
      if (!response.ok || typeof body.token !== 'string') throw new PhotoUploadError('업로드 권한을 갱신하지 못했어요. 잠시 후 다시 시도해주세요.', 'UPLOAD_TOKEN');
      token.current = body.token;
      return body.token as string;
    };
    const pause = () => {
      requested = false; clearTimeout(retryTimer); controller?.abort();
      if (activeOwner) void store.release(activeOwner).catch(() => {});
    };
    const run = async (force: boolean) => {
      const owner = crypto.randomUUID();
      const abort = new AbortController();
      controller = abort;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const check = () => { if (abort.signal.aborted || !live || !active()) throw leaseLost(); };
      try {
        const state = await store.read();
        if (!state) { display({ state: null, files: [], status: 'ready', error: null }); return; }
        if (state.batch.preparing) {
          if ((state.batch.leaseUntil ?? 0) > Date.now()) {
            display({ status: 'saving' });
            retryTimer = setTimeout(() => kick(), 1500);
          } else {
            await store.abandon(state.batch.id);
            display({ state: null, files: [], status: 'failed', error: '임시 저장이 끝나기 전에 화면이 종료됐어요. 사진을 다시 선택해주세요.' });
          }
          return;
        }
        for (const job of state.jobs) if (job.photo) callbacks.current.onPhoto(job.photo);
        if (state.batch.mission && state.jobs.some(job => job.photo)) callbacks.current.onMission(state.batch.mission);
        // Older batches combined the author and mission in label, and allowed an empty author.
        const suffix = state.batch.mission ? ` · ${state.batch.mission}` : '';
        const authorName = state.batch.authorName ?? (state.batch.label === state.batch.mission ? '' : suffix && state.batch.label.endsWith(suffix) ? state.batch.label.slice(0, -suffix.length) : state.batch.label);
        if (!authorName.trim() && state.jobs.some(job => !job.photo && !job.checkpoint)) {
          await publish(state, 'needs-name', '이름을 입력한 뒤 남은 사진을 이어 올려주세요.');
          return;
        }
        if (!active()) { await publish(state, 'paused'); return; }
        if (state.batch.failed && !force) { await publish(state, 'failed', state.jobs.find(job => job.error)?.error ?? '남은 사진을 다시 시도해주세요.'); return; }
        if (!await store.claim(owner)) {
          await publish(state, 'other');
          retryTimer = setTimeout(() => kick(), 1500);
          return;
        }
        activeOwner = owner;
        heartbeat = setInterval(() => { void store.renew(owner).catch(() => abort.abort()); }, 3000);
        await store.failed(owner, false);
        await publish(state, 'running');
        let lastError = '';
        for (const job of state.jobs) {
          check();
          if (job.photo) continue;
          try {
            const file = await store.file(job);
            const fd = new FormData(); fd.set('file', file); fd.set('name', authorName.trim());
            if (state.batch.mission) fd.set('message', state.batch.mission);
            const context: UploadContext = { checkpoint: job.checkpoint, signal: abort.signal,
              beforeRequest: async () => { check(); await store.renew(owner); check(); },
              saveCheckpoint: async checkpoint => { job.checkpoint = checkpoint; await store.update(owner, job); },
            };
            let currentToken = token.current ?? await refreshToken(abort.signal);
            let result = await uploadGuestPhoto(fd, currentToken, stage => display({ stage }), context);
            if (result.res.status === 401 && result.j.code === 'token_expired') {
              currentToken = await refreshToken(abort.signal);
              result = await uploadGuestPhoto(fd, currentToken, stage => display({ stage }), context);
            }
            if (!result.res.ok || !result.j.photo) throw new PhotoUploadError(result.j.error ?? '남은 사진을 다시 시도해주세요.', result.j.code ?? `UPLOAD_${result.res.status}`);
            job.photo = result.j.photo; job.error = undefined;
            // Commit success and release this original's local Blob before moving to the next file.
            await store.update(owner, job);
            callbacks.current.onPhoto(job.photo);
            if (state.batch.mission) callbacks.current.onMission(state.batch.mission);
          } catch (error) {
            if (uploadAborted(error) || abort.signal.aborted) throw error;
            lastError = error instanceof PhotoUploadError ? photoUploadErrorMessage(error) : error instanceof Error ? error.message : '사진 임시 저장을 확인해주세요.';
            job.error = lastError;
            await store.update(owner, job);
            if (error instanceof PhotoUploadError && error.code === 'rate_limited') break;
          }
          await publish(state, 'running');
        }
        check();
        const remaining = state.jobs.filter(job => !job.photo).length;
        if (!remaining) {
          await store.clear(owner);
          display({ state: null, files: [], status: 'ready', error: null });
        } else {
          await store.failed(owner, true);
          const done = state.jobs.length - remaining;
          await publish(state, 'failed', done ? `${state.jobs.length}장 중 ${done}장을 올렸어요. 남은 ${remaining}장은 다시 시도해주세요 🙏` : lastError);
        }
      } catch (error) {
        if (live) {
          const state = await store.read().catch(() => null);
          if (uploadAborted(error) || abort.signal.aborted) await publish(state, 'paused').catch(() => {});
          else display({ state, status: 'failed', error: error instanceof Error ? error.message : '사진 임시 저장을 확인해주세요.' });
        }
      } finally {
        clearInterval(heartbeat);
        await store.release(owner).catch(() => {});
        if (activeOwner === owner) activeOwner = undefined;
        if (controller === abort) controller = undefined;
      }
    };
    const kick = (force = false) => {
      if (!live) return;
      requested = true; forced ||= force;
      if (task || creating) return;
      requested = false;
      const shouldForce = forced; forced = false;
      task = run(shouldForce).finally(() => {
        task = undefined;
        if (requested && live && active()) kick();
      });
    };
    actions.current = {
      async start(files, label, mission) {
        creating = true;
        display({ status: 'saving', error: null });
        try {
          await store.create(files, label, mission);
          await publish(await store.read(), 'paused');
          // Persistence is best effort at the browser/OS level, even when this request is denied.
          void navigator.storage?.persist?.().catch(() => {});
          creating = false;
          kick(true);
        } catch (error) {
          creating = false;
          requested = false;
          const restored = await store.read().catch(() => null);
          if (restored && !restored.batch.preparing) await publish(restored, 'failed').catch(() => {});
          display({ status: 'failed', error: '사진을 기기에 임시 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해주세요.' });
          throw error;
        }
      },
      async resume(name) {
        if (name !== undefined) {
          const author = name.trim().slice(0, 40);
          if (!author) { display({ error: '사진을 올리려면 이름을 입력해주세요.' }); return; }
          const owner = crypto.randomUUID();
          try {
            if (!await store.claim(owner)) throw new Error('다른 청첩장 화면에서 이어 올리고 있어요.');
            await store.setName(owner, author);
          } catch (error) { display({ error: error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.' }); return; }
          finally { await store.release(owner).catch(() => {}); }
        }
        kick(true);
      },
      async discard() {
        pause(); await task;
        const state = await store.read();
        if (!state) { display({ ...initial, status: 'ready' }); return; }
        const owner = crypto.randomUUID();
        if (!await store.claim(owner)) throw new Error('다른 청첩장 화면에서 업로드 중이에요. 그 화면에서 먼저 멈춰주세요.');
        await store.clear(owner);
        display({ ...initial, status: 'ready' });
      },
    };
    const visibility = () => { if (active()) kick(); else pause(); };
    const pagehide = () => pause();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', visibility);
    window.addEventListener('offline', visibility);
    window.addEventListener('pageshow', visibility);
    window.addEventListener('pagehide', pagehide);
    kick();
    return () => {
      live = false; pause(); actions.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', visibility);
      window.removeEventListener('offline', visibility);
      window.removeEventListener('pageshow', visibility);
      window.removeEventListener('pagehide', pagehide);
    };
  }, []);
  return { ...view,
    start: (files: File[], label: string, mission: string | null) => actions.current?.start(files, label, mission) ?? Promise.reject(new Error('잠시 후 다시 시도해주세요.')),
    resume: (name?: string) => actions.current?.resume(name),
    discard: () => actions.current?.discard() ?? Promise.resolve(),
  };
}
