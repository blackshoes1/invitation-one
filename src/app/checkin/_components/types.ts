export interface Guest {
  displayName: string;
  side: string | null;
  expectedPartySize: number;
  children?: number;
}
export interface Seat {
  tableName: string;
  zone: string | null;
  floor: string | null;
  locationNote: string | null;
}
export interface DoneInfo {
  name: string;
  actual: number;
  seat: Seat | null;
  already: boolean;
  checkedInAt?: string | null;
}
export interface Candidate {
  rsvpId: string;
  displayName: string;
  side: string | null;
  expectedPartySize: number;
  alreadyCheckedIn: boolean;
  maskedPhone: string | null;
}

export type Mode = "loading" | "personal" | "invalid" | "guide" | "search" | "done";
