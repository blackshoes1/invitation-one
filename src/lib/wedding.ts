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
  address: "서울 용산구 서빙고로 137",
  tel: "02-792-5661",
  lat: 37.52401,
  lng: 126.9805,
  /** 길찾기 앱 딥링크 (앱 미설치 시 web 폴백 사용) */
  nav: {
    naverApp: `nmap://route/public?dlat=37.52401&dlng=126.9805&dname=${encodeURIComponent(
      "용산가족공원"
    )}`,
    naverWeb: "https://map.naver.com/p/search/용산가족공원",
    kakaoApp: "kakaomap://route?ep=37.52401,126.9805&by=PUBLICTRANSIT",
    kakaoWeb: "https://map.kakao.com/?q=용산가족공원",
    tmapApp: `tmap://route?goalx=126.9805&goaly=37.52401&goalname=${encodeURIComponent(
      "용산가족공원"
    )}`,
    tmapWeb: "https://tmap.life/ko",
  },
};

export const groomAccounts: Account[] = [
  { role: "신랑", name: "성근영", bank: "신한은행", number: "110-123-456789" },
];

export const brideAccounts: Account[] = [
  { role: "신부", name: "김아영", bank: "우리은행", number: "1002-123-456789" },
];

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
