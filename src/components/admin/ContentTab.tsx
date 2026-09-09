"use client";

import { useEffect, useState } from "react";
import {
  type TabCtx,
  type GalleryItem,
  type SiteSettingsState,
  type PhotoKey,
  storagePathFromUrl,
  compressImage,
  UPLOAD_MAX,
} from "@/app/admin/shared";
import HeroSection from "./content/HeroSection";
import GallerySection from "./content/GallerySection";
import AlbumSection from "./content/AlbumSection";
import VideoSection from "./content/VideoSection";
import ConfirmSmsSection from "./content/ConfirmSmsSection";

/** 콘텐츠 탭 — 청첩장 사진(메인/갤러리/앨범)·영상 링크·문자 템플릿. 마운트 시 자체 로드. */
export default function ContentTab({ api, setError, setNotice }: TabCtx) {
  const [siteSettings, setSiteSettings] = useState<SiteSettingsState>({});
  const [videoInput, setVideoInput] = useState("");
  const [heartVideoInput, setHeartVideoInput] = useState("");
  const [confirmSms, setConfirmSms] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/admin/settings");
        if (res.ok && alive) {
          const j = await res.json();
          const s = (j.settings ?? {}) as SiteSettingsState;
          setSiteSettings(s);
          setVideoInput(s.video_url ?? "");
          setHeartVideoInput(s.heart_video_url ?? "");
          setConfirmSms(s.confirm_sms ?? "");
        }
      } catch {
        if (alive) setError("콘텐츠 설정을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 설정 저장 (value null = 삭제 → 기본값 폴백) */
  const saveSetting = async (key: string, value: unknown, msg?: string) => {
    setError(null);
    try {
      const res = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ key, value }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status !== 401) setError(j.error ?? "저장 실패");
        return false;
      }
      setSiteSettings((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        if (value === null) delete next[key];
        else next[key] = value;
        return next as SiteSettingsState;
      });
      if (msg) setNotice(msg);
      return true;
    } catch {
      setError("저장 요청이 실패했습니다. 네트워크를 확인해주세요.");
      return false;
    }
  };

  /** 사진 업로드 (자동 압축) → { url, path } (실패 시 null — 루프 중단 없음) */
  const uploadImage = async (raw: File, kind: "hero" | PhotoKey) => {
    try {
      const file = await compressImage(raw);
      if (file.size > UPLOAD_MAX) {
        setError(`"${raw.name}" 사진이 너무 커요 (압축 후에도 4MB 초과). 이 사진은 건너뛰었어요.`);
        return null;
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      let j: { url?: string; path?: string; error?: string } = {};
      try {
        j = await res.json();
      } catch {
        /* 413 등 비-JSON 응답 */
      }
      if (!res.ok || !j.url || !j.path) {
        setError(
          j.error ??
            (res.status === 413
              ? `"${raw.name}" 사진이 너무 커서 서버가 거절했어요.`
              : `"${raw.name}" 업로드 실패 (${res.status})`)
        );
        return null;
      }
      return j as { url: string; path: string };
    } catch {
      setError(`"${raw.name}" 업로드 중 오류가 발생했어요.`);
      return null;
    }
  };

  /** 메인 사진 교체 */
  const changeHero = async (file: File) => {
    setUploading(true);
    setError(null);
    const prev = siteSettings.hero_image;
    const up = await uploadImage(file, "hero");
    if (up && (await saveSetting("hero_image", up.url, "메인 사진을 교체했어요 🖼️"))) {
      // 이전 업로드 파일 정리 (버킷 파일일 때만)
      const prevPath = prev ? storagePathFromUrl(prev) : null;
      if (prevPath) api(`/api/admin/upload?path=${encodeURIComponent(prevPath)}`, { method: "DELETE" });
    }
    setUploading(false);
  };

  /** 사진 목록(갤러리/앨범)에 사진 추가 (여러 장, 상한 적용) */
  const addPhotos = async (key: PhotoKey, files: FileList, max: number) => {
    const current = siteSettings[key] ?? [];
    const remaining = max - current.length;
    if (remaining <= 0) {
      setError(`최대 ${max}장까지예요. 기존 사진을 지우고 추가해주세요.`);
      return;
    }
    setUploading(true);
    setError(null);
    const picked = Array.from(files).slice(0, remaining);
    const added: GalleryItem[] = [];
    for (const file of picked) {
      const up = await uploadImage(file, key);
      if (up) added.push({ src: up.url, path: up.path });
    }
    if (added.length > 0) {
      const next = [...current, ...added];
      await saveSetting(
        key,
        next,
        files.length > remaining
          ? `사진 ${added.length}장 추가 — 최대 ${max}장이라 나머지는 제외했어요`
          : `사진 ${added.length}장을 추가했어요 📸`
      );
    }
    setUploading(false);
  };

  /** 사진 목록에서 삭제 */
  const removePhoto = async (key: PhotoKey, idx: number) => {
    const list = siteSettings[key] ?? [];
    const target = list[idx];
    if (!target) return;
    const next = list.filter((_, i) => i !== idx);
    if (
      await saveSetting(
        key,
        next.length > 0 ? next : null,
        next.length > 0
          ? "사진을 삭제했어요"
          : key === "gallery"
          ? "사진을 모두 지웠어요 — 기본 사진으로 표시돼요"
          : "사진을 모두 지웠어요 — 앨범 섹션이 숨겨져요"
      )
    ) {
      const p = target.path ?? storagePathFromUrl(target.src);
      if (p) api(`/api/admin/upload?path=${encodeURIComponent(p)}`, { method: "DELETE" });
    }
  };

  /** 사진 목록 순서 이동 */
  const movePhoto = async (key: PhotoKey, idx: number, delta: number) => {
    const list = [...(siteSettings[key] ?? [])];
    const j = idx + delta;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    await saveSetting(key, list);
  };

  return (
    <div className="space-y-5">
      {loading && (
        <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
      )}
      {uploading && (
        <p className="text-xs text-center text-sage-700 bg-sage-50 py-2 border border-sage-200">
          업로드 중… 잠시만요 📤
        </p>
      )}

      {/* 메인 사진 */}
      <HeroSection
        api={api}
        heroImage={siteSettings.hero_image}
        uploading={uploading}
        changeHero={changeHero}
        saveSetting={saveSetting}
      />

      {/* 갤러리 사진 */}
      <GallerySection
        gallery={siteSettings.gallery}
        uploading={uploading}
        addPhotos={addPhotos}
        removePhoto={removePhoto}
        movePhoto={movePhoto}
      />

      {/* 앨범 (세이브 더 데이트 콜라주) */}
      <AlbumSection
        album={siteSettings.album}
        uploading={uploading}
        addPhotos={addPhotos}
        removePhoto={removePhoto}
        movePhoto={movePhoto}
      />

      {/* 영상 링크 */}
      <VideoSection
        videoInput={videoInput}
        setVideoInput={setVideoInput}
        heartVideoInput={heartVideoInput}
        setHeartVideoInput={setHeartVideoInput}
        saveSetting={saveSetting}
      />

      {/* 확정 감사 문자 (LC-2) */}
      <ConfirmSmsSection
        confirmSms={confirmSms}
        setConfirmSms={setConfirmSms}
        saveSetting={saveSetting}
      />
    </div>
  );
}
