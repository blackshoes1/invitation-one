import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { inviteUrl, personalInviteUrl } from "@/lib/invite";
import { siteOrigin } from "@/lib/siteUrl";
import { isValidPhone } from "@/lib/wedding";
import { signingKeyFromEnv } from "@/lib/signedToken";
import { inviteTokenHash, recoverInviteToken, reusableInviteToken } from "@/lib/reusableInvite";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store, private" },
});

/** Copy reuses the current invite. Rotation requires an explicit, single-member request.
 * Legacy random invites remain valid but cannot be reconstructed from their hash.
 * Bulk copy skips them (and missing phones), reporting every skipped member.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    member_id?: string; all?: boolean; rotate?: boolean;
  } | null;
  if (!body || (body.all === true) === (typeof body.member_id === "string" && !!body.member_id)
    || (body.all !== undefined && typeof body.all !== "boolean")
    || (body.rotate !== undefined && typeof body.rotate !== "boolean")
    || (body.rotate && body.all))
    return json({ error: "대상 한 명 또는 전체 복사를 선택해주세요." }, 400);
  const key = signingKeyFromEnv();
  if (!key) return json({ error: "초대 링크 서명 설정을 확인해주세요." }, 503);
  const { data: group, error: groupError } = await supabaseAdmin!
    .from("groups").select("slug").eq("id", id).maybeSingle();
  if (groupError) return json({ error: "그룹 조회에 실패했습니다." }, 503);
  if (!group) return json({ error: "group not found" }, 404);
  let query = supabaseAdmin!.from("group_members")
    .select("id, name, phone, invited_at, invite_token_hash").eq("group_id", id);
  if (!body.all) query = query.eq("id", body.member_id!);
  const { data: members, error } = await query.order("created_at", { ascending: true });
  if (error) return json({ error: "명단 조회에 실패했습니다." }, 503);
  if (!members?.length) return json({ error: "not found" }, 404);

  const origin = siteOrigin(req);
  const links: { id: string; name: string; url: string; personalUrl: string; invited_at: string }[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];
  for (const member of members) {
    if (!member.phone || !isValidPhone(member.phone)) {
      skipped.push({ id: member.id, name: member.name, reason: "연락처를 먼저 저장해주세요." });
      continue;
    }
    let token = recoverInviteToken(member, key);
    let invitedAt = member.invited_at as string | null;
    if (!body.rotate && member.invite_token_hash && !token) {
      skipped.push({ id: member.id, name: member.name,
        reason: "기존 링크는 유효하지만 다시 복사할 수 없는 이전 방식입니다. 새 주소가 필요하면 ‘링크 재발급’을 선택해주세요." });
      continue;
    }
    if (body.rotate || !token) {
      // Monotonic per member, including two rotations within the same millisecond.
      invitedAt = new Date(Math.max(Date.now(), (Date.parse(member.invited_at ?? "") || 0) + 1)).toISOString();
      token = reusableInviteToken(member.id, invitedAt, key)!;
      let update = supabaseAdmin!.from("group_members")
        .update({ invite_token_hash: inviteTokenHash(token), invited_at: invitedAt })
        .eq("id", member.id).eq("group_id", id).eq("phone", member.phone);
      // A competing request must not invalidate a link just issued by another tab.
      update = member.invite_token_hash
        ? update.eq("invite_token_hash", member.invite_token_hash)
        : update.is("invite_token_hash", null);
      const { data: saved, error: saveError } = await update.select("id").maybeSingle();
      if (saveError || !saved) {
        skipped.push({ id: member.id, name: member.name,
          reason: "저장하지 못했거나 다른 화면에서 변경됐어요. 명단을 다시 열고 복사해주세요." });
        continue;
      }
    }
    links.push({ id: member.id, name: member.name, invited_at: invitedAt!,
      url: inviteUrl(origin, group.slug, token), personalUrl: personalInviteUrl(origin, token) });
  }
  return json({ links, skipped }, links.length ? 200 : 409);
}
