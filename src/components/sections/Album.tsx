"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSiteSettings, type GalleryItem } from "@/lib/settings";
import { venue, formatShortDate } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

/** 콜라주는 max-w-sm(384px) 카드 안 2단 그리드 — 한 칸은 화면 폭의 절반 남짓 */
const SIZES = "(max-width: 420px) 45vw, 170px";

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
            
          </p>

          {/* 2단 비대칭 콜라주 — 좌: 세로/정방형, 우: 정방형/세로 (지그재그).
              원본은 한 장에 1.5MB 까지 올라오므로 next/image 로 축소·AVIF 변환본을 받는다. */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-2.5">
              <AlbumPhoto photo={a} alt="앨범 사진 1" ratio="aspect-[3/4]" />
              <AlbumPhoto photo={c} alt="앨범 사진 3" ratio="aspect-square" />
            </div>
            <div className="flex flex-col gap-2.5">
              <AlbumPhoto photo={b} alt="앨범 사진 2" ratio="aspect-square" />
              <AlbumPhoto photo={d} alt="앨범 사진 4" ratio="aspect-[3/4]" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="w-8 h-px bg-neutral-700 mx-auto" />
            <p className="font-serif tracking-[0.25em] text-sm text-neutral-800">
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

/** 콜라주 한 칸 — 비율 상자를 먼저 잡아 사진이 늦게 와도 레이아웃이 밀리지 않는다 */
function AlbumPhoto({
  photo,
  alt,
  ratio,
}: {
  photo?: GalleryItem;
  alt: string;
  ratio: string;
}) {
  if (!photo) return null;
  return (
    <div className={`relative w-full overflow-hidden ${ratio}`}>
      <Image
        src={photo.src}
        alt={photo.alt ?? alt}
        fill
        sizes={SIZES}
        quality={70}
        loading="lazy"
        className="object-cover"
      />
    </div>
  );
}
