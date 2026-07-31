/* ==========================================================================
   청첩장 데이터 한 곳 관리
   - 이름/날짜/장소/계좌 등 모든 콘텐츠를 여기서만 수정하면 됩니다.
   - 요일/디데이는 날짜로부터 자동 계산하므로 직접 적지 않습니다(오타 방지).
   ========================================================================== */

export interface Person {
  name: string;
  father?: string;
  mother?: string;
  /** 장남, 차녀 등 */
  relation: string;
  phone?: string;
}

export interface Account {
  role: string; // 신랑, 신부, 아버지 ...
  name: string;
  bank: string;
  number: string;
  /** 송금 딥링크 (정책상 가능할 때만 설정. 없으면 번호 복사+안내로 폴백) */
  kakaoPayUrl?: string;
  tossUrl?: string;
}

/** 예식 일시 (로컬 기준) */
export const WEDDING_DATE = new Date(2026, 9, 18, 11, 0); // 2026-10-18 11:00 (월은 0-base)

export const groom: Person = {
  name: "성근영",
  mother: "김도윤",
  relation: "장남",
};

export const bride: Person = {
  name: "김아영",
  father: "이동희",
  relation: "차녀",
};

export const venue = {
  name: "용산가족공원",
  address: "서울 용산구 서빙고로 185 (용산가족공원 야외예식장)",
  tel: "02-792-5661",
  /** 주차 안내 (잠금 화면·오시는 길에 노출) — 실제 안내문으로 수정하세요 */
  parking: "공원 주차장 이용 가능 · 만차 시 국립중앙박물관 주차장을 이용해주세요",
  // 용산가족공원 야외예식장 POI (카카오 장소검색 좌표, 용산동6가 93-6)
  lat: 37.521135,
  lng: 126.983812,
  /** 길찾기 앱 딥링크 (앱 미설치 시 web 폴백 사용) */
  nav: {
    naverApp: `nmap://route/public?dlat=37.521135&dlng=126.983812&dname=${encodeURIComponent(
      "용산가족공원 야외예식장"
    )}`,
    naverWeb: "https://map.naver.com/p/search/용산가족공원 야외예식장",
    kakaoApp: "kakaomap://route?ep=37.521135,126.983812&by=PUBLICTRANSIT",
    kakaoWeb: "https://map.kakao.com/?q=용산가족공원 야외예식장",
    tmapApp: `tmap://route?goalx=126.983812&goaly=37.521135&goalname=${encodeURIComponent(
      "용산가족공원 야외예식장"
    )}`,
    tmapWeb: "https://tmap.life/ko",
  },
};

/** 마음 전하기 계좌 — 신랑·신부 통합 (카카오뱅크) */
export const accounts: Account[] = [
  {
    role: "신랑 · 신부",
    name: `${groom.name} · ${bride.name}`,
    bank: "카카오뱅크",
    number: "3333-37-8660608",
  },
];

/* ----------------------- 갤러리 ----------------------- */
// 청첩장 갤러리 슬라이드 최대 장수 (admin 업로드·표시 공통 상한)
export const GALLERY_MAX = 10;

// 앨범(세이브 더 데이트 콜라주) 사진 장수 (2단 콜라주 기준 4장)
export const ALBUM_MAX = 4;

// /public/pic/ 에 아래 파일을 넣으면 자동으로 슬라이드에 표시됩니다.
export const galleryImages: { src: string; alt: string }[] = [
  { src: "/pic/gallery1.jpg", alt: "커플 사진 1" },
  { src: "/pic/gallery2.jpg", alt: "커플 사진 2" },
  { src: "/pic/gallery3.jpg", alt: "커플 사진 3" },
];

/* ----------------------- 러브스토리 타임라인 (LC-4) ----------------------- */
export interface LoveMoment {
  /** 시점 라벨 — "2019 봄", "2021.05" 등 자유롭게 */
  when: string;
  title: string;
  /** 한두 줄 설명 (선택) */
  desc?: string;
  /** 이모지 아이콘 (선택, 기본 💕) */
  emoji?: string;
}

/**
 * 두 사람의 이야기 — 값이 비어 있으면 섹션이 표시되지 않습니다.
 * 아래 예시를 두 분의 실제 이야기로 바꾸면 청첩장에 타임라인이 나타납니다.
 */
