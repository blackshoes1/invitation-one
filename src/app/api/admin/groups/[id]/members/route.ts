import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatPhone, isValidPhone } from "@/lib/wedding";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .select("id, group_id, name, phone, invited_at, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;

  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim())
    return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .insert({ group_id: id, name: name.trim() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  await params; // id 는 사용하지 않지만 시그니처 유지

  const memberId = new URL(req.url).searchParams.get("member_id");
  if (!memberId)
    return NextResponse.json({ error: "member_id 가 필요합니다." }, { status: 400 });

  const { error } = await supabaseAdmin!
    .from("group_members")
    .delete()
    .eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** 명단 연락처 수정 (개인 초대 링크용). 빈 값이면 삭제 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;
  const { member_id, phone } = (await req.json().catch(() => ({}))) as {
    member_id?: string;
    phone?: string | null;
  };
  if (!member_id)
    return NextResponse.json({ error: "member_id 가 필요합니다." }, { status: 400 });
  const raw = String(phone ?? "").trim();
  const norm = raw ? formatPhone(raw) : null;
  if (norm && !isValidPhone(norm))
    return NextResponse.json({ error: "연락처 형식을 확인해주세요 (010-0000-0000)." }, { status: 400 });
  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .update({ phone: norm })
    .eq("id", member_id)
    .eq("group_id", id)
    .select("id, group_id, name, phone, invited_at, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ member: data });
}
