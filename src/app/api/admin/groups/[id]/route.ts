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

/** 그룹명 수정 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = guard(req);
  if (bad) return bad;
  const { id } = await params;

  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim())
    return NextResponse.json({ error: "그룹명을 입력해주세요." }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from("groups")
    .update({ name: name.trim() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}
