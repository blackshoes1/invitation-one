import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/** 참여자 연락처 CSV 내보내기 (AD-3) — 감사 문자·재발송용 */
export async function GET(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "설정이 필요합니다." }, { status: 503 });

  const { data, error } = await supabaseAdmin
    .from("participants")
    .select(
      "name, phone, type, region, is_owner, created_at, delivery:deliveries!delivery_id(date, time_slot, location, status)"
    )
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    // CSV 수식 인젝션 방어 — 하객이 입력한 이름/배송지가 =, +, -, @, 탭으로
    // 시작하면 Excel 이 수식으로 실행할 수 있으므로 ' 를 앞에 붙여 무력화
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "이름",
    "연락처",
    "유형",
    "대표",
    "지역",
    "배송일",
    "시간대",
    "배송지",
    "주문상태",
    "신청일시",
  ];
  const rows = (data ?? []).map((p) => {
    // delivery 는 다대일 임베드 → 객체(런타임). TS 추론은 배열이라 unknown 경유
    const d = (p as unknown as { delivery: { date?: string; time_slot?: string; location?: string; status?: string } | null }).delivery;
    return [
      p.name,
      p.phone ?? "",
      p.type,
      p.is_owner ? "대표" : "",
      p.region ?? "",
      d?.date ?? "",
      d?.time_slot ?? "",
      d?.location ?? "",
      d?.status ?? "",
      new Date(p.created_at).toLocaleString("ko-KR"),
    ]
      .map(esc)
      .join(",");
  });

  // Excel 한글 깨짐 방지 BOM
  const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="participants.csv"`,
    },
  });
}
