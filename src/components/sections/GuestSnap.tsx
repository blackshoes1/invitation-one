"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X } from "lucide-react";
import { supabase, isSupabaseConfigured, type GuestPhoto } from "@/lib/supabase";
import { INVITATION_KEY, PHOTO_MISSIONS } from "@/lib/wedding";
import { compressImage } from "@/lib/image";
import FadeIn from "@/components/FadeIn";

/**
 * 하객 스냅 — 하객이 찍은 사진을 청첩장에서 올리고 함께 보는 갤러리 (Epic A).
 * 업로드 → Supabase 'guest-photos' 버킷 → (NAS Cloud Sync 로 아카이브).
 * 사진은 브라우저에서 압축·EXIF 제거 후 전송.
 */
export default function GuestSnap() {
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /** 선택한 포토 미션 (GS-9) — 업로드 시 사진에 함께 기록 */
  const [mission, setMission] = useState<string | null>(null);
  /** 완료한 미션 (기기 로컬 기억 — 재방문해도 체크 유지) */
  const [doneMissions, setDoneMissions] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // 완료 미션 로컬 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem("snap-missions-done");
      if (raw) setDoneMissions(JSON.parse(raw));
    } catch {
      /* 무시 */
    }
  }, []);

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

  const onPick = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("key", INVITATION_KEY);
      // 이름 + 선택한 미션을 함께 기록 (미션만 있어도 태그로 남김)
      const label = [name.trim(), mission].filter(Boolean).join(" · ");
      if (label) fd.append("name", label);
      const res = await fetch("/api/guest-photos", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.photo) {
        setError(j.error ?? "업로드에 실패했어요. 잠시 후 다시 시도해주세요 🙏");
        return;
      }
      setPhotos((prev) => [j.photo as GuestPhoto, ...prev]);
      if (mission) markMissionDone(mission);
      setMission(null);
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
          <p className="text-xs text-neutral-400 leading-relaxed pt-1">
            오늘 담아주신 순간을 함께 나눠요 📸
            <br />
            사진을 올려주시면 저희에게 소중히 간직됩니다
          </p>
        </FadeIn>

        {/* 포토 미션 (GS-9) — 고르면 카메라가 열리고, 올리면 체크됩니다 */}
        <FadeIn className="space-y-2">
          <p className="text-xs text-neutral-400">
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
              if (f) onPick(f);
              e.target.value = "";
            }}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </FadeIn>

        {photos.length === 0 ? (
          <p className="text-xs text-neutral-300 py-6">
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.name ? `${p.name}님의 스냅` : "하객 스냅"}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </FadeIn>
        )}
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          >
            <button
              type="button"
              aria-label="닫기"
              className="absolute top-4 right-4 text-white/80"
            >
              <X size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox}
              alt="하객 스냅"
              className="max-w-full max-h-[85vh] object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
