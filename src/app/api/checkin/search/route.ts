import { passJson } from "@/lib/checkinServer";

export async function POST() {
  return passJson({ error: "self_checkin_disabled", result: "self_checkin_disabled" }, 410);
}
