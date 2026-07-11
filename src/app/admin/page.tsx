"use client";

import { useMemo, useState } from "react";
import type {
  Delivery,
  DeliveryStatus,
  TrackingStage,
  Group,
  GroupMemberRow,
  WaitingEntry,
  Participant,
  GuestPhotoAdmin,
  RouteDay,
} from "@/lib/supabase";
import RouteMap from "@/components/RouteMap";
import { TRACKING_STAGES } from "@/lib/supabase";
import {
  formatYmdKo,
  toYmd,
  slotsForDate,
  DELIVERY_START,
  DELIVERY_END,
  GALLERY_MAX,
  ALBUM_MAX,
} from "@/lib/wedding";

/** 참여 시스템: 주문 + 참여자 목록 */
type AdminDelivery = Delivery & { participants: Participant[] };

const ownerName = (r: AdminDelivery) =>
  r.participants?.find((p) => p.is_owner)?.name ??
  r.participants?.[0]?.name ??
  r.name ??
  "—";

/** 이번 주(일~토) 범위의 YMD */
function thisWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toYmd(start), toYmd(end)];
}

/** 활성 배달들을 .ics 캘린더 문자열로 */
function buildIcs(rows: AdminDelivery[]): string {
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

const STATUS_TABS: DeliveryStatus[] = ["대기중", "확정", "완료", "취소"];
const NEXT_ACTION: Record<DeliveryStatus, DeliveryStatus | null> = {
  대기중: "확정",
  확정: "완료",
  완료: null,
  취소: null,
};
type View = "orders" | "calendar" | "route" | "groups" | "waiting" | "messages" | "content" | "snap";

/** 콘텐츠 설정 (site_settings) */
interface GalleryItem {
  src: string;
  path?: string;
  alt?: string;
}
interface SiteSettingsState {
  hero_image?: string;
  gallery?: GalleryItem[];
  album?: GalleryItem[];
  video_url?: string;
  heart_video_url?: string;
}

/** 사진 목록형 설정 키 (갤러리 슬라이드 / 앨범 콜라주) */
type PhotoKey = "gallery" | "album";

/** 업로드 URL → Storage 경로 (버킷 내 파일만, 삭제용) */
function storagePathFromUrl(url: string): string | null {
  const part = url.split("/invitation-media/")[1];
  return part ? decodeURIComponent(part.split("?")[0]) : null;
}

/**
 * 업로드 전 브라우저 리사이즈/압축 — Vercel 요청 본문 한도(4.5MB) 대응.
 * 긴 변 2000px + JPEG 85% 면 청첩장 표시 화질로 충분하고 대개 1MB 안쪽.
 * 실패(HEIC 미지원 등)하면 원본 그대로 반환.
 */
async function compressImage(file: File): Promise<File> {
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
const UPLOAD_MAX = 4 * 1024 * 1024;

const CAL_MONTHS = [6, 7, 8, 9]; // 7~10월(0-base)
const CAL_YEAR = 2026;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<View>("orders");

  const [tab, setTab] = useState<DeliveryStatus>("대기중");
  const [groupFilter, setGroupFilter] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminDelivery[]>([]);
  const [allRows, setAllRows] = useState<AdminDelivery[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  /** 전체 등록인원 (취소 주문 참여자 제외, 그룹 미지정 포함) */
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
  const [messages, setMessages] = useState<Participant[]>([]);
  const [snaps, setSnaps] = useState<GuestPhotoAdmin[]>([]);
  const [routeDays, setRouteDays] = useState<RouteDay[]>([]);
  const [routeOrigin, setRouteOrigin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeDate, setRouteDate] = useState<string>("");
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  /** 그룹 생성 시 제안 일정 (선택) */
  const [offerDate, setOfferDate] = useState("");
  const [offerTime, setOfferTime] = useState("");
  const [offerLocation, setOfferLocation] = useState("");
  /** 기존 그룹의 제안 일정 편집 상태 */
  const [editOffer, setEditOffer] = useState<{
    gid: string;
    date: string;
    time: string;
    location: string;
  } | null>(null);

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, GroupMemberRow[]>>({});
  const [newMember, setNewMember] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kakao, setKakao] = useState<"ok" | "expired" | "unconfigured" | null>(null);

  /* ----- 콘텐츠 (사진/영상) ----- */
  const [siteSettings, setSiteSettings] = useState<SiteSettingsState>({});
  const [videoInput, setVideoInput] = useState("");
  const [heartVideoInput, setHeartVideoInput] = useState("");
  const [uploading, setUploading] = useState(false);

  const groupName = (id: string | null) =>
    id ? groups.find((g) => g.id === id)?.name ?? "그룹" : "—";

  // 쿠키 세션으로 인증 — 비밀번호는 로그인 시 1회만 전송
  const api = (path: string, init?: RequestInit) =>
    fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

  const loadGroups = async () => {
    const res = await api("/api/admin/groups");
    if (res.ok) {
      const j = await res.json();
      setGroups(j.groups ?? []);
      setTotalMembers(typeof j.total_members === "number" ? j.total_members : null);
    }
  };

  const loadOrders = async (
    status: DeliveryStatus = tab,
    gid: string = groupFilter
  ) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const qs = new URLSearchParams({ status });
      if (gid) qs.set("group_id", gid);
      const res = await api(`/api/admin/deliveries?${qs}`);
      if (res.status === 401) {
        setError("세션이 만료되었습니다. 다시 로그인해주세요.");
        setAuthed(false);
        return;
      }
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? "불러오기 실패");
      setRows(j.deliveries ?? []);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendar = async () => {
    setLoading(true);
    const [res, blockedRes] = await Promise.all([
      api("/api/admin/deliveries"),
      api("/api/admin/blocked"),
    ]);
    if (res.ok) setAllRows((await res.json()).deliveries ?? []);
    if (blockedRes.ok)
      setBlocked(new Set(((await blockedRes.json()).dates ?? []) as string[]));
    setLoading(false);
  };

  /** 날짜 선택 토글 (다중 선택 → 일괄 차단/해제) */
  const toggleSelect = (ymd: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  };

  /** 선택한 날짜들 일괄 마감/해제 (주문 있는 날짜도 마감 가능 — 신규 신청만 차단) */
  const applyBlock = async (block: boolean) => {
    if (selected.size === 0) return;
    setError(null);
    setNotice(null);
    const res = await api("/api/admin/blocked", {
      method: "POST",
      body: JSON.stringify({ dates: [...selected], block }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "마감 처리 실패");
    setBlocked((prev) => {
      const next = new Set(prev);
      for (const d of selected) {
        if (block) next.add(d);
        else next.delete(d);
      }
      return next;
    });
    setSelected(new Set());
    setNotice(
      block
        ? `${j.done}개 날짜를 마감했어요 🚫 (기존 주문은 유지돼요)`
        : `${j.done}개 날짜 마감을 해제했어요 ✅`
    );
  };

  const loadWaiting = async () => {
    setLoading(true);
    const res = await api("/api/admin/waiting");
    const j = await res.json();
    setWaiting(res.ok ? j.waiting ?? [] : []);
    setLoading(false);
  };

  const loadMessages = async () => {
    setLoading(true);
    const res = await api("/api/admin/messages");
    const j = await res.json();
    setMessages(res.ok ? j.messages ?? [] : []);
    setLoading(false);
  };

  const loadRoute = async () => {
    setLoading(true);
    setError(null);
    const res = await api("/api/admin/route");
    const j = await res.json();
    if (res.ok) {
      const days = (j.days ?? []) as RouteDay[];
      setRouteDays(days);
      setRouteOrigin(j.origin ?? null);
      setRouteDate((prev) =>
        prev && days.some((d) => d.date === prev) ? prev : days[0]?.date ?? ""
      );
    } else setError(j.error ?? "경로 불러오기 실패");
    setLoading(false);
  };

  const loadSnaps = async () => {
    setLoading(true);
    const res = await api("/api/admin/guest-photos");
    const j = await res.json();
    setSnaps(res.ok ? j.photos ?? [] : []);
    setLoading(false);
  };

  const toggleSnap = async (id: string, approved: boolean) => {
    const res = await api("/api/admin/guest-photos", {
      method: "PATCH",
      body: JSON.stringify({ id, approved }),
    });
    if (res.ok)
      setSnaps((s) => s.map((p) => (p.id === id ? { ...p, approved } : p)));
  };

  const deleteSnap = async (id: string) => {
    if (!confirm("이 사진을 삭제할까요? (되돌릴 수 없어요)")) return;
    const res = await api(`/api/admin/guest-photos?id=${id}`, { method: "DELETE" });
    if (res.ok) setSnaps((s) => s.filter((p) => p.id !== id));
  };

  const loadContent = async () => {
    setLoading(true);
    const res = await api("/api/admin/settings");
    if (res.ok) {
      const j = await res.json();
      const s = (j.settings ?? {}) as SiteSettingsState;
      setSiteSettings(s);
      setVideoInput(s.video_url ?? "");
      setHeartVideoInput(s.heart_video_url ?? "");
    }
    setLoading(false);
  };

  /** 설정 저장 (value null = 삭제 → 기본값 폴백) */
  const saveSetting = async (key: string, value: unknown, msg?: string) => {
    setError(null);
    const res = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "저장 실패");
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

  const downloadIcs = () => {
    const blob = new Blob([buildIcs(allRows)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "delivery-schedule.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("비밀번호가 올바르지 않습니다.");
        return;
      }
      setAuthed(true);
      await loadGroups();
      await loadOrders("대기중", "");
      // 카카오 알림 연결 상태 (만료 사전 경고)
      api("/api/admin/kakao-status")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setKakao(j.status));
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (id: string, status: DeliveryStatus) => {
    setNotice(null);
    const res = await api(`/api/admin/deliveries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "변경 실패");
    if (status === "확정" || status === "취소") {
      const sms = j.sms as
        | { count: number; sent: number; skipped: boolean }
        | null;
      const label = status === "확정" ? "확정" : "취소";
      setNotice(
        !sms || sms.count === 0
          ? `${label} 처리됨 — 연락처 보유 참여자가 없어 SMS 미발송.`
          : sms.skipped
          ? `${label} 처리됨 — SMS는 솔라피 키 미설정으로 미발송 (${sms.count}명 대상).`
          : `${label} 처리 및 참여자 ${sms.sent}/${sms.count}명에게 SMS 발송 완료.`
      );
    }
    loadOrders();
  };

  const changeStage = async (id: string, stage: TrackingStage) => {
    setNotice(null);
    // 낙관적 업데이트
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, tracking_stage: stage } : r))
    );
    const res = await api(`/api/admin/deliveries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ tracking_stage: stage }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "단계 변경 실패");
      loadOrders();
    }
  };

  const createGroup = async () => {
    if (!newGroup.trim()) return;
    if (offerDate && !offerTime)
      return setError("제안 일정의 시간대를 선택해주세요.");
    const res = await api("/api/admin/groups", {
      method: "POST",
      body: JSON.stringify({
        name: newGroup.trim(),
        offer_date: offerDate || null,
        offer_time: offerTime || null,
        offer_location: offerLocation || null,
      }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "그룹 생성 실패");
    setNewGroup("");
    setOfferDate("");
    setOfferTime("");
    setOfferLocation("");
    setNotice(
      offerDate
        ? "그룹을 만들고 일정을 제안했어요 📅 링크를 공유하면 하객이 승낙만 하면 돼요."
        : "그룹을 만들었어요."
    );
    loadGroups();
  };

  /** 기존 그룹 제안 일정 저장 (빈 날짜로 저장 = 제안 해제) */
  const saveOffer = async (clear = false) => {
    if (!editOffer) return;
    if (!clear && editOffer.date && !editOffer.time)
      return setError("제안 일정의 시간대를 선택해주세요.");
    if (!clear && !editOffer.date)
      return setError("제안 날짜를 선택해주세요.");
    const res = await api(`/api/admin/groups/${editOffer.gid}`, {
      method: "PATCH",
      body: JSON.stringify({
        set_offer: true,
        offer_date: clear ? null : editOffer.date,
        offer_time: clear ? null : editOffer.time,
        offer_location: clear ? null : editOffer.location || null,
      }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "제안 저장 실패");
    setEditOffer(null);
    setNotice(clear ? "제안 일정을 해제했어요." : "제안 일정을 저장했어요 📅");
    loadGroups();
  };

  /** 주문 합치기 — mergeSource 의 참여자를 target 으로 이동
   *  (합석 의사는 신청 시점에 하객이 페이지에서 직접 확인 — 합석 제안 UI) */
  const doMerge = async (targetId: string) => {
    if (!mergeSource) return;
    if (!confirm("선택한 주문의 참여자를 이 주문으로 옮기고, 원래 주문은 취소할까요?"))
      return;
    setNotice(null);
    setError(null);
    const res = await api("/api/admin/merge", {
      method: "POST",
      body: JSON.stringify({ source_id: mergeSource, target_id: targetId }),
    });
    const j = await res.json();
    setMergeSource(null);
    if (!res.ok) return setError(j.error ?? "합치기 실패");
    setNotice(`참여자 ${j.moved}명을 옮기고 주문을 합쳤어요 🔗`);
    loadOrders();
  };

  /** 그룹명 수정 */
  const renameGroup = async (gid: string, current: string) => {
    const name = prompt("새 그룹명을 입력해주세요", current);
    if (!name?.trim() || name.trim() === current) return;
    const res = await api(`/api/admin/groups/${gid}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "그룹명 수정 실패");
    setNotice("그룹명을 수정했어요 ✏️");
    loadGroups();
  };

  const copyLink = (slug: string) => {
    navigator.clipboard?.writeText(
      `${window.location.origin}/delivery/group/${slug}`
    );
    setNotice("그룹 링크가 복사되었습니다.");
  };

  const toggleMembers = async (gid: string) => {
    if (openGroup === gid) return setOpenGroup(null);
    setOpenGroup(gid);
    const res = await api(`/api/admin/groups/${gid}/members`);
    if (res.ok) {
      const j = await res.json();
      setMembers((m) => ({ ...m, [gid]: j.members ?? [] }));
    }
  };

  const addMember = async (gid: string) => {
    if (!newMember.trim()) return;
    const res = await api(`/api/admin/groups/${gid}/members`, {
      method: "POST",
      body: JSON.stringify({ name: newMember.trim() }),
    });
    if (res.ok) {
      setNewMember("");
      const list = await api(`/api/admin/groups/${gid}/members`);
      if (list.ok) {
        const j = await list.json();
        setMembers((m) => ({ ...m, [gid]: j.members ?? [] }));
      }
    }
  };

  const removeMember = async (gid: string, memberId: string) => {
    const res = await api(
      `/api/admin/groups/${gid}/members?member_id=${memberId}`,
      { method: "DELETE" }
    );
    if (res.ok)
      setMembers((m) => ({
        ...m,
        [gid]: (m[gid] ?? []).filter((x) => x.id !== memberId),
      }));
  };

  const deleteWaiting = async (id: string) => {
    const res = await api(`/api/admin/waiting/${id}`, { method: "DELETE" });
    if (res.ok) setWaiting((w) => w.filter((x) => x.id !== id));
  };

  const notifyWaiting = async (id?: string) => {
    setNotice(null);
    setError(null);
    const who = id ? "선택한 대기자" : `대기자 ${waiting.length}명`;
    if (!confirm(`${who}에게 빈자리 안내 SMS를 보낼까요?`)) return;
    const res = await api("/api/admin/waiting/notify", {
      method: "POST",
      body: JSON.stringify(id ? { id } : {}),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "알림 발송 실패");
    setNotice(
      j.skipped
        ? `${j.count}명 대상 — SMS는 솔라피 키 미설정으로 미발송(로그만).`
        : `${j.sent}/${j.count}명에게 빈자리 안내 SMS 발송 완료.`
    );
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.participants ?? []).some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone ?? "").toLowerCase().includes(q)
      )
    );
  }, [rows, search]);

  // 캘린더용: 날짜 → 활성(취소 제외) 주문 목록 (같은 날 여러 팀 가능)
  const byDate = useMemo(() => {
    const m: Record<string, AdminDelivery[]> = {};
    for (const r of allRows)
      if (r.status !== "취소") m[r.date] = [...(m[r.date] ?? []), r];
    return m;
  }, [allRows]);

  /* ----------------------------- 로그인 ----------------------------- */
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-wedding-cream px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
          className="w-full max-w-xs space-y-4 bg-white p-8 border border-wedding-gold/20"
        >
          <h1 className="font-serif text-lg text-sage-700 text-center tracking-widest">
            배달 관리자
          </h1>
          {/* text-base(16px) — 모바일에서 포커스 시 화면 확대(iOS 자동 줌) 방지 */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="관리자 비밀번호"
            className="w-full p-3 border border-wedding-gold/25 bg-transparent focus:outline-none focus:border-sage-600 text-base text-sage-700 rounded-none"
          />
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sage-700 text-white text-xs tracking-[0.2em] disabled:opacity-60"
          >
            {loading ? "확인 중…" : "입장"}
          </button>
        </form>
      </main>
    );
  }

  /* ----------------------------- 본문 ----------------------------- */
  return (
    <main className="min-h-screen bg-wedding-cream px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="font-serif text-xl text-sage-700 tracking-widest text-center">
          배달 관리자
        </h1>

        <div className="flex justify-center gap-2 flex-wrap">
          {(
            [
              ["orders", "주문"],
              ["calendar", "캘린더"],
              ["route", "배송경로"],
              ["groups", "그룹"],
              ["waiting", "대기자"],
              ["messages", "방명록"],
              ["snap", "하객스냅"],
              ["content", "콘텐츠"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if (v === "orders") loadOrders();
                if (v === "calendar") loadCalendar();
                if (v === "route") loadRoute();
                if (v === "groups") loadGroups();
                if (v === "waiting") loadWaiting();
                if (v === "messages") loadMessages();
                if (v === "snap") loadSnaps();
                if (v === "content") loadContent();
              }}
              className={`px-4 py-2 text-xs tracking-wider border ${
                view === v
                  ? "bg-sage-700 text-white border-sage-700"
                  : "bg-white text-neutral-500 border-wedding-gold/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {kakao === "expired" && (
          <p className="text-xs text-center text-red-600 bg-red-50 py-2 border border-red-200">
            🔔 카카오 알림 연결이 만료됐어요 — 새 주문 알림이 오지 않습니다. refresh
            token 재발급이 필요해요 (README/kakao.ts 참고).
          </p>
        )}
        {kakao === "ok" && (
          <p className="text-[11px] text-center text-sage-500">🔔 카카오 알림 연결됨</p>
        )}

        {notice && (
          <p className="text-xs text-center text-sage-700 bg-sage-50 py-2 border border-sage-200">
            {notice}
          </p>
        )}
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        {loading && (
          <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
        )}

        {/* ===== 주문 ===== */}
        {view === "orders" && (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {STATUS_TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    loadOrders(t, groupFilter);
                  }}
                  className={`px-4 py-2 text-xs tracking-wider border ${
                    tab === t
                      ? "bg-sage-600 text-white border-sage-600"
                      : "bg-white text-neutral-500 border-wedding-gold/20"
                  }`}
                >
                  {t}
                </button>
              ))}
              <select
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  loadOrders(tab, e.target.value);
                }}
                className="px-3 py-2 text-xs border border-wedding-gold/20 bg-white text-neutral-600"
              >
                <option value="">전체 그룹</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 · 연락처 검색"
                className="flex-1 p-2.5 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
              />
              <a
                href="/api/admin/export"
                className="shrink-0 flex items-center px-3 text-xs border border-sage-300 text-sage-600 bg-white whitespace-nowrap"
                title="참여자 연락처 CSV 내보내기"
              >
                CSV ⬇
              </a>
            </div>

            {mergeSource && (
              <p className="text-xs text-center text-delivery bg-delivery/5 border border-delivery/20 py-2">
                🔗 합칠 대상 주문의 [여기로 합치기] 버튼을 눌러주세요
                <button
                  onClick={() => setMergeSource(null)}
                  className="ml-2 underline text-neutral-400"
                >
                  취소
                </button>
              </p>
            )}

            {!loading && filteredRows.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                해당 조건의 신청이 없습니다.
              </p>
            )}

            <div className="space-y-3">
              {filteredRows.map((r) => {
                const nextAction = NEXT_ACTION[r.status];
                const cancelable = r.status !== "취소" && r.status !== "완료";
                return (
                  <div
                    key={r.id}
                    className="bg-white border border-wedding-gold/15 p-4 text-sm flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <p className="font-medium text-sage-700">
                          {ownerName(r)}
                          {(r.participants?.length ?? 0) > 1 && (
                            <span className="text-xs text-neutral-500 font-normal">
                              {" "}
                              외 {(r.participants?.length ?? 1) - 1}명
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatYmdKo(r.date)} · {r.time_slot} · {r.location}
                          {r.rider === "신랑+신부" && (
                            <span className="text-delivery font-bold"> · 💑 신랑+신부</span>
                          )}
                          {r.rider === "신부" && (
                            <span className="text-delivery font-bold"> · 👰 신부</span>
                          )}
                        </p>
                        <p className="text-[11px] text-neutral-400">
                          👥 {r.participants?.length ?? 0}명 · 📦 {groupName(r.group_id)}
                        </p>
                        {r.message && (
                          <p className="text-xs text-neutral-400 pt-1">
                            “{r.message}”
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] px-2 py-1 bg-sage-50 text-sage-600 border border-sage-200 whitespace-nowrap">
                        {r.status}
                      </span>
                    </div>

                    {/* 참여자 명단 (참여 시스템) */}
                    {(r.participants?.length ?? 0) > 0 && (
                      <ul className="border-t border-wedding-gold/10 pt-2 space-y-1">
                        {r.participants.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center gap-2 text-xs text-neutral-600"
                          >
                            <span>
                              {p.is_owner ? "👑" : "👤"} {p.name}
                            </span>
                            <span className="text-neutral-400">{p.phone}</span>
                            {p.review_rating != null && (
                              <span className="ml-auto text-amber-500">
                                {"⭐".repeat(p.review_rating)}
                                {p.review_text && (
                                  <span className="text-neutral-400">
                                    {" "}
                                    “{p.review_text}”
                                  </span>
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* 배송 추적 단계 (재미 트래킹, 하객 화면 실시간 반영) */}
                    {r.status !== "취소" && (
                      <div className="border-t border-wedding-gold/10 pt-2">
                        <p className="text-[10px] text-neutral-400 mb-1">
                          배송 현황 (하객에게 실시간 표시)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {TRACKING_STAGES.map((s) => (
                            <button
                              key={s}
                              onClick={() => changeStage(r.id, s)}
                              className={`px-2.5 py-1 text-[11px] border rounded-sm ${
                                r.tracking_stage === s
                                  ? "bg-delivery text-white border-delivery"
                                  : "bg-white text-neutral-500 border-neutral-200"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 주문 합치기 (활성 주문만) */}
                    {r.status !== "취소" && r.status !== "완료" && (
                      <div className="flex justify-end gap-2 flex-wrap">
                        {mergeSource === null ? (
                          <button
                            onClick={() => setMergeSource(r.id)}
                            className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-500"
                          >
                            이 주문을 다른 주문과 합치기 🔗
                          </button>
                        ) : mergeSource === r.id ? (
                          <button
                            onClick={() => setMergeSource(null)}
                            className="px-3 py-1.5 text-xs border border-neutral-300 text-neutral-400"
                          >
                            합치기 취소
                          </button>
                        ) : (
                          <button
                            onClick={() => doMerge(r.id)}
                            className="px-3 py-1.5 text-xs bg-delivery text-white font-bold"
                          >
                            여기로 합치기 ⤵
                          </button>
                        )}
                      </div>
                    )}

                    {(nextAction || cancelable) && (
                      <div className="flex justify-end gap-2">
                        {cancelable && (
                          <button
                            onClick={() => changeStatus(r.id, "취소")}
                            className="px-3 py-1.5 text-xs border border-red-200 text-red-400"
                          >
                            취소 (SMS)
                          </button>
                        )}
                        {nextAction && (
                          <button
                            onClick={() => changeStatus(r.id, nextAction)}
                            className="px-3 py-1.5 text-xs bg-sage-600 text-white tracking-wide"
                          >
                            {nextAction}으로 변경
                            {nextAction === "확정" ? " (SMS)" : ""}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ===== 캘린더 ===== */}
        {view === "calendar" && (
          <div className="space-y-6">
            {/* 이번 주 일정 + .ics */}
            {(() => {
              const [ws, we] = thisWeekRange();
              const week = allRows
                .filter((r) => r.status !== "취소" && r.date >= ws && r.date <= we)
                .sort((a, b) => a.date.localeCompare(b.date));
              return (
                <div className="bg-white border border-wedding-gold/15 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-sage-700">이번 주 일정</p>
                    <button
                      onClick={downloadIcs}
                      className="text-xs px-3 py-1.5 border border-sage-300 text-sage-600"
                    >
                      .ics 내보내기
                    </button>
                  </div>
                  {week.length === 0 ? (
                    <p className="text-xs text-neutral-400">이번 주 일정이 없습니다.</p>
                  ) : (
                    <ul className="space-y-1">
                      {week.map((r) => (
                        <li key={r.id} className="text-xs text-neutral-600">
                          {formatYmdKo(r.date)} · {r.time_slot} · {ownerName(r)} 👥
                          {r.participants?.length ?? 0}명 ({r.status})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-center gap-3 text-[11px] text-neutral-500 flex-wrap">
              <Legend color="bg-sage-500" label="주문 있음 (숫자=팀 수)" />
              <Legend color="bg-neutral-700" label="마감됨 🚫" />
            </div>
            <p className="text-[11px] text-neutral-400 text-center">
              날짜를 눌러 여러 개 선택한 뒤 한 번에 마감/해제 — 주문이 있는 날도 마감할 수
              있어요 (기존 주문 유지, 신규 신청만 차단)
            </p>

            {selected.size > 0 && (
              <div className="sticky top-2 z-10 flex justify-center gap-2 bg-white/95 border border-wedding-gold/20 rounded-full px-3 py-2 shadow-sm">
                <span className="text-xs text-neutral-500 self-center">
                  {selected.size}개 선택
                </span>
                <button
                  onClick={() => applyBlock(true)}
                  className="px-3 py-1.5 text-xs bg-neutral-700 text-white rounded-full"
                >
                  마감 🚫
                </button>
                <button
                  onClick={() => applyBlock(false)}
                  className="px-3 py-1.5 text-xs bg-sage-600 text-white rounded-full"
                >
                  해제 ✅
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="px-3 py-1.5 text-xs border border-neutral-200 text-neutral-500 rounded-full"
                >
                  취소
                </button>
              </div>
            )}
            {CAL_MONTHS.map((month) => {
              const offset = new Date(CAL_YEAR, month, 1).getDay();
              const days = new Date(CAL_YEAR, month + 1, 0).getDate();
              const cells: (string | null)[] = Array(offset).fill(null);
              for (let d = 1; d <= days; d++)
                cells.push(toYmd(new Date(CAL_YEAR, month, d)));
              return (
                <div key={month} className="bg-white border border-wedding-gold/15 p-3">
                  <p className="font-serif text-sm text-sage-700 text-center mb-2">
                    {CAL_YEAR}. {String(month + 1).padStart(2, "0")}
                  </p>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEK.map((w) => (
                      <div key={w} className="text-[10px] text-neutral-400 py-1">
                        {w}
                      </div>
                    ))}
                    {cells.map((ymd, i) =>
                      ymd === null ? (
                        <div key={`b${i}`} />
                      ) : (
                        (() => {
                          const list = byDate[ymd] ?? [];
                          const isBlocked = blocked.has(ymd);
                          const isSelected = selected.has(ymd);
                          const color = isBlocked
                            ? "bg-neutral-700 text-white"
                            : list.length > 0
                            ? "bg-sage-500 text-white"
                            : "bg-transparent text-neutral-300 hover:bg-neutral-100";
                          const title = [
                            ...list.map(
                              (r) =>
                                `${ownerName(r)} 외 ${Math.max(0, (r.participants?.length ?? 1) - 1)}명 · ${r.time_slot} · ${r.status}`
                            ),
                            isBlocked ? "마감됨 🚫" : null,
                          ]
                            .filter(Boolean)
                            .join(" / ");
                          return (
                            <button
                              key={ymd}
                              type="button"
                              onClick={() => toggleSelect(ymd)}
                              title={title || "선택 후 마감"}
                              className={`relative aspect-square rounded-md text-[11px] flex items-center justify-center ${color} ${
                                isSelected
                                  ? "ring-2 ring-delivery ring-offset-1 font-bold"
                                  : ""
                              }`}
                            >
                              {Number(ymd.slice(-2))}
                              {list.length > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-delivery text-white text-[8px] font-bold flex items-center justify-center">
                                  {list.length}
                                </span>
                              )}
                            </button>
                          );
                        })()
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== 배송경로 ===== */}
        {view === "route" && (
          <div className="space-y-4">
            <p className="text-[11px] text-neutral-400 text-center">
              배송할 주문(대기중·확정)을 날짜별로 묶고, 식장 기준 가까운 순서로 정렬했어요.
              번호대로 돌면 효율적이에요. (주소는 카카오로 자동 위치 변환)
            </p>

            {!loading && routeDays.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                배송할 주문이 없습니다.
              </p>
            )}

            {routeDays.length > 0 && (
              <>
                <div className="flex flex-wrap justify-center gap-2">
                  {routeDays.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => setRouteDate(d.date)}
                      className={`px-3 py-1.5 text-xs border ${
                        routeDate === d.date
                          ? "bg-sage-600 text-white border-sage-600"
                          : "bg-white text-neutral-500 border-wedding-gold/20"
                      }`}
                    >
                      {formatYmdKo(d.date)} · {d.count}건
                    </button>
                  ))}
                </div>

                {(() => {
                  const day = routeDays.find((d) => d.date === routeDate);
                  if (!day || !routeOrigin) return null;
                  return (
                    <>
                      <RouteMap stops={day.stops} origin={routeOrigin} />
                      <ol className="space-y-2">
                        {day.stops.map((s) => {
                          const noGeo = s.lat == null || s.lng == null;
                          return (
                            <li
                              key={s.id}
                              className="bg-white border border-wedding-gold/15 p-3 flex gap-3 text-sm"
                            >
                              <span
                                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  noGeo
                                    ? "bg-neutral-200 text-neutral-500"
                                    : "bg-delivery text-white"
                                }`}
                              >
                                {noGeo ? "?" : s.order}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sage-700">
                                  {s.name}
                                  {s.count > 1 && (
                                    <span className="text-[11px] text-neutral-400 font-normal">
                                      {" "}
                                      외 {s.count - 1}명
                                    </span>
                                  )}
                                  <span className="text-[11px] text-neutral-400 font-normal">
                                    {" · "}
                                    {s.time_slot} · {s.tracking_stage}
                                  </span>
                                </p>
                                <p className="text-xs text-neutral-500 break-words">
                                  📍 {s.location}
                                  {noGeo && (
                                    <span className="text-red-400"> (위치 못 찾음)</span>
                                  )}
                                </p>
                                <div className="flex gap-3 mt-1 text-[11px]">
                                  {s.phone && (
                                    <a
                                      href={`tel:${s.phone}`}
                                      className="text-delivery underline"
                                    >
                                      {s.phone}
                                    </a>
                                  )}
                                  <a
                                    href={`https://map.kakao.com/?q=${encodeURIComponent(
                                      s.location
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sage-600 underline"
                                  >
                                    카카오맵 열기
                                  </a>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ===== 그룹 ===== */}
        {view === "groups" && (
          <>
            <div className="bg-white border border-wedding-gold/15 p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createGroup()}
                  enterKeyHint="done"
                  placeholder="새 그룹명 (예: 대학 친구들)"
                  className="flex-1 p-3 border border-wedding-gold/25 bg-white text-base rounded-none focus:outline-none focus:border-sage-600"
                />
                <button
                  onClick={createGroup}
                  className="px-4 bg-sage-700 text-white text-xs tracking-wider"
                >
                  생성
                </button>
              </div>
              {/* 제안 일정 (선택) — 하객은 링크에서 승낙만 하면 됨 */}
              <p className="text-[11px] text-neutral-400">
                📅 일정 제안 (선택) — 하객은 이름·연락처만 남기고 승낙하면 돼요
              </p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="date"
                  value={offerDate}
                  min={DELIVERY_START}
                  max={DELIVERY_END}
                  onChange={(e) => {
                    const d = e.target.value;
                    setOfferDate(d);
                    if (d && offerTime && !slotsForDate(d).includes(offerTime as never))
                      setOfferTime("");
                  }}
                  className="p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                />
                <select
                  value={offerTime}
                  onChange={(e) => setOfferTime(e.target.value)}
                  disabled={!offerDate}
                  className="p-2 text-base border border-wedding-gold/20 bg-white text-neutral-600 disabled:opacity-50"
                >
                  <option value="">시간대</option>
                  {(offerDate ? slotsForDate(offerDate) : []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  value={offerLocation}
                  onChange={(e) => setOfferLocation(e.target.value)}
                  placeholder="장소 (선택)"
                  className="flex-1 min-w-[120px] p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                />
              </div>
            </div>

            {totalMembers != null && (
              <p className="text-xs text-neutral-500 text-right">
                👥 총 등록인원{" "}
                <span className="font-bold text-sage-700">{totalMembers}명</span>
                {(() => {
                  const grouped = groups.reduce(
                    (sum, g) => sum + (g.member_count ?? 0),
                    0
                  );
                  const rest = totalMembers - grouped;
                  return rest > 0 ? (
                    <span className="text-neutral-400"> (그룹 외 {rest}명 포함)</span>
                  ) : null;
                })()}
              </p>
            )}

            {groups.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-8">
                아직 그룹이 없습니다.
              </p>
            )}

            <div className="space-y-3">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="bg-white border border-wedding-gold/15 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sage-700 text-sm">
                        {g.name}{" "}
                        <span className="text-xs text-neutral-400 font-normal">
                          👥 {g.member_count ?? 0}명
                        </span>
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        /delivery/group/{g.slug}
                      </p>
                      {g.offer_date && g.offer_time && (
                        <p className="text-[11px] text-delivery font-bold">
                          📅 제안: {formatYmdKo(g.offer_date)} {g.offer_time}
                          {g.offer_location ? ` · ${g.offer_location}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 whitespace-nowrap">
                      <button
                        onClick={() =>
                          setEditOffer(
                            editOffer?.gid === g.id
                              ? null
                              : {
                                  gid: g.id,
                                  date: g.offer_date ?? "",
                                  time: g.offer_time ?? "",
                                  location: g.offer_location ?? "",
                                }
                          )
                        }
                        className="px-3 py-1.5 text-xs border border-wedding-gold/30 text-neutral-500"
                        title="일정 제안 설정"
                      >
                        📅
                      </button>
                      <button
                        onClick={() => renameGroup(g.id, g.name)}
                        className="px-3 py-1.5 text-xs border border-wedding-gold/30 text-neutral-500"
                        title="그룹명 수정"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => toggleMembers(g.id)}
                        className="px-3 py-1.5 text-xs border border-wedding-gold/30 text-neutral-500"
                      >
                        명단 {openGroup === g.id ? "▲" : "▼"}
                      </button>
                      <button
                        onClick={() => copyLink(g.slug)}
                        className="px-3 py-1.5 text-xs border border-sage-300 text-sage-600"
                      >
                        링크 복사
                      </button>
                    </div>
                  </div>

                  {/* 제안 일정 편집 */}
                  {editOffer?.gid === g.id && (
                    <div className="border-t border-wedding-gold/10 pt-3 space-y-2">
                      <p className="text-[11px] text-neutral-400">
                        📅 일정 제안 — 저장하면 그룹 페이지 상단에 승낙 카드가 떠요.
                        제안을 바꾸면 다음 승낙부터 새 주문으로 모여요.
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <input
                          type="date"
                          value={editOffer.date}
                          min={DELIVERY_START}
                          max={DELIVERY_END}
                          onChange={(e) => {
                            const d = e.target.value;
                            setEditOffer((prev) =>
                              prev && {
                                ...prev,
                                date: d,
                                time:
                                  d && prev.time && !slotsForDate(d).includes(prev.time as never)
                                    ? ""
                                    : prev.time,
                              }
                            );
                          }}
                          className="p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                        />
                        <select
                          value={editOffer.time}
                          onChange={(e) =>
                            setEditOffer((prev) => prev && { ...prev, time: e.target.value })
                          }
                          disabled={!editOffer.date}
                          className="p-2 text-base border border-wedding-gold/20 bg-white text-neutral-600 disabled:opacity-50"
                        >
                          <option value="">시간대</option>
                          {(editOffer.date ? slotsForDate(editOffer.date) : []).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <input
                          value={editOffer.location}
                          onChange={(e) =>
                            setEditOffer((prev) => prev && { ...prev, location: e.target.value })
                          }
                          placeholder="장소 (선택)"
                          className="flex-1 min-w-[120px] p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        {(g.offer_date || g.offer_time) && (
                          <button
                            onClick={() => saveOffer(true)}
                            className="px-3 py-1.5 text-xs border border-red-200 text-red-400"
                          >
                            제안 해제
                          </button>
                        )}
                        <button
                          onClick={() => setEditOffer(null)}
                          className="px-3 py-1.5 text-xs border border-neutral-200 text-neutral-500"
                        >
                          닫기
                        </button>
                        <button
                          onClick={() => saveOffer(false)}
                          className="px-3 py-1.5 text-xs bg-sage-600 text-white"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  )}

                  {openGroup === g.id && (
                    <div className="border-t border-wedding-gold/10 pt-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={newMember}
                          onChange={(e) => setNewMember(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addMember(g.id)}
                          enterKeyHint="done"
                          placeholder="멤버 이름 추가"
                          className="flex-1 p-2 text-sm border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
                        />
                        <button
                          onClick={() => addMember(g.id)}
                          className="px-3 bg-sage-600 text-white text-xs"
                        >
                          추가
                        </button>
                      </div>
                      <ul className="space-y-1">
                        {(members[g.id] ?? []).map((mem) => (
                          <li
                            key={mem.id}
                            className="flex items-center justify-between text-sm text-neutral-600 px-1"
                          >
                            <span>{mem.name}</span>
                            <button
                              onClick={() => removeMember(g.id, mem.id)}
                              className="text-xs text-red-400"
                            >
                              삭제
                            </button>
                          </li>
                        ))}
                        {(members[g.id] ?? []).length === 0 && (
                          <li className="text-xs text-neutral-400 px-1">
                            명단 없음 (등록 시 그룹 페이지에 미신청 표시)
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 대기자 ===== */}
        {view === "waiting" && (
          <>
            {!loading && waiting.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                대기자가 없습니다.
              </p>
            )}
            {waiting.length > 0 && (
              <button
                onClick={() => notifyWaiting()}
                className="w-full py-2.5 text-xs tracking-wider bg-delivery text-white rounded-sm"
              >
                📣 대기자 전체에게 빈자리 안내 SMS
              </button>
            )}
            <div className="space-y-2">
              {waiting.map((w, i) => (
                <div
                  key={w.id}
                  className="bg-white border border-wedding-gold/15 p-3 flex items-center gap-3 text-sm"
                >
                  <span className="text-xs text-neutral-400 w-6 text-center">
                    {i + 1}
                  </span>
                  <span className="font-medium text-sage-700">{w.name}</span>
                  <span className="text-xs text-neutral-400 ml-auto">
                    {w.phone}
                  </span>
                  <button
                    onClick={() => notifyWaiting(w.id)}
                    className="text-xs text-delivery"
                  >
                    알림
                  </button>
                  <button
                    onClick={() => deleteWaiting(w.id)}
                    className="text-xs text-red-400"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 방명록(마음 배송) ===== */}
        {view === "messages" && (
          <>
            {!loading && messages.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                받은 메시지가 없습니다.
              </p>
            )}
            <div className="space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="bg-white border border-wedding-gold/15 p-3 flex gap-3 text-sm"
                >
                  <span className="text-xl shrink-0">{m.stamp ?? "💌"}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sage-700">
                      {m.name}{" "}
                      <span className="text-[11px] text-neutral-400 font-normal">
                        {groupName(m.group_id)}
                        {m.region ? ` · 📍 ${m.region}` : ""}
                        {m.phone ? ` · ${m.phone}` : ""}
                      </span>
                    </p>
                    {m.message && (
                      <p className="text-xs text-neutral-500 break-words">{m.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 하객 스냅 ===== */}
        {view === "snap" && (
          <>
            <div className="flex justify-center">
              <a
                href="/table-qr"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-xs border border-sage-300 text-sage-600 bg-white"
              >
                🖨️ 테이블 QR 카드 인쇄
              </a>
            </div>
            <p className="text-[11px] text-neutral-400 text-center">
              하객이 올린 사진입니다. 부적절한 사진은 숨기거나 삭제하세요. 원본은
              NAS(Cloud Sync)에 자동 보관돼요.
            </p>
            {!loading && snaps.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">
                아직 올라온 사진이 없습니다.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {snaps.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-wedding-gold/15 overflow-hidden"
                >
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.name ?? "하객 스냅"}
                      className={`w-full aspect-square object-cover ${
                        p.approved ? "" : "opacity-40"
                      }`}
                    />
                  </a>
                  <div className="p-2 space-y-1">
                    <p className="text-[11px] text-neutral-500 truncate">
                      {p.name ?? "익명"} ·{" "}
                      {new Date(p.created_at).toLocaleDateString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => toggleSnap(p.id, !p.approved)}
                        className={`flex-1 py-1 text-[11px] border ${
                          p.approved
                            ? "border-neutral-300 text-neutral-500"
                            : "border-sage-400 text-sage-600 bg-sage-50"
                        }`}
                      >
                        {p.approved ? "숨기기" : "공개하기"}
                      </button>
                      <button
                        onClick={() => deleteSnap(p.id)}
                        className="px-2.5 py-1 text-[11px] border border-red-200 text-red-400"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 콘텐츠 (청첩장 사진/영상) ===== */}
        {view === "content" && (
          <div className="space-y-5">
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
          </div>
        )}
      </div>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-3 h-3 rounded-sm ${color}`} /> {label}
    </span>
  );
}
