import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

const ALLOWED_KEYS = [
  "hero_image",
  "gallery",
  "album",
  "video_url",
  "heart_video_url",
  "confirm_sms", // 확정 시 감사 문자 템플릿 (LC-2) — 공개 RPC 에는 없음(관리자 전용)
];

function guard(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );
  return null;
}

/** 콘텐츠 설정 조회 */
export async function GET(req: Request) {
  const bad = guard(req);
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
  const bad = guard(req);
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
