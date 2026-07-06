import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

const BUCKET = "invitation-media";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const KINDS = ["hero", "gallery", "album"];

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

/** 사진 업로드 (multipart form: file, kind=hero|gallery) → { url, path } */
export async function POST(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "gallery");

  if (!(file instanceof File))
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  if (!KINDS.includes(kind))
    return NextResponse.json({ error: "잘못된 업로드 종류입니다." }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "이미지 파일만 업로드할 수 있어요." }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json(
      { error: "파일이 너무 커요 (최대 10MB). 사진 앱에서 줄여서 올려주세요." },
      { status: 400 }
    );

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabaseAdmin!.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}

/** 업로드한 사진 삭제 — ?path=gallery/... */
export async function DELETE(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const path = new URL(req.url).searchParams.get("path");
  if (!path || !KINDS.some((k) => path.startsWith(`${k}/`)))
    return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 400 });

  const { error } = await supabaseAdmin!.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ done: true });
}
