import { NextResponse } from "next/server";
import { csvEscape } from "@/lib/csv";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** 참여자 연락처 CSV 내보내기 (AD-3) — 감사 문자·재발송용 */
export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("participants")
    .select(
      "name, phone, type, region, is_owner, created_at, delivery:deliveries!delivery_id(date, time_slot, location, status)"
    )
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const esc = csvEscape;

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
