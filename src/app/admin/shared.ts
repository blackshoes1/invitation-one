import type { Delivery, DeliveryStatus, Participant } from "@/lib/supabase";
import { toYmd } from "@/lib/wedding";

/* ==========================================================================
   admin 공용 타입·유틸 — page.tsx 와 탭 컴포넌트(src/components/admin/*)가
   함께 사용하는 순수 로직만 모아둔다 (React 상태 없음).
   ========================================================================== */

/** 참여 시스템: 주문 + 참여자 목록 */
export type AdminDelivery = Delivery & { participants: Participant[] };

/**
 * 전체 신청 집계 (그룹 미지정 포함) — 전부 **기록 수**다 (docs/COUNTING.md).
 * records = orders + hearts 이지 고유 인원도 식수도 아니다.
 */
export interface Totals {
  /** 취소되지 않은 직접배달 신청 기록 수 */
  orders: number;
  /** 마음배송 기록 수 */
  hearts: number;
  /** 두 종류의 합 */
  records: number;
}

/** 탭 컴포넌트가 부모(page)로부터 받는 공통 컨텍스트 */
export type AdminApi = (path: string, init?: RequestInit) => Promise<Response>;
export interface TabCtx {
  /** 쿠키 세션 fetch 래퍼 — 401 이면 부모가 로그인 화면으로 되돌림 */
  api: AdminApi;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
}

export const ownerName = (r: AdminDelivery) =>
  r.participants?.find((p) => p.is_owner)?.name ??
  r.participants?.[0]?.name ??
  r.name ??
  "—";

/** 이번 주(일~토) 범위의 YMD */
export function thisWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toYmd(start), toYmd(end)];
}

/** 활성 배달들을 .ics 캘린더 문자열로 */
export function buildIcs(rows: AdminDelivery[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cheong//delivery//KO",
  ];
  for (const r of rows) {
    if (r.status === "취소") continue;
    const d = r.date.replace(/-/g, "");
    const count = r.participants?.length ?? 1;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@cheong`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:청첩장배달 - ${ownerName(r)} 외 ${Math.max(0, count - 1)}명 (${r.time_slot})`,
      `DESCRIPTION:${r.location} / ${count}명 / ${r.status}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export const STATUS_TABS: DeliveryStatus[] = ["대기중", "확정", "완료", "취소"];
export const NEXT_ACTION: Record<DeliveryStatus, DeliveryStatus | null> = {
  대기중: "확정",
  확정: "완료",
  완료: null,
  취소: null,
};

export type View =
  | "dashboard"
  | "orders"
  | "calendar"
  | "route"
  | "groups"
  | "waiting"
  | "messages"
  | "content"
  | "snap"
  | "field";

export interface AdminStats {
  participants: { total: number; delivery: number; heart: number };
  deliveries: { waiting: number; confirmed: number; done: number; canceled: number; active: number };
  waiting: number;
  snaps: number;
  checkin?: { checkins: number; people: number };
}

/** 콘텐츠 설정 (site_settings) */
export interface GalleryItem {
  src: string;
  path?: string;
  alt?: string;
}
export interface SiteSettingsState {
  hero_image?: string;
  gallery?: GalleryItem[];
  album?: GalleryItem[];
  video_url?: string;
  heart_video_url?: string;
  confirm_sms?: string;
  review_sms?: string;
}

/** 사진 목록형 설정 키 (갤러리 슬라이드 / 앨범 콜라주) */
export type PhotoKey = "gallery" | "album";

/** 업로드 URL → Storage 경로 (버킷 내 파일만, 삭제용) */
export function storagePathFromUrl(url: string): string | null {
  const part = url.split("/invitation-media/")[1];
  return part ? decodeURIComponent(part.split("?")[0]) : null;
}

/**
 * 업로드 전 브라우저 리사이즈/압축 — Vercel 요청 본문 한도(4.5MB) 대응.
 * 긴 변 2000px + JPEG 85% 면 청첩장 표시 화질로 충분하고 대개 1MB 안쪽.
 * 실패(HEIC 미지원 등)하면 원본 그대로 반환.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob || blob.size >= file.size) return file; // 압축 효과 없으면 원본
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/** Vercel 서버리스 요청 한도보다 살짝 보수적인 실제 업로드 상한 */
export const UPLOAD_MAX = 4 * 1024 * 1024;

export const CAL_MONTHS = [6, 7, 8, 9]; // 7~10월(0-base)
export const CAL_YEAR = 2026;
export const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
