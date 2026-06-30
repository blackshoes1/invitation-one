import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = guard(req);
  if (bad) return bad;
  const { id } = await params;

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .select("*")
    .eq("group_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = guard(req);
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
  const bad = guard(req);
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
