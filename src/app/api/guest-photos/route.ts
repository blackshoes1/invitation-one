import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

const BUCKET = "guest-photos";
const MAX_SIZE = 6 * 1024 * 1024; // 6MB (클라에서 압축 후 업로드)
const INVITATION_KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "";

/**
 * 하객 사진 업로드 (공개). 청첩장 '하객 스냅'에서 호출.
 * - 접근 키 게이트: 청첩장 접근 키를 함께 받아 검증. 키 미설정·불일치 모두 403 (fail-closed).
 * - service role 로 Storage 업로드 + guest_photos insert. 기본 즉시 공개(approved=true).
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 503 });

  const form = await req.formData();
  const file = form.get("file");
  const key = String(form.get("key") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 40) || null;
  const message = String(form.get("message") ?? "").trim().slice(0, 200) || null;

  // 접근 키 게이트 — 청첩장 페이지와 동일하게 fail-closed (키 미설정 시에도 차단)
  if (!INVITATION_KEY || key !== INVITATION_KEY)
    return NextResponse.json({ error: "청첩장에서만 업로드할 수 있어요." }, { status: 403 });

  if (!(file instanceof File))
    return NextResponse.json({ error: "사진이 없습니다." }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "이미지 파일만 올릴 수 있어요." }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json(
      { error: "사진이 너무 커요. 잠시 후 다시 시도해주세요." },
      { status: 400 }
    );

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `snap/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const up = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (up.error)
    return NextResponse.json({ error: up.error.message }, { status: 500 });

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const { data, error } = await supabaseAdmin
    .from("guest_photos")
    .insert({ url: pub.publicUrl, path, name, message })
    .select("id, url, name, message, created_at")
    .single();
  if (error) {
    // 롤백: 방금 올린 파일 제거
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ photo: data });
}
