import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트 (브라우저용).
 * .env.local 에 아래 두 값을 넣으면 활성화됩니다.
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 * 값이 없으면 null 을 반환하고, RSVP 폼은 "데모 모드"로 동작합니다.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(url && anonKey);

export interface RsvpPayload {
  name: string;
  side: "groom" | "bride";
  attending: boolean;
  companion_count: number;
  eating: "yes" | "no" | "undecided";
  memo: string;
}
