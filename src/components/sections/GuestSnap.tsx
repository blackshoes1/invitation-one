"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, X } from "lucide-react";
import { supabase, isSupabaseConfigured, type GuestPhoto } from "@/lib/supabase";
import {
  INVITATION_KEY,
  PHOTO_MISSIONS,
  groom,
  bride,
  formatShortDate,
} from "@/lib/wedding";
import { compressImage } from "@/lib/image";
import { applyFrame, FRAMES, type FrameId } from "@/lib/frames";
import FadeIn from "@/components/FadeIn";

/**
 * 하객 스냅 — 하객이 찍은 사진을 청첩장에서 올리고 함께 보는 갤러리 (Epic A).
 * 업로드 → Supabase 'guest-photos' 버킷 → (NAS Cloud Sync 로 아카이브).
 * 사진은 브라우저에서 압축·EXIF 제거 후 전송.
 */
export default function GuestSnap({
  uploadToken = null,
}: {
  /** 서버(page.tsx)가 렌더 시 발급한 단기 업로드 토큰 — 만료되면 /api/guest-photos/token 으로 갱신 */
  uploadToken?: string | null;
}) {
  const tokenRef = useRef<string | null>(uploadToken);
  /** 토큰 재발급 (만료·무효 시 1회). 실패하면 null */
  const renewToken = async (): Promise<string | null> => {
    try {
      const r = await fetch(
        `/api/guest-photos/token?key=${encodeURIComponent(INVITATION_KEY)}`,
        { cache: "no-store" }
      );
      if (!r.ok) return null;
      const j = (await r.json()) as { token?: string };
      tokenRef.current = j.token ?? null;
      return tokenRef.current;
    } catch {
      return null;
    }
  };
  /** 업로드 POST — 토큰 만료/무효(401)면 재발급 후 1회 재시도 */
  const postUpload = async (fd: FormData) => {
    const send = async (tok: string) => {
      fd.set("token", tok);
      const res = await fetch("/api/guest-photos", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as {
        photo?: GuestPhoto;
        error?: string;
        code?: string;
      };
      return { res, j };
    };
    let tok = tokenRef.current ?? (await renewToken());
    if (!tok) return { res: null, j: { error: "업로드 권한을 받지 못했어요. 청첩장을 새로고침 해주세요 🙏" } };
    let out = await send(tok);
    if (out.res.status === 401 && out.j.code === "token_expired") {
      tok = await renewToken();
      if (tok) out = await send(tok);
    }
    return out;
  };
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /** 선택한 포토 미션 (GS-9) — 업로드 시 사진에 함께 기록 */
  const [mission, setMission] = useState<string | null>(null);
  /** 완료한 미션 (기기 로컬 기억 — 재방문해도 체크 유지) */
  const [doneMissions, setDoneMissions] = useState<string[]>([]);
  /** 프레임 선택 단계 (GS-7) — 사진 고른 뒤 프레임 미리보기 */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [frame, setFrame] = useState<FrameId>("none");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const signature = `${groom.name} ♥ ${bride.name} · ${formatShortDate()}`;

  // 완료 미션 로컬 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem("snap-missions-done");
      // SSR 과 클라이언트의 초기 렌더를 일치시키려 마운트 후 복원 (하이드레이션 mismatch 방지)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setDoneMissions(JSON.parse(raw));
    } catch {
      /* 무시 */
    }
  }, []);

  // 모달(라이트박스·프레임 선택) 열림: ESC 로 닫기 + 배경 스크롤 잠금
  const modalOpen = lightbox !== null || pendingFile !== null;
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setLightbox(null);
      if (!uploading) setPendingFile(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen, uploading]);

  const load = () => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.rpc("get_guest_photos").then(({ data }) => {
      if (Array.isArray(data)) setPhotos(data as GuestPhoto[]);
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

  /** 미션을 고르면 표시명을 준비하고 곧바로 카메라/앨범을 엽니다 */
  const pickMission = (m: string) => {
    setMission((cur) => (cur === m ? null : m));
    if (mission !== m) fileRef.current?.click();
  };

  const markMissionDone = (m: string) => {
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
  };

  /** 사진을 고르면 곧바로 업로드하지 않고 프레임 선택 단계로 (GS-7) */
  const beginDecorate = (file: File) => {
    setError(null);
    setFrame("none");
    setPendingFile(file);
  };

  // 선택한 프레임으로 미리보기 갱신 (원본은 그대로 미리보기)
  useEffect(() => {
    if (!pendingFile) {
      // 파일 선택 해제 시 미리보기 즉시 정리 (파생 상태 리셋)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    let alive = true;
    let url: string | null = null;
    (async () => {
      const framed = await applyFrame(pendingFile, frame, signature);
      if (!alive) return;
      url = URL.createObjectURL(framed);
      setPreview(url);
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // signature 는 렌더마다 동일 문자열 (deps 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile, frame]);

  /** 실제 업로드 (프레임 적용 후) */
  const uploadFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const framed = await applyFrame(file, frame, signature);
      const compressed = await compressImage(framed);
      const fd = new FormData();
      fd.append("file", compressed);

      // 이름 + 선택한 미션을 함께 기록 (미션만 있어도 태그로 남김)
      const label = [name.trim(), mission].filter(Boolean).join(" · ");
      if (label) fd.append("name", label);
      const { res, j } = await postUpload(fd);
      if (!res || !res.ok || !j.photo) {
        setError(j.error ?? "업로드에 실패했어요. 잠시 후 다시 시도해주세요 🙏");
        return;
      }
      setPhotos((prev) => [j.photo as GuestPhoto, ...prev]);
      if (mission) markMissionDone(mission);
      setMission(null);
      setPendingFile(null);
    } catch {
      setError("업로드 중 오류가 발생했어요.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section
      id="guest-snap"
      className="px-6 py-12 bg-white border-t border-wedding-gold/10 scroll-mt-4"
    >
      <div className="max-w-sm mx-auto space-y-6 text-center">
        <FadeIn className="space-y-2">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            GUEST SNAP
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            하객 스냅
          </h2>
          <p className="text-xs text-neutral-500 leading-relaxed pt-1">
            오늘 담아주신 순간을 함께 나눠요 📸
            <br />
            사진을 올려주시면 저희에게 소중히 간직됩니다
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
                  disabled={uploading}
                  className={`text-[11px] px-2.5 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${
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
            <p className="text-[11px] text-sage-600">
              「{mission}」 미션 사진을 올려주세요 🙌
            </p>
          )}
        </FadeIn>

        <FadeIn className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (선택)"
            className="w-full p-2.5 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600 text-center"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-sage-700 text-white text-sm font-medium tracking-wide disabled:opacity-60"
          >
            <Camera size={16} />
            {uploading ? "올리는 중…" : "사진 올리기"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) beginDecorate(f);
              e.target.value = "";
            }}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
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
            alt="하객 스냅"
            fill
            sizes="100vw"
            quality={75}
            className="object-contain p-4"
          />
        </div>
      )}

      {/* 프레임 선택 (GS-7) */}
      {pendingFile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="사진 프레임 고르기"
          className="fade-in-soft fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <div className="pop-in bg-white rounded-lg overflow-hidden w-full max-w-xs">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                <p className="text-sm font-medium text-sage-700">프레임 고르기 🖼️</p>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => !uploading && setPendingFile(null)}
                  className="text-neutral-500"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-neutral-50 flex items-center justify-center p-3 min-h-[220px]">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="미리보기"
                    className="max-h-[46vh] max-w-full object-contain shadow-sm"
                  />
                ) : (
                  <div className="w-40 h-40 bg-neutral-200 animate-pulse rounded" />
                )}
              </div>

              <div className="flex gap-2 px-4 py-3 overflow-x-auto">
                {FRAMES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFrame(f.id)}
                    disabled={uploading}
                    className={`shrink-0 text-[11px] px-3 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${
                      frame === f.id
                        ? "bg-sage-700 text-white border-sage-700"
                        : "bg-white text-neutral-500 border-wedding-gold/25"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="px-4 pb-4 pt-1">
                <button
                  type="button"
                  onClick={() => pendingFile && uploadFile(pendingFile)}
                  disabled={uploading || !preview}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-sage-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  <Camera size={16} />
                  {uploading ? "올리는 중…" : "이대로 올리기"}
                </button>
              </div>
          </div>
        </div>
      )}
    </section>
  );
}
