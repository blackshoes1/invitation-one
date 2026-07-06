import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * 사이트 콘텐츠 설정 (v17) — Admin 에서 관리, 청첩장/완료화면에서 조회.
 * 값이 없으면 각 컴포넌트가 기존 정적 파일·env 값으로 폴백.
 */
export interface GalleryItem {
  src: string;
  /** Storage 경로 (삭제용, 외부 URL 이면 없음) */
  path?: string;
  alt?: string;
}

export interface SiteSettings {
  hero_image?: string;
  gallery?: GalleryItem[];
  /** 앨범(세이브 더 데이트 콜라주) — 최대 4장 */
  album?: GalleryItem[];
  video_url?: string;
  heart_video_url?: string;
}

let cache: SiteSettings | null = null;
let inflight: Promise<SiteSettings> | null = null;

/** 공개 설정 조회 (모듈 캐시 — 세션 중 1회만 네트워크) */
export function getSiteSettings(): Promise<SiteSettings> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  if (!isSupabaseConfigured || !supabase) return Promise.resolve({});
  inflight = (async () => {
    try {
      const { data } = await supabase!.rpc("get_site_settings");
      cache = (data ?? {}) as SiteSettings;
      return cache;
    } catch {
      return {} as SiteSettings;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
