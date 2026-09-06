import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { orderKindOf } from "@/lib/orderKind";
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

  // 개인 링크로 신청한 사람은 그룹(group_id) 집계에 안 잡히므로, 명단에서 놓치지 않도록
  // participants.group_member_id 로 신청 여부를 함께 내려준다.
  // 종류 판정은 폼·API 와 같은 규칙을 쓴다 (src/lib/orderKind.ts).
  const ids = (data ?? []).map((m) => m.id);
  const hasGroupOrder = new Map<string, boolean>();
  if (ids.length > 0) {
    const { data: parts } = await supabaseAdmin!
      .from("participants")
      .select("group_member_id, group_id")
      .in("group_member_id", ids);
    for (const p of parts ?? []) {
      if (!p.group_member_id) continue;
      // 하나라도 그룹 주문이면 그룹 신청으로 표시
      hasGroupOrder.set(
        p.group_member_id,
        (hasGroupOrder.get(p.group_member_id) ?? false) ||
          orderKindOf(p.group_id) === "group"
      );
    }
  }
  const members = (data ?? []).map((m) => ({
    ...m,
    applied: hasGroupOrder.has(m.id),
    personal: hasGroupOrder.get(m.id) === false,
  }));
  return NextResponse.json({ members });
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