export const loveStory: LoveMoment[] = [
  // { when: "2019 봄", title: "우리, 처음 만난 날", desc: "친구 소개로 어색하게 첫 인사를 나눴어요.", emoji: "🌸" },
  // { when: "2021 여름", title: "첫 여행", desc: "둘만의 바다, 여기서 확신이 생겼죠.", emoji: "🌊" },
  // { when: "2025 겨울", title: "프러포즈", desc: "함께 걷던 길 위에서 평생을 약속했어요.", emoji: "💍" },
  // { when: "2026.10.18", title: "결혼", desc: "이제 매일을 함께합니다.", emoji: "💒" },
];

/* ----------------------- 신혼 근황 (LC-5) ----------------------- */
export interface NewsPost {
  /** 시점 라벨 — "2026.11", "신혼여행 D+7" 등 자유롭게 */
  when: string;
  title: string;
  /** 본문 (여러 줄 가능) */
  body: string;
  /** /public/news/ 안의 사진 경로 (선택) */
  image?: string;
}

/**
 * 예식 후 신혼 근황 소식 — 값이 비어 있으면 섹션이 표시되지 않습니다.
 * 예식이 끝난 뒤 아래에 소식을 추가하면 청첩장(같은 URL)에 근황 피드가 나타납니다.
 */
export const newlywedNews: NewsPost[] = [
  // { when: "2026.11", title: "신혼여행 다녀왔어요", body: "제주에서 푹 쉬다 왔습니다. 사진 몇 장 나눠요!", image: "/news/trip1.jpg" },
  // { when: "2026.12", title: "새 보금자리", body: "작지만 볕 잘 드는 집에 자리 잡았어요 🌿" },
];

/* ----------------------- 포토 미션 (GS-9) ----------------------- */
/**
 * 하객 스냅 업로드를 유도하는 미션 카드 목록.
 * 하객이 미션을 고르고 사진을 올리면, 해당 미션이 사진에 함께 기록됩니다.
 */
export const PHOTO_MISSIONS: string[] = [
  "신랑·신부와 셀카 🤳",
  "우리 테이블 단체샷 👨‍👩‍👧‍👦",
  "가장 맛있어 보이는 음식 🍽️",
  "오늘의 하객 패션 👗",
  "웃긴 표정 챌린지 😜",
  "예쁜 꽃·장식 발견 💐",
];

/* ------------------ 청첩장 받기(배달 신청) ------------------ */
export type TimeSlot = "오전" | "오후" | "저녁";
export const TIME_SLOTS: TimeSlot[] = ["오전", "오후", "저녁"];

/** 요일별 배송 가능 시간대 — 평일은 저녁만, 주말은 전체 */
export function slotsForDate(ymd: string): TimeSlot[] {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6 ? TIME_SLOTS : ["저녁"];
}

// 배달 신청 가능 기간 (YYYY-MM-DD)
export const DELIVERY_START = "2026-07-06";
export const DELIVERY_END = "2026-10-16";

// 총 자리 수 = 준비한 종이 청첩장 수량 (남은 자리 = 이 값 - 직접배달 신청 인원 합계)
export const DELIVERY_CAPACITY = 103;

// 완료 화면 "특별한 영상 메시지" (유튜브 비공개 링크). 비어 있으면 '준비 중' 표시.
export const VIDEO_URL = process.env.NEXT_PUBLIC_VIDEO_URL ?? "";

/* ----------------------- 배경음악 BGM (FD-5) ----------------------- */
/**
 * 청첩장 배경음악.
 * `/public/audio/` 에 음원 파일(mp3/m4a 등)을 넣고 아래 경로를 지정하면
 * 좌상단에 재생/일시정지 토글 버튼이 나타납니다. 값이 비어 있으면 숨겨집니다.
 * 예) BGM_URL = "/audio/bgm.mp3"
 * ⚠︎ 저작권: 배포 전 사용 허락된(라이선스/직접 제작) 음원인지 반드시 확인하세요.
 */
export const BGM_URL = process.env.NEXT_PUBLIC_BGM_URL ?? "";
/** 재생 곡 안내 (버튼 툴팁·접근성 라벨용, 선택) */
export const BGM_TITLE = process.env.NEXT_PUBLIC_BGM_TITLE ?? "배경음악";

