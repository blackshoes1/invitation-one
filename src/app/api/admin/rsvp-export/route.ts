import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자 — 체크인 v2 CSV (§15)
 * GET ?type=full : RSVP·체크인 통합 CSV (토큰·패스 URL 미포함)
 * GET ?type=pass : QR 발송 목록 CSV (패스 URL 포함 — 관리자 전용 별도 내보내기)
 */

const SIDE_LABEL: Record<string, string> = {
  groom: "신랑측",
  bride: "신부측",
};
const EATING_LABEL: Record<string, string> = {
  yes: "식사",
  no: "식사 안 함",
  undecided: "미정",
};
const SOURCE_LABEL: Record<string, string> = {
  personal_qr: "개인QR",
  common_qr: "공용QR",
  admin: "관리자",
  walk_in: "현장등록",
  legacy: "레거시",
};

const esc = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // CSV 수식 인젝션 방어 — 하객 입력(이름/메모)이 =, +, -, @, 탭으로
  // 시작하면 Excel 이 수식으로 실행할 수 있으므로 ' 를 앞에 붙여 무력화
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function csvResponse(header: string[], rows: string[][], filename: string) {
  const csv =
    "﻿" +
    [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
    },
  });
}

export async function GET(req: Request) {
  const bad = adminGuard(req);
  if (bad) return bad;

  const type = new URL(req.url).searchParams.get("type") ?? "full";

  const { data: rsvps, error } = await supabaseAdmin!
    .from("rsvp")
    .select(
      "id, name, phone, side, attending, companion_count, kids_meal, eating, table_id, checkin_token, checkin_token_active, qr_issued_at, created_at"
    )
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (type === "pass") {
    // QR 발송 목록 — 참석 + 활성 토큰만
    const origin = new URL(req.url).origin;
    const rows = (rsvps ?? [])
      .filter((r) => r.attending && r.checkin_token)
      .map((r) => [
        r.name,
        r.phone ?? "",
        `${origin}/checkin?t=${r.checkin_token}`,
        r.qr_issued_at ? new Date(r.qr_issued_at).toLocaleString("ko-KR") : "",
        r.checkin_token_active ? "활성" : "비활성",
      ]);
    return csvResponse(
      ["이름", "연락처", "패스 URL", "QR 발급 시각", "토큰 활성 상태"],
      rows,
      "checkin-pass-list.csv"
    );
  }

  // 통합 CSV — 토큰·패스 URL 제외 (§15)
  const [{ data: checkins }, { data: tables }] = await Promise.all([
    supabaseAdmin!
      .from("checkins")
      .select("rsvp_id, actual_party_size, meal_count, expected_party_size, source, created_at")
      .eq("status", "active")
      .not("rsvp_id", "is", null),
    supabaseAdmin!.from("seating_tables").select("id, name, zone"),
  ]);
  const ckByRsvp = new Map((checkins ?? []).map((c) => [c.rsvp_id as string, c]));
  const tblById = new Map((tables ?? []).map((t) => [t.id, t]));

  const rows = (rsvps ?? []).map((r) => {
    const ck = ckByRsvp.get(r.id);
    const tbl = r.table_id ? tblById.get(r.table_id) : undefined;
    const expected = 1 + r.companion_count;
    return [
      r.id,
      r.name,
      r.phone ?? "",
      SIDE_LABEL[r.side ?? ""] ?? "",
      r.attending ? "참석" : "불참",
      String(expected),
      EATING_LABEL[r.eating ?? ""] ?? "",
      r.kids_meal ? "요청" : "",
      tbl?.name ?? "",
      tbl?.zone ?? "",
      ck ? "도착" : "",
      ck ? new Date(ck.created_at).toLocaleString("ko-KR") : "",
      ck ? String(ck.actual_party_size ?? "") : "",
      ck ? String(ck.meal_count ?? "") : "",
      ck ? String((ck.actual_party_size ?? 0) - (ck.expected_party_size ?? expected)) : "",
      ck ? SOURCE_LABEL[ck.source ?? ""] ?? "" : "",
    ];
  });

  return csvResponse(
    [
      "RSVP ID",
      "이름",
      "연락처",
      "신랑/신부측",
      "참석 여부",
      "예상 인원",
      "식사 여부",
      "유아식 요청",
      "테이블",
      "구역",
      "체크인 여부",
      "체크인 시각",
      "실제 도착 인원",
      "실제 식사 인원",
      "인원 차이",
      "체크인 경로",
    ],
    rows,
    "rsvp-checkins.csv"
  );
}
