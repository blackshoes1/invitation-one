import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveParticipantByToken } from "@/lib/manageToken";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";

/**
 * 참여자 관리 API (P0-2) — 관리 토큰(manage token)으로만 접근.
 *
 * participant UUID 는 공개 식별자라 권한으로 쓰지 않는다. 브라우저는 이제
 * get_participant/switch/leave/convert/respond/review RPC 를 직접 호출할 수
 * 없고(anon 회수), 이 라우트가 토큰을 검증한 뒤 service_role 로 호출한다.
 *
 *   GET  /api/delivery/manage?t=<token>            → 상세
 *   POST /api/delivery/manage { t, action, ...payload }
 *        action: switch{target_id} | leave | convert_to_heart{region,stamp,message}
 *              | respond{accept} | review{rating,text}
 */
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** 공통: 설정·속도제한·토큰 검증 → 참여자 id */
async function authorize(req: Request, token: unknown) {
  if (!supabaseAdmin) return { err: json({ error: "server_not_configured" }, 503) };
  // 토큰 무차별 대입 완화 (128bit 라 실질 불가하지만 비용을 올려둠)
  if (!(await rateLimitAllow(`manage:${clientIp(req)}`, 120, 600)))
    return { err: json({ error: "too_many_requests" }, 429) };
  const pid = await resolveParticipantByToken(token);
  if (!pid) return { err: json({ error: "invalid_token" }, 401) };
  return { pid };
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  const a = await authorize(req, t);
  if ("err" in a) return a.err;

  const { data, error } = await supabaseAdmin!.rpc("get_participant", { p_id: a.pid });
  if (error) return json({ error: error.message }, 500);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return json({ error: "not_found" }, 404);
  // 내부 식별자는 내려주지 않음 (클라이언트는 토큰만으로 동작)
  const { id: _id, ...detail } = row;
  void _id;
  return json({ participant: detail });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | (Record<string, unknown> & { t?: unknown; action?: unknown })
    | null;
  if (!body) return json({ error: "bad_request" }, 400);
  const a = await authorize(req, body.t);
  if ("err" in a) return a.err;
  const sb = supabaseAdmin!;

  switch (body.action) {
    case "switch": {
      const target = body.target_id;
      if (typeof target !== "string" || !UUID_RE.test(target))
        return json({ error: "bad_request" }, 400);
      const { data, error } = await sb.rpc("switch_participant", { p_id: a.pid, p_target: target });
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }
    case "leave": {
      const { data, error } = await sb.rpc("leave_delivery", { p_id: a.pid });
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }
    case "convert_to_heart": {
      const region = typeof body.region === "string" ? body.region.trim().slice(0, 60) : "";
      const stamp = typeof body.stamp === "string" ? body.stamp.slice(0, 8) : "";
      const message =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim().slice(0, 300)
          : null;
      if (!region || !stamp) return json({ error: "bad_request" }, 400);
      const { data, error } = await sb.rpc("convert_to_heart", {
        p_id: a.pid, p_region: region, p_stamp: stamp, p_message: message,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }
    case "respond": {
      if (typeof body.accept !== "boolean") return json({ error: "bad_request" }, 400);
      const { data, error } = await sb.rpc("respond_reschedule", {
        p_participant: a.pid, p_accept: body.accept,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }
    case "review": {
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        return json({ error: "bad_request" }, 400);
      const text =
        typeof body.text === "string" && body.text.trim() ? body.text.trim().slice(0, 300) : null;
      const { data, error } = await sb.rpc("submit_review_v2", {
        p_participant: a.pid, p_rating: rating, p_text: text,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ result: data });
    }
    default:
      return json({ error: "unknown_action" }, 400);
  }
}
