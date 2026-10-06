import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { orderKindOf } from "@/lib/orderKind";
import { formatPhone, isValidPhone } from "@/lib/wedding";

/**
 * 개별 초대 — **그룹에 속하지 않은** 사람들 (`group_members.group_id is null`).
 *
 * 초대 토큰의 목적은 받는 사람이 이름·연락처를 다시 입력하지 않게 하는 것인데,
 * 예전에는 토큰이 group_members 행에만 붙고 그 행이 그룹을 요구해서
 * **개별 지인 한 명에게 링크를 주려고 그 사람만을 위한 그룹을 만들어야 했다.**
 * `20260906000200_groupless_invites.sql` 로 제약을 풀고 이 라우트를 뒀다.
 *
 * 그룹 명단과 같은 테이블을 쓰지만 조회는 `is("group_id", null)` 로 갈린다
 * (그룹 명단은 `/api/admin/groups/[id]/members`).
 * 이 사람들의 주문은 항상 개인 주문이다 — 그룹 페이지를 거치지 않으므로.
 */
const COLS = "id, group_id, name, phone, invited_at, created_at";

export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .select(COLS)
    .is("group_id", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 신청 여부는 participants.group_member_id 로 본다 (그룹 집계에는 안 잡히므로)
  const ids = (data ?? []).map((m) => m.id);
  const hasGroupOrder = new Map<string, boolean>();
  if (ids.length > 0) {
    const { data: parts, error: partsError } = await supabaseAdmin!
      .from("participants")
      .select("group_member_id, group_id, type, delivery:deliveries!delivery_id(status)")
      .in("group_member_id", ids);
    if (partsError) return NextResponse.json({ error: partsError.message }, { status: 500 });
    for (const p of (parts ?? []) as unknown as {
      group_member_id: string | null; group_id: string | null;
      type: string; delivery: { status: string } | null;
    }[]) {
      // Cancellation history and heart messages do not reserve a paper invitation.
      if (!p.group_member_id || p.type !== "직접배달" || !p.delivery || p.delivery.status === "취소") continue;
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

export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { name, phone } = (await req.json().catch(() => ({}))) as {
    name?: string;
    phone?: string | null;
  };
  if (!name?.trim())
    return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });

  const raw = String(phone ?? "").trim();
  const norm = raw ? formatPhone(raw) : null;
  if (norm && !isValidPhone(norm))
    return NextResponse.json(
      { error: "연락처 형식을 확인해주세요 (010-0000-0000)." },
      { status: 400 }
    );

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .insert({ group_id: null, name: name.trim(), phone: norm })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}

/** 연락처 수정 (빈 값이면 삭제) */
export async function PATCH(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { member_id, phone } = (await req.json().catch(() => ({}))) as {
    member_id?: string;
    phone?: string | null;
  };
  if (!member_id)
    return NextResponse.json({ error: "member_id 가 필요합니다." }, { status: 400 });

  const raw = String(phone ?? "").trim();
  const norm = raw ? formatPhone(raw) : null;
  if (norm && !isValidPhone(norm))
    return NextResponse.json(
      { error: "연락처 형식을 확인해주세요 (010-0000-0000)." },
      { status: 400 }
    );

  // group_id is null 조건을 함께 걸어 그룹 명단을 이 라우트로 건드리지 못하게
  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .update({ phone: norm })
    .eq("id", member_id)
    .is("group_id", null)
    .select(COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ member: data });
}

export async function DELETE(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const memberId = new URL(req.url).searchParams.get("member_id");
  if (!memberId)
    return NextResponse.json({ error: "member_id 가 필요합니다." }, { status: 400 });

  // 주의: participants.group_member_id 는 ON DELETE SET NULL 이라, 지우면
  // 그 사람이 낸 주문의 신원 연결이 조용히 끊긴다 (주문 자체는 남는다)
  const { error } = await supabaseAdmin!
    .from("group_members")
    .delete()
    .eq("id", memberId)
    .is("group_id", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
