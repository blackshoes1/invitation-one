import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_KEYS = [
  "hero_image",
  "gallery",
  "album",
  "video_url",
  "heart_video_url",
  "confirm_sms", // 확정 시 감사 문자 템플릿 (LC-2) — 공개 RPC 에는 없음(관리자 전용)
  "review_sms", // 완료 시 리뷰요청 문자 템플릿 (DL-3) — 관리자 전용
  // 체크인 v2 운영 시간 (서버 전용 — get_site_settings 공개 화이트리스트에 없음)
  "checkin_enabled",
  "checkin_open_at",
  "checkin_close_at",
  // P2-1 하객 스냅 전체 공개 스위치 (false = 공개 갤러리 일시중지, 파일 보존)
  "guest_snap_public",
];

/** 콘텐츠 설정 조회 */
export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("site_settings")
    .select("key, value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) settings[row.key] = row.value;
  return NextResponse.json({ settings });
}

/** 콘텐츠 설정 저장 — body: { key, value } (value null 이면 삭제 = 폴백으로 복귀) */
export async function PUT(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { key, value } = (await req.json()) as { key?: string; value?: unknown };
  if (!key || !ALLOWED_KEYS.includes(key))
    return NextResponse.json({ error: "허용되지 않는 설정 키입니다." }, { status: 400 });

  if (value === null || value === undefined) {
    const { error } = await supabaseAdmin!
      .from("site_settings")
      .delete()
      .eq("key", key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ done: true });
  }

  const { error } = await supabaseAdmin!
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ done: true });
}
