"use client";

import { useEffect, useState } from "react";
import { getSiteSettings, type GalleryItem } from "@/lib/settings";
import { groom, bride, venue, formatShortDate } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

/**
 * 앨범 — "SAVE the DATE" 콜라주 카드 (갤러리와 D-Day 사이).
 * 사진은 Admin 콘텐츠 탭(album 설정, 최대 4장)에서 관리.
 * 사진이 하나도 없으면 섹션 자체를 렌더링하지 않음.
 */
export default function Album() {
  const [photos, setPhotos] = useState<GalleryItem[]>([]);

  useEffect(() => {
    getSiteSettings().then((s) => {
      if (s.album && s.album.length > 0) setPhotos(s.album.slice(0, 4));
    });
  }, []);

  if (photos.length === 0) return null;

  const [a, b, c, d] = photos;

  return (
    <section className="px-6 py-10 bg-wedding-cream border-t border-wedding-gold/10">
      <FadeIn>
        <div className="max-w-sm mx-auto bg-white border border-wedding-gold/15 shadow-sm px-7 py-10 space-y-8 text-center">
          <p className="font-serif text-[13px] tracking-[0.35em] text-neutral-700">
            SAVE{" "}
            <span className="italic font-light tracking-normal text-wedding-gold normal-case">
              the
            </span>{" "}
            DATE
          </p>

          {/* 2단 비대칭 콜라주 — 좌: 세로/정방형, 우: 정방형/세로 (지그재그) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-2.5">
              {a && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.src}
                  alt={a.alt ?? "앨범 사진 1"}
                  className="w-full aspect-[3/4] object-cover"
                />
              )}
              {c && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.src}
                  alt={c.alt ?? "앨범 사진 3"}
                  className="w-full aspect-square object-cover"
                />
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {b && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.src}
                  alt={b.alt ?? "앨범 사진 2"}
                  className="w-full aspect-square object-cover"
                />
              )}
              {d && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.src}
                  alt={d.alt ?? "앨범 사진 4"}
                  className="w-full aspect-[3/4] object-cover"
                />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="w-8 h-px bg-neutral-700 mx-auto" />
            <p className="font-serif tracking-[0.25em] text-sm text-neutral-800">
              {groom.name} <span className="text-wedding-gold">+</span> {bride.name}
            </p>
            <p className="text-[11px] tracking-[0.2em] text-neutral-500">
              {formatShortDate()} / {venue.name}
            </p>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
