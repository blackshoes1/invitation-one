import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/**
 * 관리자 — QR 재발급 (§6 고정 의미)
 * 항상 로테이션: 기존 토큰 즉시 무효화 + 신규 UUID + 발급시각 갱신.
 * 활성 체크인 기록은 변경하지 않는다. 기존 URL 은 invalid_pass.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "설정이 필요합니다." }, { status: 503 });

  const { id } = await params;

  const { data: rsvp } = await supabaseAdmin
    .from("rsvp")
    .select("id, attending")
    .eq("id", id)
    .maybeSingle();
  if (!rsvp) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!rsvp.attending)
    return NextResponse.json(
      { error: "불참 RSVP 에는 QR 을 발급할 수 없어요." },
      { status: 400 }
    );

  const token = crypto.randomUUID();
  const { data, error } = await supabaseAdmin
    .from("rsvp")
    .update({
      checkin_token: token,
      checkin_token_active: true,
      qr_issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, name, checkin_token, qr_issued_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 재발급 경고용 — 이미 체크인했는지 병기 (§6: 기록은 유지된다)
  const { data: existing } = await supabaseAdmin
    .from("checkins")
    .select("id")
    .eq("rsvp_id", id)
    .eq("status", "active")
    .maybeSingle();

  return NextResponse.json({
    rsvp: { id: data.id, name: data.name, qrIssuedAt: data.qr_issued_at },
    passToken: data.checkin_token,
    passUrl: `/checkin?t=${data.checkin_token}`,
    alreadyCheckedIn: Boolean(existing),
  });
}
