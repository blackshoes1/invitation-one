"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { supabase, isSupabaseConfigured, type GuestPhoto } from "@/lib/supabase";
import {
  PHOTO_MISSIONS,
} from "@/lib/wedding";
import { useGuestPhotoQueue } from "@/lib/useGuestPhotoQueue";
import FadeIn from "@/components/FadeIn";

/**
 * 앨범에서 한 번에 고를 수 있는 최대 장수.
 * 업로드 API 는 요청당 한 장이고 토큰당 10분 30장 제한이 있어, 한 번에 너무 많이
 * 고르면 뒷장부터 429 로 막힌다. 10장이면 예식장 Wi-Fi 에서도 부담이 적고
 * 여러 번 나눠 올릴 여유도 남는다.
 */
const MAX_BATCH = 10;

/**
 * 하객 스냅 — 하객이 찍은 사진을 청첩장에서 올리고 함께 보는 갤러리 (Epic A).
 * NAS 모드에서는 사진을 NAS에 직접 업로드하고 DB에는 주소와 작성자만 저장.
 * 사진은 브라우저가 제공한 원본 바이트 그대로 전송 (메타데이터 포함).
 */
export default function GuestSnap({
  uploadToken = null,
}: {
  /** 서버(page.tsx)가 렌더 시 발급한 단기 업로드 토큰 — 만료되면 /api/guest-photos/token 으로 갱신 */
  uploadToken?: string | null;
}) {
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [name, setName] = useState("");


  const [localError, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /** 선택한 포토 미션 (GS-9) — 업로드 시 사진에 함께 기록 */
  const [mission, setMission] = useState<string | null>(null);
  /** 완료한 미션 (기기 로컬 기억 — 재방문해도 체크 유지) */
  const [doneMissions, setDoneMissions] = useState<string[]>([]);
  /** 원본 확인 단계 (GS-7) — 사진 고른 뒤 원본 미리보기. 앨범 다중 선택이라 배열 */
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  /** 카메라로 바로 찍기 (capture) · 앨범에서 고르기 (capture 없음) */
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);


  function markMissionDone(m: string) {
    setDoneMissions((prev) => {
      if (prev.includes(m)) return prev;
      const next = [...prev, m];
      try {
        localStorage.setItem("snap-missions-done", JSON.stringify(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  }

  const queue = useGuestPhotoQueue(uploadToken,
    photo => setPhotos(previous => [photo, ...previous.filter(item => item.id !== photo.id)]),
    completedMission => { markMissionDone(completedMission); setMission(current => current === completedMission ? null : current); });
  const pendingFiles = queue.state ? queue.files : selectedFiles;
  const uploading = ['restoring', 'saving', 'running'].includes(queue.status);
  const pendingCount = queue.state ? queue.state.jobs.filter(job => !job.photo).length : selectedFiles.length;
  const uploadStage = queue.stage;
  const done = queue.state?.jobs.filter(job => job.photo).length ?? 0;
  const total = queue.state?.jobs.length ?? pendingCount;
  const error = localError ?? queue.error;
  // 완료 미션 로컬 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem("snap-missions-done");
      const saved: unknown = raw ? JSON.parse(raw) : [];
      // SSR 과 클라이언트의 초기 렌더를 일치시키려 마운트 후 복원 (하이드레이션 mismatch 방지)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved)) setDoneMissions(PHOTO_MISSIONS.filter((m) => saved.includes(m)));
    } catch {
      /* 무시 */
    }
  }, []);

  // 모달(라이트박스·원본 확인) 열림: ESC 로 닫기 + 배경 스크롤 잠금
  const modalOpen = lightbox !== null || pendingCount > 0;
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setLightbox(null);
      if (!uploading && !queue.state) setSelectedFiles([]);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen, uploading, queue.state]);

  const load = () => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.rpc("get_guest_photos").then(({ data }) => {
      if (Array.isArray(data)) setPhotos(previous => [...previous, ...(data as GuestPhoto[]).filter(photo => !previous.some(item => item.id === photo.id))]);
    });
  };

  useEffect(load, []);

  // 테이블 QR(?snap=1 또는 #snap)로 들어오면 하객 스냅으로 스크롤.
  // 위쪽 지도·피드·이미지가 늦게 로드되며 위치가 밀리므로 여러 번 재시도.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wantsSnap =
      new URLSearchParams(window.location.search).has("snap") ||
      window.location.hash === "#snap";
    if (!wantsSnap) return;
    const timers = [300, 900, 1600, 2600].map((ms) =>
      setTimeout(() => {
        document
          .getElementById("guest-snap")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  /**
   * 미션을 고르면 표시명을 준비하고 곧바로 카메라를 엽니다 ("지금 찍어보세요" 성격).
   * 카메라를 닫아도 미션 선택은 남아 있어, 아래 '앨범에서 고르기' 로 예전 사진을
   * 올려도 같은 미션으로 기록됩니다.
   */
  const pickMission = (m: string) => {
    setMission((cur) => (cur === m ? null : m));
    if (mission !== m) cameraRef.current?.click();
  };

  /** 사진을 고르면 곧바로 업로드하지 않고 원본 확인 단계로 (GS-7) */
  const beginUpload = (files: File[]) => {
    setError(null);

    if (files.length > MAX_BATCH) {
      // 말없이 잘라내면 몇 장이 사라진 줄 모른다 — 앞의 MAX_BATCH 장만 진행한다고 알린다
      setError(
        `한 번에 ${MAX_BATCH}장까지 올릴 수 있어요. 먼저 고른 ${MAX_BATCH}장만 준비했어요 🙏`
      );
    }
    setSelectedFiles(files.slice(0, MAX_BATCH));
  };

  /** 카메라·앨범 두 input 이 공유하는 처리 — 값을 비워 같은 사진을 다시 골라도 동작하게 한다 */
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) beginUpload(files);
    e.target.value = "";
  };

  // 미리보기만 생성한다. 업로드 파일은 변환하지 않는다.
  const firstFile = pendingFiles[0] ?? null;
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    const url = firstFile ? URL.createObjectURL(firstFile) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(url);
    setPreviewFailed(false);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [firstFile]);

  /** Save the whole selection before any network transfer; resume the existing batch on retry. */
  const uploadFiles = async (files: File[]) => {
    setError(null);
    if (queue.state) { queue.resume(); return; }
    try {
      await queue.start(files, [name.trim(), mission].filter(Boolean).join(" · "), mission);
      setSelectedFiles([]);
    } catch {
      setError("사진을 기기에 임시 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해주세요.");
    }
  };
  return (
    <section
      id="guest-snap"
      className="px-6 py-12 bg-white border-t border-wedding-gold/10 scroll-mt-4"
    >
      <div className="max-w-sm mx-auto space-y-6 text-center">
        <FadeIn className="space-y-2">
          <p className="font-serif tracking-[0.3em] text-xs text-sage-600">
            GUEST SNAP
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            하객 스냅
          </h2>
          <p className="rounded-xl bg-sage-50 px-4 py-3 text-sm font-medium leading-relaxed text-sage-800">
            오늘의 베스트샷을 찾습니다!<br />
            첫 업로드와 베스트샷에 선물을 드려요.
          </p>
          <p className="text-sm text-neutral-500 leading-relaxed pt-1">
            오늘 담아주신 순간을 함께 나눠요 📸
            <br />
            지금 찍으셔도, 앨범에 있던 사진을 고르셔도 좋아요
          </p>
        </FadeIn>

        {/* 포토 미션 (GS-9) — 고르면 카메라가 열리고, 올리면 체크됩니다 */}
        <FadeIn className="space-y-2">
          <p className="text-xs text-neutral-500">
            📸 포토 미션 · {doneMissions.length}/{PHOTO_MISSIONS.length} 완료
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {PHOTO_MISSIONS.map((m) => {
              const done = doneMissions.includes(m);
              const active = mission === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMission(m)}
                  disabled={uploading || !!queue.state}
                  className={`min-h-11 text-xs px-2.5 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${
                    active
                      ? "bg-sage-700 text-white border-sage-700"
                      : done
                      ? "bg-sage-50 text-sage-600 border-sage-200"
                      : "bg-white text-neutral-500 border-wedding-gold/25"
                  }`}
                >
                  {done && !active ? "✓ " : ""}
                  {m}
                </button>
              );
            })}
          </div>
          {mission && (
            <p className="text-xs text-sage-600">
              「{mission}」 미션 사진을 올려주세요 🙌
            </p>
          )}
        </FadeIn>

        <FadeIn className="space-y-3">
          <input
            aria-label="이름 (선택)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (선택)"
            className="w-full p-2.5 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600 text-center"
          />
          {/* 찍기와 앨범을 각각의 버튼으로 — capture 속성이 붙은 input 하나로는
              휴대폰이 카메라를 바로 열어버려 앨범에서 고를 방법이 없다. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading || !!queue.state}
              className="flex items-center justify-center gap-1.5 py-3.5 bg-sage-700 text-white text-sm font-medium tracking-wide disabled:opacity-60"
            >
              <Camera size={16} />
              {uploading ? "올리는 중…" : "지금 찍기"}
            </button>
            <button
              type="button"
              onClick={() => albumRef.current?.click()}
              disabled={uploading || !!queue.state}
              className="flex items-center justify-center gap-1.5 py-3.5 bg-white text-sage-700 border border-sage-700 text-sm font-medium tracking-wide disabled:opacity-60"
            >
              <ImageIcon size={16} />
              앨범에서 고르기
            </button>
          </div>
          {/* capture 있음 = 카메라 바로 열기 */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPickFile}
          />
          {/* capture 없음 = 사진 보관함에서 고르기. multiple 로 여러 장 선택 */}
          <input
            ref={albumRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPickFile}
          />
          {/* 모달이 열려 있으면 모달 안에서 같은 안내를 보여주므로 여기선 생략 (중복 낭독 방지) */}
          {error && pendingCount === 0 && (
            <p role="status" className="text-xs text-red-600">
              {error}
            </p>
          )}
        </FadeIn>

        {photos.length === 0 ? (
          // neutral-300 은 흰 배경에서 1.5:1 로 사실상 보이지 않았다 —
          // 사진을 올려 달라고 권하는 안내문이라 읽히는 게 우선
          <p className="text-xs text-neutral-500 py-6">
            첫 사진의 주인공이 되어주세요 🌿
          </p>
        ) : (
          <FadeIn>
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLightbox(p.url)}
                  className="relative aspect-square overflow-hidden bg-sage-50"
                >
                  {/* 3열 그리드 썸네일 — next/image 로 축소본 서빙 (원본 2000px 그대로 받지 않도록) */}
                  <Image
                    src={p.url}
                    unoptimized={p.url.includes("/photos/snap/")}
                    alt={p.name ? `${p.name}님의 스냅` : "하객 스냅"}
                    fill
                    sizes="(max-width: 448px) 33vw, 150px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          </FadeIn>
        )}
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
          className="fade-in-soft fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 z-10 p-2 -m-2 text-white/80"
          >
            <X size={24} />
          </button>
          {/* 원본은 폰 카메라 해상도 그대로 — 화면 폭에 맞춘 변환본을 받는다 */}
          <Image
            src={lightbox}
            unoptimized={lightbox.includes("/photos/snap/")}
            alt="하객 스냅"
            fill
            sizes="100vw"
            quality={75}
            className="object-contain p-4"
          />
        </div>
      )}

      {/* 원본 확인 (GS-7) */}
      {pendingCount > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="사진 원본 확인"
          className="fade-in-soft fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <div className="pop-in bg-white rounded-lg overflow-hidden w-full max-w-xs">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                <p className="text-sm font-medium text-sage-700">
                  원본으로 올리기
                  {pendingCount > 1 && (
                    <span className="ml-1.5 text-xs font-normal text-neutral-500">
                      {pendingCount}장
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => !uploading && !queue.state && setSelectedFiles([])} disabled={uploading || !!queue.state}
                  className="text-neutral-500"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-neutral-50 flex items-center justify-center p-3 min-h-[220px]">
                {preview && !previewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="미리보기"
                    onError={() => setPreviewFailed(true)}
                    className="max-h-[46vh] max-w-full object-contain shadow-sm"
                  />
                ) : (
                  <p className="text-xs text-neutral-500 text-center">미리보기를 표시할 수 없어도 원본은 올릴 수 있어요.</p>
                )}
              </div>

              {/* 여러 장 중 첫 장만 미리보기로 표시 */}
              {pendingCount > 1 && (
                <p className="px-4 pt-2 text-xs text-neutral-500 text-center">
                  첫 장 미리보기예요 · 선택한 {pendingCount}장을 원본으로 저장해요
                </p>
              )}

              {/* 장수 상한·부분 실패 안내는 모달 안에서 보여야 한다 —
                  섹션 쪽에만 두면 검은 오버레이에 가려 하객이 볼 수 없다 */}
              {queue.state && (
                <p className="px-4 pt-2 text-xs text-sage-700 text-center">
                  {total}장 중 {done}장 등록 완료 · 남은 {pendingCount}장
                </p>
              )}
              {error && (
                <p
                  role="status"
                  className="px-4 pt-2 text-xs text-red-600 text-center"
                >
                  {error}
                </p>
              )}

              {uploading && (
                <p role="status" className="px-4 pt-2 text-xs text-sage-700 text-center">
                  {queue.status === 'saving' ? '이 기기에 사진을 임시 저장하고 있어요.' : uploadStage === 'waiting'
                    ? '전송 순서를 기다리거나 연결을 다시 확인하고 있어요. 화면을 열어두면 자동으로 이어져요.'
                    : uploadStage === 'confirming'
                    ? '사진을 저장했어요. 앨범에 등록하고 있어요.'
                    : '사진을 전송하고 있어요. 업로드가 몰리면 순서대로 기다려요.'}
                </p>
              )}
              {queue.state && !uploading && !error && (
                <p role="status" className="px-4 pt-2 text-xs text-sage-700 text-center">
                  {queue.status === 'other' ? '다른 청첩장 화면에서 이어 올리고 있어요.' : '사진을 임시 저장했어요. 연결이 돌아오면 남은 사진부터 이어 올려요.'}
                </p>
              )}

              <p className="px-4 py-3 text-xs text-neutral-500 text-center">
                한 장당 최대 20MB · 압축과 프레임 없이 원본으로 저장해요.
                사진에 포함된 위치정보 등 메타데이터도 유지돼요.
                <br />
                사진은 이 기기에 임시 보관해요. 화면이 꺼지거나 다른 앱에 다녀와도 돌아오면 이어 올려요.
              </p>

              <div className="px-4 pb-4 pt-1">
                <button
                  type="button"
                  onClick={() => uploadFiles(pendingFiles)}
                  disabled={uploading || queue.status === 'other' || !preview}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-sage-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  <Camera size={16} />
                  {uploading
                    ? total > 1
                      ? `올리는 중… ${done}/${total}`
                      : "올리는 중…"
                    : queue.state ? `남은 ${pendingCount}장 이어올리기` : pendingCount > 1
                    ? `${pendingCount}장 이대로 올리기`
                    : "이대로 올리기"}
                </button>
                {queue.state && !uploading && queue.status !== 'other' && (
                  <button type="button" className="mt-3 w-full text-xs text-neutral-500 underline"
                    onClick={() => { void queue.discard().then(() => { setSelectedFiles([]); setError(null); }).catch(e => setError(e instanceof Error ? e.message : '잠시 후 다시 시도해주세요.')); }}>
                    남은 사진의 임시 보관 지우기
                  </button>
                )}
                {/* 여러 장은 시간이 걸린다 — 진행 상황을 스크린리더에도 알린다 */}
                <p className="sr-only" role="status">
                  {uploading && total > 1
                    ? `${total}장 중 ${done}장 올렸어요`
                    : ""}
                </p>
              </div>
          </div>
        </div>
      )}
    </section>
  );
}
