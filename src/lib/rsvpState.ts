import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** 명단 행에 붙이는 연결된 RSVP 의 현재 상태 (서버 전용) */
export interface RsvpState {
  id: string;
  attending: boolean;
  side: string | null;
  companion_count: number;
  companion_names: string[];
}

/**
 * rsvp id → 현재 상태. 현장운영 탭에서 바뀐 값도 명단 배지에 그대로 보이도록 RSVP 에서 직접 읽는다.
 * 조회가 실패하면 빈 맵으로 위장하지 않고 error 를 돌려준다 (배지가 사라지면 "미등록"으로 읽힌다).
 */
export async function rsvpStatesById(
  ids: string[]
): Promise<{ map: Map<string, RsvpState> } | { error: string }> {
  const map = new Map<string, RsvpState>();
  if (ids.length === 0) return { map };
  const { data, error } = await supabaseAdmin!
    .from("rsvp")
    .select("id, attending, side, companion_count, companion_names")
    .in("id", ids);
  if (error) return { error: error.message };
  for (const r of data ?? []) map.set(r.id, r as RsvpState);
  return { map };
}
