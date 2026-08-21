"use client";

import { ALBUM_MAX } from "@/lib/wedding";
import type { GalleryItem, PhotoKey } from "@/app/admin/shared";

/** 앨범 (세이브 더 데이트 콜라주) 섹션 */
export default function AlbumSection({
  album,
  uploading,
  addPhotos,
  removePhoto,
  movePhoto,
}: {
  album: GalleryItem[] | undefined;
  uploading: boolean;
  addPhotos: (key: PhotoKey, files: FileList, max: number) => Promise<void>;
  removePhoto: (key: PhotoKey, idx: number) => Promise<void>;
  movePhoto: (key: PhotoKey, idx: number, delta: number) => Promise<void>;
}) {
  return (
    <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-sage-700">
          앨범 — SAVE the DATE 콜라주{" "}
          <span className="text-xs text-neutral-400 font-normal">
            {(album ?? []).length}/{ALBUM_MAX}장
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
                addPhotos("album", e.target.files, ALBUM_MAX);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {(album ?? []).length === 0 ? (
        <p className="text-xs text-neutral-400">
          갤러리와 D-Day 사이에 들어가는 4장 콜라주 카드예요. 사진을 넣어야
          청첩장에 표시돼요.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {(album ?? []).map((g, i) => (
            <div key={g.src} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.src}
                alt={g.alt ?? `앨범 ${i + 1}`}
                className="w-full aspect-[3/4] object-cover border border-wedding-gold/10"
              />
              <div className="flex justify-center gap-1">
                <button
                  onClick={() => movePhoto("album", i, -1)}
                  disabled={i === 0}
                  className="px-1.5 py-1 text-xs border border-neutral-200 text-neutral-500 disabled:opacity-30"
                  title="앞으로"
                >
                  ←
                </button>
                <button
                  onClick={() => movePhoto("album", i, 1)}
                  disabled={i === (album ?? []).length - 1}
                  className="px-1.5 py-1 text-xs border border-neutral-200 text-neutral-500 disabled:opacity-30"
                  title="뒤로"
                >
                  →
                </button>
                <button
                  onClick={() => removePhoto("album", i)}
                  className="px-1.5 py-1 text-xs border border-red-200 text-red-400"
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
        {ALBUM_MAX}장을 채우면 가장 예뻐요 (1·4번째 세로, 2·3번째는 정방형으로
        잘려요). 순서: 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래.
      </p>
    </section>
  );
}