// 마음 배송 전용 감사 영상 (직접 배달 영상과 별개). 비어 있으면 표시 안 함.
export const HEART_VIDEO_URL = process.env.NEXT_PUBLIC_HEART_VIDEO_URL ?? "";

// 예상 참석 인원 상한
export const PARTY_MAX = 10;

// 청첩장 공개 접근 키 (QR/링크의 ?key=). 비어 있으면 청첩장·업로드 API 모두 잠금(fail-closed).
export const INVITATION_KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "";

// 마음 배송 축하 스탬프
export const STAMPS = ["🎉", "💐", "🥂", "❤️", "🙏"] as const;

/** 휴대폰 입력 자동 하이픈 포맷 (010-0000-0000) */
export function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 한국 휴대폰 형식 검증 */
export function isValidPhone(v: string): boolean {
  return /^01\d-\d{3,4}-\d{4}$/.test(v.trim());
}

/** 'YYYY-MM-DD' 로 포맷 (로컬 기준, TZ 안전) */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' → "10월 16일 (금)" */
export function formatYmdKo(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}월 ${d}일 (${WEEKDAYS_KO[date.getDay()]})`;
}

/* ------------------------------- 헬퍼 ------------------------------- */

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026년 10월 18일 일요일" 형태 (요일 자동 계산) */
export function formatFullDate(date: Date = WEDDING_DATE): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS_KO[date.getDay()];
  return `${y}년 ${m}월 ${d}일 ${w}요일`;
}

/** "오전 11시" / "오후 2시 30분" */
export function formatTime(date: Date = WEDDING_DATE): string {
  const h = date.getHours();
  const min = date.getMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}시${min ? ` ${min}분` : ""}`;
}

/**
 * 예식 일정 .ics (캘린더에 추가용).
 * TZ 안전을 위해 KST 절대 시각을 UTC 로 하드코딩 (11:00 KST = 02:00 UTC, +2시간).
 * 서버/클라 TZ 와 무관하게 동일한 순간을 가리킴.
 */
export function weddingIcs(): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const start = new Date(Date.UTC(2026, 9, 18, 2, 0, 0)); // 2026-10-18 11:00 KST
  const end = new Date(Date.UTC(2026, 9, 18, 4, 0, 0)); // 13:00 KST
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cheong//wedding//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:wedding-${groom.name}-${bride.name}-20261018@cheong`,
    `DTSTAMP:${fmt(start)}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${groom.name} ♥ ${bride.name} 결혼식`,
    `LOCATION:${venue.name}\\, ${venue.address}`,
    `DESCRIPTION:${formatFullDate()} ${formatTime()} · ${venue.name}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * 예식 연락처 .vcf (연락처에 저장용, vCard 3.0).
 * 신랑·신부 이름을 한 장의 카드로 저장하고, 전화는 등록된 번호만 넣습니다.
 * (개인 번호가 없으면 예식장 대표번호를 폴백으로 사용)
 */
export function weddingVcard(): string {
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const title = `${groom.name} ♥ ${bride.name} 결혼`;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${esc(title)};;;`,
    `FN:${esc(title)}`,
    `ORG:${esc(`${groom.name} ♥ ${bride.name} 결혼식`)}`,
  ];
  // 개인 번호가 있으면 각각, 없으면 예식장 대표번호
  const phones: { label: string; num: string }[] = [];
  if (groom.phone) phones.push({ label: `신랑 ${groom.name}`, num: groom.phone });
  if (bride.phone) phones.push({ label: `신부 ${bride.name}`, num: bride.phone });
  if (phones.length === 0) phones.push({ label: venue.name, num: venue.tel });
  for (const p of phones) {
    lines.push(`TEL;TYPE=CELL:${p.num}`);
  }
  lines.push(
    `ADR;TYPE=WORK:;;${esc(venue.address)};;;;`,
    `NOTE:${esc(`${formatFullDate()} ${formatTime()} · ${venue.name}`)}`,
    "END:VCARD"
  );
  return lines.join("\r\n");
}

/** "26.10.18" */
export function formatShortDate(date: Date = WEDDING_DATE): string {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

/** 오늘 기준 남은 일수 (자정 기준). 당일이면 0, 지나면 음수 */
export function daysUntil(date: Date = WEDDING_DATE, from: Date = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
