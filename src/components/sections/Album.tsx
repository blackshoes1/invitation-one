"use client";

import { useEffect, useRef, useState } from "react";
import { getSiteSettings, type GalleryItem } from "@/lib/settings";
import { venue, formatShortDate, ALBUM_MAX } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

/**
 * 앨범 — 커플 사진 카드 (갤러리와 오시는 길 사이).
 * 사진은 Admin 콘텐츠 탭(album 설정)에서 관리. 없으면 섹션 미표시.
 * 터치로 좌우 스와이프(scroll-snap) + 하단 도트 인디케이터.
 */
export default function Album() {
  const [photos, setPhotos] = useState<GalleryItem[]>([]);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSiteSettings().then((s) => {
      if (s.album && s.album.length > 0) setPhotos(s.album.slice(0, ALBUM_MAX));
    });
  }, []);

  if (photos.length === 0) return null;

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  return (
    <section className="px-6 py-10 bg-wedding-cream border-t border-wedding-gold/10">
      <FadeIn>
        <div className="max-w-sm mx-auto bg-white border border-wedding-gold/15 shadow-sm px-5 py-8 space-y-6 text-center">
          {/* 터치 스와이프 캐러셀 (scroll-snap) */}
          <div
            ref={trackRef}
            onScroll={onScroll}
            className="flex overflow-x-auto snap-x snap-mandatory rounded-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {photos.map((p, i) => (
              <div key={p.src} className="min-w-full snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.src}
                  alt={p.alt ?? `앨범 사진 ${i + 1}`}
                  className="w-full aspect-[4/5] object-cover select-none"
                  draggable={false}
                />
              </div>
            ))}
          </div>

          {photos.length > 1 && (
            <div className="flex justify-center gap-2">
              {photos.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${i + 1}번째 사진 보기`}
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-5 bg-wedding-gold" : "w-1.5 bg-sage-200"
                  }`}
                />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="w-8 h-px bg-neutral-700 mx-auto" />
            <p className="text-[11px] tracking-[0.2em] text-neutral-500">
              {formatShortDate()} / {venue.name}
            </p>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
