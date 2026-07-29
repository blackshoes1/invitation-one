"use client";

import { useEffect, useState } from "react";
import { GALLERY_MAX, ALBUM_MAX } from "@/lib/wedding";
import {
  type TabCtx,
  type GalleryItem,
  type SiteSettingsState,
  type PhotoKey,
  storagePathFromUrl,
  compressImage,
  UPLOAD_MAX,
} from "@/app/admin/shared";

/** 콘텐츠 탭 — 청첩장 사진(메인/갤러리/앨범)·영상 링크·문자 템플릿. 마운트 시 자체 로드. */
export default function ContentTab({ api, setError, setNotice }: TabCtx) {
  const [siteSettings, setSiteSettings] = useState<SiteSettingsState>({});
  const [videoInput, setVideoInput] = useState("");
  const [heartVideoInput, setHeartVideoInput] = useState("");
  const [confirmSms, setConfirmSms] = useState("");
  const [reviewSms, setReviewSms] = useState("");
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
          setReviewSms(s.review_sms ?? "");
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
      <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
        <p className="text-sm font-medium text-sage-700">메인(첫 화면) 사진</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={siteSettings.hero_image ?? "/pic/wedding_main.jpg"}
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
          {siteSettings.hero_image && (
            <button
              onClick={() => {
                const p = storagePathFromUrl(siteSettings.hero_image!);
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

      {/* 갤러리 사진 */}
      <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-sage-700">
            갤러리 사진{" "}
            <span className="text-xs text-neutral-400 font-normal">
              {(siteSettings.gallery ?? []).length}/{GALLERY_MAX}장
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
        {(siteSettings.gallery ?? []).length === 0 ? (
          <p className="text-xs text-neutral-400">
            업로드한 사진이 없으면 기본 사진(/pic/gallery1~3.jpg)이 표시돼요.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(siteSettings.gallery ?? []).map((g, i) => (
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
                    disabled={i === (siteSettings.gallery ?? []).length - 1}
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

      {/* 앨범 (세이브 더 데이트 콜라주) */}
      <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-sage-700">
            앨범 — SAVE the DATE 콜라주{" "}
            <span className="text-xs text-neutral-400 font-normal">
              {(siteSettings.album ?? []).length}/{ALBUM_MAX}장
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
        {(siteSettings.album ?? []).length === 0 ? (
          <p className="text-xs text-neutral-400">
            갤러리와 D-Day 사이에 들어가는 4장 콜라주 카드예요. 사진을 넣어야
            청첩장에 표시돼요.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {(siteSettings.album ?? []).map((g, i) => (
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
                    disabled={i === (siteSettings.album ?? []).length - 1}
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

      {/* 영상 링크 */}
      <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
        <p className="text-sm font-medium text-sage-700">영상 링크</p>
        <div className="space-y-1">
          <p className="text-[11px] text-neutral-400">
            🛵 배달 완료 화면 — &quot;특별한 영상 메시지&quot; (유튜브 비공개 링크 등)
          </p>
          <div className="flex gap-2">
            <input
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
              placeholder="https://youtu.be/…"
              className="flex-1 p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
            />
            <button
              onClick={() =>
                saveSetting("video_url", videoInput.trim() || null,
                  videoInput.trim() ? "완료 화면 영상을 저장했어요 🎬" : "완료 화면 영상을 비웠어요")
              }
              className="px-3 bg-sage-600 text-white text-xs whitespace-nowrap"
            >
              저장
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-neutral-400">
            💌 마음 배송 완료 — &quot;두 사람의 짧은 감사 영상&quot;
          </p>
          <div className="flex gap-2">
            <input
              value={heartVideoInput}
              onChange={(e) => setHeartVideoInput(e.target.value)}
              placeholder="https://youtu.be/…"
              className="flex-1 p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
            />
            <button
              onClick={() =>
                saveSetting("heart_video_url", heartVideoInput.trim() || null,
                  heartVideoInput.trim() ? "감사 영상을 저장했어요 🎬" : "감사 영상을 비웠어요")
              }
              className="px-3 bg-sage-600 text-white text-xs whitespace-nowrap"
            >
              저장
            </button>
          </div>
        </div>
        <p className="text-[11px] text-neutral-400">
          비워두면 기존 환경변수(NEXT_PUBLIC_VIDEO_URL 등) 값이 대신 쓰여요.
        </p>
      </section>

      {/* 확정 감사 문자 (LC-2) */}
      <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
        <p className="text-sm font-medium text-sage-700">확정 감사 문자</p>
        <p className="text-[11px] text-neutral-400">
          주문을 <b>확정</b> 처리할 때 하객에게 자동 발송돼요 (연락처 보유자만).
          <br />
          치환: <code>{"{이름}"}</code> <code>{"{날짜}"}</code>{" "}
          <code>{"{시간}"}</code> <code>{"{장소}"}</code>
        </p>
        <textarea
          value={confirmSms}
          maxLength={300}
          onChange={(e) => setConfirmSms(e.target.value)}
          placeholder="[청첩장 배달] {이름}님, 소중한 마음으로 신청해주셔서 감사합니다 🙏 {날짜} {시간} {장소}(으)로 찾아뵙겠습니다. 곧 만나요!"
          className="w-full p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600 resize-none h-24"
        />
        <div className="flex justify-end gap-2">
          {confirmSms && (
            <button
              onClick={() =>
                saveSetting("confirm_sms", null, "기본 문구로 되돌렸어요").then(
                  () => setConfirmSms("")
                )
              }
              className="px-3 py-1.5 text-xs border border-neutral-200 text-neutral-500"
            >
              기본 문구로
            </button>
          )}
          <button
            onClick={() =>
              saveSetting(
                "confirm_sms",
                confirmSms.trim() || null,
                confirmSms.trim() ? "확정 감사 문자를 저장했어요 💬" : "기본 문구로 되돌렸어요"
              )
            }
            className="px-3 py-1.5 text-xs bg-sage-600 text-white"
          >
            저장
          </button>
        </div>
        <p className="text-[11px] text-neutral-400">
          비워두면 기본 감사 문구가 발송돼요. (솔라피 키 없으면 발송은 skip)
        </p>
      </section>

      {/* 리뷰요청 문자 (DL-3) */}
      <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
        <p className="text-sm font-medium text-sage-700">리뷰요청 문자</p>
        <p className="text-[11px] text-neutral-400">
          주문을 <b>완료</b> 처리할 때 하객에게 자동 발송돼요 (연락처 보유자만).
          <br />
          치환: <code>{"{이름}"}</code> <code>{"{날짜}"}</code>{" "}
          <code>{"{시간}"}</code> <code>{"{장소}"}</code>{" "}
          <code>{"{링크}"}</code>(개인 리뷰 페이지)
        </p>
        <textarea
          value={reviewSms}
          maxLength={300}
          onChange={(e) => setReviewSms(e.target.value)}
          placeholder="[청첩장 배달] {이름}님, 청첩장 잘 받으셨나요? 😊 짧은 한줄 후기를 남겨주시면 큰 힘이 됩니다 🙏 {링크}"
          className="w-full p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600 resize-none h-24"
        />
        <div className="flex justify-end gap-2">
          {reviewSms && (
            <button
              onClick={() =>
                saveSetting("review_sms", null, "기본 문구로 되돌렸어요").then(
                  () => setReviewSms("")
                )
              }
              className="px-3 py-1.5 text-xs border border-neutral-200 text-neutral-500"
            >
              기본 문구로
            </button>
          )}
          <button
            onClick={() =>
              saveSetting(
                "review_sms",
                reviewSms.trim() || null,
                reviewSms.trim() ? "리뷰요청 문자를 저장했어요 💬" : "기본 문구로 되돌렸어요"
              )
            }
            className="px-3 py-1.5 text-xs bg-sage-600 text-white"
          >
            저장
          </button>
        </div>
        <p className="text-[11px] text-neutral-400">
          <code>{"{링크}"}</code>는 하객 본인의 리뷰 페이지 주소로 자동 치환돼요.
          비워두면 기본 문구가 발송돼요.
        </p>
      </section>
    </div>
  );
}
