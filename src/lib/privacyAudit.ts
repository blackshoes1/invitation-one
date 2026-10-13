import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clientIp } from "@/lib/rateLimit";
import { signingKeyFromEnv } from "@/lib/signedToken";

/** 조회 문자열·본문·번호·이름·토큰은 감사 기록에 저장하지 않습니다. */
export function privacyHash(value: string): string | null {
  const key = signingKeyFromEnv();
  return key ? crypto.createHmac("sha256", key).update(`privacy:${value}`).digest("hex") : null;
}

export function adminActor(req: Request): string | null {
  const token = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)admin_session=([0-9a-f]{64})(?:;|$)/)?.[1];
  return token ? privacyHash(`session:${token}`) : null;
}

export async function recordAccess(
  req: Request,
  action: string,
  outcome: "allowed" | "denied" | "success" | "failure",
  actor = adminActor(req),
): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const ipHash = privacyHash(`ip:${clientIp(req)}`);
  if (!ipHash) return false;
  const path = new URL(req.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").slice(0, 180);
  try {
    const { error } = await supabaseAdmin.from("privacy_access_log").insert({
      actor_hash: actor, ip_hash: ipHash, action, outcome,
      resource: path, method: req.method,
    });
    return !error;
  } catch { return false; }
}
