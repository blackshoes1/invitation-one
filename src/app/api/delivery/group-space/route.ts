import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashManageToken } from "@/lib/manageToken";
import { INVITE_TOKEN_RE } from "@/lib/invite";
import { clientIp, rateLimitAllow } from "@/lib/rateLimit";
import { parseAttendance, projectGroupMembers, type AttendanceRow, type GroupSpace } from "@/lib/groupSpace";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store, private" },
});

/** Token goes in the body, not a new query-string/log surface. IDs are server-derived. */
export async function POST(req: Request) {
  const sb = supabaseAdmin;
  if (!sb) return json({ error: "server_not_configured" }, 503);
  if (!(await rateLimitAllow(`group-space:${clientIp(req)}`, 60, 600)))
    return json({ error: "rate_limited" }, 429);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.token !== "string" || !INVITE_TOKEN_RE.test(b.token))
    return json({ error: "invite_invalid" }, 401);
  if (b.action !== "load" && b.action !== "save") return json({ error: "bad_request" }, 400);
  const { data: me, error: authError } = await sb.from("group_members")
    .select("id, name, group_id").eq("invite_token_hash", hashManageToken(b.token)).maybeSingle();
  if (authError) return json({ error: "load_failed" }, 503);
  if (!me) return json({ error: "invite_invalid" }, 401);
  if (!me.group_id) return json({ error: "no_group" }, 403);

  if (b.action === "save") {
    const attendance = parseAttendance(b.attendance);
    if (attendance === undefined || typeof b.shareWithGroup !== "boolean")
      return json({ error: "bad_request" }, 400);
    const { error } = await sb.from("group_attendance").upsert({
      member_id: me.id, group_id: me.group_id, attendance,
      share_with_group: attendance !== null && b.shareWithGroup,
      updated_at: new Date().toISOString(),
    }, { onConflict: "member_id" });
    if (error) return json({ error: "save_failed" }, 503);
    return json({ ok: true });
  }

  const [group, roster, responses, schedules] = await Promise.all([
    sb.from("groups").select("name").eq("id", me.group_id).single(),
    sb.from("group_members").select("id, name").eq("group_id", me.group_id).order("created_at"),
    sb.from("group_attendance").select("member_id, attendance, share_with_group").eq("group_id", me.group_id),
    sb.from("deliveries").select("date, time_slot").eq("group_id", me.group_id)
      .neq("status", "취소").eq("hidden", false).order("date"),
  ]);
  if (group.error || roster.error || responses.error || schedules.error)
    return json({ error: "load_failed" }, 503);
  const rows = responses.data as AttendanceRow[];
  const mine = rows.find((r) => r.member_id === me.id);
  const members = projectGroupMembers(roster.data, rows, me.id);
  const space: GroupSpace = {
    groupName: group.data.name, rosterCount: roster.data.length,
    sharedAttendingCount: members.filter((m) => m.attendance === "yes").length
      + (mine?.share_with_group && mine.attendance === "yes" ? 1 : 0),
    me: { name: me.name, attendance: mine?.attendance ?? null, shareWithGroup: mine?.share_with_group ?? false },
    members, schedules: schedules.data,
  };
  return json({ space });
}
