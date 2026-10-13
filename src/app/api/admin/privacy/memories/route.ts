import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { data, error } = await supabaseAdmin!.from("guest_memories")
    .select("id,kind,name,message,review,reply,photo_url,is_private,created_at")
    .order("created_at", { ascending: false }).limit(300);
  return Response.json(error ? { error: "보존한 축하 글을 읽지 못했습니다." } : { memories: data }, {
    status: error ? 503 : 200, headers: { "Cache-Control": "no-store, private" },
  });
}
