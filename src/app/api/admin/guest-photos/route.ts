import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  const { error } = await supabaseAdmin!.from("guest_photos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (row?.path) await supabaseAdmin!.storage.from(BUCKET).remove([row.path]);
  return NextResponse.json({ done: true });
}
