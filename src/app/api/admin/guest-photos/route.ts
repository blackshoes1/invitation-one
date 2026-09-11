import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { nasPhotoRequest, PATH_PATTERN } from "@/lib/nasPhoto";

const BUCKET = "guest-photos";

/** 하객 스냅 전체 조회 (미승인 포함) */
export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { data, error } = await supabaseAdmin!
    .from("guest_photos")
    .select("id, url, path, name, message, approved, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photos: data });
}

/** 숨김/공개 토글 — body: { id, approved } */
export async function PATCH(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id, approved } = (await req.json()) as { id?: string; approved?: boolean };
  if (!id || typeof approved !== "boolean")
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const { error } = await supabaseAdmin!
    .from("guest_photos")
    .update({ approved })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ done: true });
}

/** 삭제 — ?id= (행 + Storage 파일) */
export async function DELETE(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });

  const { data: row } = await supabaseAdmin!
    .from("guest_photos")
    .select("path")
    .eq("id", id)
    .single();
  if (row?.path?.startsWith("nas:")) {
    const path = row.path.slice(4);
    if (!PATH_PATTERN.test(path)) return NextResponse.json({ error: "잘못된 NAS 사진 경로입니다." }, { status: 500 });
    try {
      const removed = await nasPhotoRequest('DELETE', path);
      if (!removed.ok) throw new Error('NAS delete failed');
    } catch { return NextResponse.json({ error: "NAS 사진을 삭제하지 못했습니다. 연결을 확인하고 다시 시도해주세요." }, { status: 502 }); }
  }
  const { error } = await supabaseAdmin!.from("guest_photos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (row?.path && !row.path.startsWith("nas:")) await supabaseAdmin!.storage.from(BUCKET).remove([row.path]);
  return NextResponse.json({ done: true });
}
