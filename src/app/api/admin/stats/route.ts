import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/** 한눈 대시보드 요약 (AD-2) */
export async function GET(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "설정이 필요합니다." }, { status: 503 });

  const sb = supabaseAdmin;
  const countOf = async (
    table: string,
    build: (q: ReturnType<typeof sb.from>) => unknown
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (build(sb.from(table) as any) as any) as Promise<{ count: number | null }>;
    const { count } = await q;
    return count ?? 0;
  };

  const [
    partTotal,
    partDelivery,
    partHeart,
    delWaiting,
    delConfirmed,
    delDone,
    delCanceled,
    waiting,
    snaps,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("participants", (q: any) => q.select("id", { count: "exact", head: true })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("participants", (q: any) => q.select("id", { count: "exact", head: true }).eq("type", "직접배달")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("participants", (q: any) => q.select("id", { count: "exact", head: true }).eq("type", "마음배송")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("deliveries", (q: any) => q.select("id", { count: "exact", head: true }).eq("status", "대기중")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("deliveries", (q: any) => q.select("id", { count: "exact", head: true }).eq("status", "확정")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("deliveries", (q: any) => q.select("id", { count: "exact", head: true }).eq("status", "완료")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("deliveries", (q: any) => q.select("id", { count: "exact", head: true }).eq("status", "취소")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("waiting_list", (q: any) => q.select("id", { count: "exact", head: true })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countOf("guest_photos", (q: any) => q.select("id", { count: "exact", head: true })),
  ]);

  return NextResponse.json({
    participants: { total: partTotal, delivery: partDelivery, heart: partHeart },
    deliveries: {
      waiting: delWaiting,
      confirmed: delConfirmed,
      done: delDone,
      canceled: delCanceled,
      active: delWaiting + delConfirmed,
    },
    waiting,
    snaps,
  });
}
