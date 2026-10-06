import { after } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { json, firstRow } from "@/lib/deliveryApi";
import { drainNotifications } from "@/lib/notifyOutbox";
import { REGIONS, OVERSEAS, joinRegion } from "@/lib/regions";

/** Main-page guestbook: no delivery, contact, attendance or invitation identity claims. */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin) return json({ error: "server_not_configured" }, 503);
  // Share the existing heart endpoint's quota so switching forms cannot bypass it.
  if (!(await rateLimitAllow(`heart:create:${clientIp(req)}`, 20, 600)))
    return json({ error: "rate_limited" }, 429);
  const raw: unknown = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json({ error: "bad_request" }, 400);
  const { name, message, visibility = "anon", sido = "", sub = "" } = raw as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 40)
    return json({ error: "name_invalid" }, 400);
  if (typeof message !== "string" || !message.trim() || message.trim().length > 500)
    return json({ error: "message_invalid" }, 400);
  if (!["anon", "name", "private"].includes(visibility as string)) return json({ error: "visibility_invalid" }, 400);
  if (typeof sido !== "string" || typeof sub !== "string") return json({ error: "region_invalid" }, 400);
  let region: string | null = null;
  if (sido || sub) {
    const domestic = Object.prototype.hasOwnProperty.call(REGIONS, sido);
    if (!(domestic && REGIONS[sido].includes(sub)) &&
        !(sido === OVERSEAS && sub.trim().length >= 1 && sub.trim().length <= 30))
      return json({ error: "region_invalid" }, 400);
    region = joinRegion(sido, sub.trim());
  }
  const { data, error } = await supabaseAdmin.rpc("send_heart_v3", {
    p_group_id: null, p_invite_token: null, p_name: name.trim(), p_phone: null,
    // Legacy heart RPC requires nonempty text. This explicitly means "not provided",
    // never a guessed location, and is excluded from the public map by show_region.
    p_region: region ?? "지역 미입력", p_show_region: region !== null,
    p_stamp: "💌", p_message: message.trim(),
    p_display_mode: visibility === "name" ? "name" : "anon",
    p_is_private: visibility === "private", p_attendance: null, p_anon_alias: null,
  });
  if (error || !firstRow<{ participant_id: string }>(data)?.participant_id)
    return json({ error: "server_error" }, 500);
  after(() => drainNotifications(3).catch((error) => console.error("[guestbook] notification drain failed", error)));
  return json({ ok: true });
}
