/** 현장 운영 탭 공용 타입·상수 (docs/CHECKIN_SEATING_SPEC.md §6, §5.2, §13) */

export const SIDE_LABEL: Record<string, string> = { groom: "신랑측", bride: "신부측", common: "공통" };
export const SOURCE_LABEL: Record<string, string> = {
  personal_qr: "개인QR",
  common_qr: "공용QR",
  admin: "관리자",
  walk_in: "현장",
  legacy: "레거시",
};

export interface CheckinRow {
  id: string;
  rsvp_id: string | null;
  name: string | null;
  side: string | null;
  expected_party_size: number | null;
  actual_party_size: number | null;
  meal_count: number | null;
  source: string | null;
  status: string;
  admin_memo: string | null;
  created_at: string;
}
export interface RsvpRow {
  id: string;
  name: string;
  phone: string | null;
  side: string | null;
  attending: boolean;
  expected_party_size: number;
  eating: string | null;
  kids_meal: boolean;
  table_id: string | null;
  checkin_token_active: boolean;
  checkin: CheckinRow | null;
}
export interface TableRow {
  id: string;
  name: string;
  zone: string | null;
  side: string | null;
  capacity: number;
  floor: string | null;
  location_note: string | null;
  sort_order: number;
  active: boolean;
}
export interface Stats {
  expectedTeams: number;
  expectedPeople: number;
  arrivedTeams: number;
  arrivedPeople: number;
  notArrivedTeams: number;
  partyDiff: number;
  walkInPeople: number;
  legacyPeople: number;
  groomArrived: number;
  brideArrived: number;
  mealPlanned: number;
  mealUndecided: number;
  kidsMealTeams: number;
  mealActual: number;
}

export type Filter =
  | "all"
  | "arrived"
  | "pending"
  | "walkin"
  | "diff"
  | "noseat"
  | "groom"
  | "bride";

export const FILTERS: [Filter, string][] = [
  ["all", "전체"],
  ["pending", "미도착"],
  ["arrived", "도착"],
  ["walkin", "현장 등록"],
  ["diff", "인원 변경"],
  ["noseat", "좌석 미배정"],
  ["groom", "신랑측"],
  ["bride", "신부측"],
];

/** 공용 액션 실행기 — busy 잠금 + 결과 토스트 + 재로드 */
export type Act = (key: string, fn: () => Promise<Response>, okMsg: string) => Promise<void>;
export type Flash = (msg: string) => void;
