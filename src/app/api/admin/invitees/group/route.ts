import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { LEGACY_UUID_RE } from "@/lib/manageToken";

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && LEGACY_UUID_RE.test(value);

export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "그룹화할 인원을 선택해주세요." }, { status: 400 });
  }
  const { member_ids, group_id, new_group_name, request_id } = body as Record<string, unknown>;
  const creating = new_group_name !== undefined;
  if (
    !Array.isArray(member_ids) || member_ids.length < 1 || member_ids.length > 500 ||
    !member_ids.every(isUuid) ||
    new Set(member_ids.map((id) => id.toLowerCase())).size !== member_ids.length ||
    (creating
      ? group_id !== undefined || typeof new_group_name !== "string" ||
        !new_group_name.trim() || new_group_name.trim().length > 100 || !isUuid(request_id)
      : !isUuid(group_id) || request_id !== undefined)
  ) {
    return NextResponse.json(
      { error: "1~500명을 선택하고 기존 그룹 또는 새 그룹 이름(100자 이내)을 지정해주세요." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin!.rpc("admin_group_invitees", {
    p_member_ids: member_ids,
    p_group_id: creating ? request_id : group_id,
    p_new_group_name: creating ? (new_group_name as string).trim() : null,
  });
  if (error) {
    const known: Record<string, [number, string]> = {
      group_not_found: [404, "그룹이 삭제되었어요. 목록을 새로고침해주세요."],
      invitees_changed: [409, "선택한 인원의 소속이 변경되었거나 삭제되었어요. 목록을 새로고침하고 다시 선택해주세요."],
      group_conflict: [409, "그룹 정보가 변경되었어요. 목록을 새로고침해주세요."],
      invalid_grouping_request: [400, "선택한 인원과 그룹을 확인해주세요."],
    };
    const [status, message] = known[error.message] ?? [500, "그룹화에 실패했습니다. 잠시 후 다시 시도해주세요."];
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(data);
}
