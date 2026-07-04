import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { parseOffer } from "@/lib/groupOffer";

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

function makeSlug() {
  return Math.random().toString(36).slice(2, 8);
}

export async function GET(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("groups")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ groups: data });
}

export async function POST(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const body = (await req.json()) as {
    name?: string;
    offer_date?: string | null;
    offer_time?: string | null;
    offer_location?: string | null;
  };
  const { name } = body;
  if (!name?.trim())
    return NextResponse.json({ error: "그룹명을 입력해주세요." }, { status: 400 });

  const offer = parseOffer(body);
  if ("error" in offer)
    return NextResponse.json({ error: offer.error }, { status: 400 });

  // slug 충돌 시 최대 3회 재시도
  for (let i = 0; i < 3; i++) {
    const slug = makeSlug();
    const { data, error } = await supabaseAdmin!
      .from("groups")
      .insert({ name: name.trim(), slug, ...offer.fields })
      .select()
      .single();
    if (!error) return NextResponse.json({ group: data });
    if (error.code !== "23505")
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: "slug 생성 실패, 다시 시도해주세요." }, { status: 500 });
}
