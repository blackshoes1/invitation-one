"use client";

import { type AdminApi, storagePathFromUrl } from "@/app/admin/shared";
import type { SaveSetting } from "./types";

/** 메인(첫 화면) 사진 섹션 */
export default function HeroSection({
  api,
  heroImage,
  uploading,
  changeHero,
  saveSetting,
}: {
  api: AdminApi;
  heroImage: string | undefined;
  uploading: boolean;
  changeHero: (file: File) => Promise<void>;
  saveSetting: SaveSetting;
}) {
  return (
    <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
      <p className="text-sm font-medium text-sage-700">메인(첫 화면) 사진</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={heroImage ?? "/pic/wedding_main.jpg"}
        alt="메인 사진 미리보기"
        className="w-full max-h-72 object-cover border border-wedding-gold/10"
      />
      <div className="flex gap-2">
        <label className="px-3 py-2 text-xs bg-sage-600 text-white cursor-pointer">
          사진 교체 📤
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) changeHero(f);
              e.target.value = "";
            }}
          />
        </label>
        {heroImage && (
          <button
            onClick={() => {
              const p = storagePathFromUrl(heroImage!);
              saveSetting("hero_image", null, "기본 사진으로 되돌렸어요");
              if (p)
                api(`/api/admin/upload?path=${encodeURIComponent(p)}`, {
                  method: "DELETE",
                });
            }}
            className="px-3 py-2 text-xs border border-neutral-300 text-neutral-500"
          >
            기본 사진으로 되돌리기
          </button>
        )}
      </div>
    </section>
  );
}
