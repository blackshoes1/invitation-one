import { adminGuard } from "@/lib/adminAuth";
import { passJson } from "@/lib/checkinServer";

export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  return passJson({ error: "self_checkin_disabled" }, 410);
}
