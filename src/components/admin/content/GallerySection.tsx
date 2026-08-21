"use client";

import { GALLERY_MAX } from "@/lib/wedding";
import type { GalleryItem, PhotoKey } from "@/app/admin/shared";

/** 갤러리 사진 섹션 (슬라이드) */
export default function GallerySection({
  gallery,
  uploading,
  addPhotos,
  removePhoto,
  movePhoto,
}: {
  gallery: GalleryItem[] | undefined;
  uploading: boolean;
  addPhotos: (key: PhotoKey, files: FileList, max: number) => Promise<void>;
  removePhoto: (key: PhotoKey, idx: number) => Promise<void>;
  movePhoto: (key: PhotoKey, idx: number, delta: number) => Promise<void>;
}) {
  return (
    <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-sage-700">
          갤러리 사진{" "}
          <span className="text-xs text-neutral-400 font-normal">
            {(gallery ?? []).length}/{GALLERY_MAX}장
          </span>
        </p>
        <label className="px-3 py-2 text-xs bg-sage-600 text-white cursor-pointer">
          사진 추가 📸
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              if (e.target.files?.length)
                addPhotos("gallery", e.target.files, GALLERY_MAX);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {(gallery ?? []).length === 0 ? (
        <p className="text-xs text-neutral-400">
          업로드한 사진이 없으면 기본 사진(/pic/gallery1~3.jpg)이 표시돼요.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {(gallery ?? []).map((g, i) => (
            <div key={g.src} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.src}
                alt={g.alt ?? `갤러리 ${i + 1}`}
                className="w-full aspect-[4/5] object-cover border border-wedding-gold/10"
              />
              <div className="flex justify-center gap-1">
                <button
                  onClick={() => movePhoto("gallery", i, -1)}
                  disabled={i === 0}
                  className="px-2 py-1 text-xs border border-neutral-200 text-neutral-500 disabled:opacity-30"
                  title="앞으로"
                >
                  ←
                </button>
                <button
                  onClick={() => movePhoto("gallery", i, 1)}
                  disabled={i === (gallery ?? []).length - 1}
                  className="px-2 py-1 text-xs border border-neutral-200 text-neutral-500 disabled:opacity-30"
                  title="뒤로"
                >
                  →
                </button>
                <button
                  onClick={() => removePhoto("gallery", i)}
                  className="px-2 py-1 text-xs border border-red-200 text-red-400"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-neutral-400">
        최대 {GALLERY_MAX}장, 순서대로 슬라이드에 표시돼요. 세로(4:5) 사진이 가장
        예뻐요.
      </p>
    </section>
  );
}
