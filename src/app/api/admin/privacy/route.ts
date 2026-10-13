import { adminGuard, verifyAdminPassword } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminActor, recordAccess } from "@/lib/privacyAudit";
import { rateLimitAllow } from "@/lib/rateLimit";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store, private" },
});

export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const [state, logs] = await Promise.all([
    supabaseAdmin!.rpc("privacy_preview_v1"),
    supabaseAdmin!.from("privacy_access_log").select("id,created_at,actor_hash,action,outcome,resource,method,row_id")
      .order("created_at", { ascending: false }).limit(100),
  ]);
  if (state.error || logs.error) return json({ error: "개인정보 관리 현황을 읽지 못했습니다." }, 503);
  return json({ state: state.data, logs: logs.data });
}

export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  if (!await rateLimitAllow(`privacy-reauth:${adminActor(req)}`, 5, 600)) return json({ error: "재인증 시도가 많습니다. 10분 뒤 다시 시도해주세요." }, 429);
  const body = await req.json().catch(() => null);
  if (body?.confirm !== "개인정보 파기" || body?.acknowledgeExternalCopies !== true
      || typeof body?.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint))
    return json({ error: "파기 대상과 외부 사본 처리 안내를 확인해주세요." }, 400);
  if (!verifyAdminPassword(body.password)) {
    await recordAccess(req, "privacy_purge_reauthentication", "denied");
    return json({ error: "관리자 비밀번호가 맞지 않습니다." }, 403);
  }
  const { data, error } = await supabaseAdmin!.rpc("purge_operational_privacy_v1", { p_fingerprint: body.fingerprint });
  if (error) {
    const message = error.message === "retention_not_expired" ? "아직 보관 기한이 지나지 않았습니다."
      : error.message === "targets_changed" ? "파기 대상이 변경됐습니다. 현황을 다시 확인해주세요." : "파기를 완료하지 못했습니다.";
    return json({ error: message }, ["retention_not_expired", "targets_changed"].includes(error.message) ? 409 : 500);
  }
  return json({ receipt: data, reauthenticationRequired: true });
}

export async function PATCH(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const body = await req.json().catch(() => null);
  const keys = ["local_copies", "provider_backups", "sms", "admin_messages"];
  if (!keys.includes(body?.key) || typeof body?.done !== "boolean") return json({ error: "잘못된 확인 항목입니다." }, 400);
  const { data, error } = await supabaseAdmin!.rpc("complete_privacy_external_check_v1", {
    p_key: body.key, p_done: body.done,
  });
  if (error) return json({ error: "DB 파기 이후에 외부 사본 처리 결과를 기록할 수 있습니다." }, 409);
  await recordAccess(req, `external_copy_${body.key}_${body.done ? "completed" : "reopened"}`, "success");
  return json({ externalChecks: data });
}
