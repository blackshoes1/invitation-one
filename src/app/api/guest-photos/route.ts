import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { verifyToken, UPLOAD_TOKEN_PURPOSE } from "@/lib/signedToken";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { sniffImage, ALLOWED_IMAGE_MIMES, EXT_BY_MIME } from "@/lib/imageSniff";

const BUCKET = "guest-photos";
const MAX_SIZE = 6 * 1024 * 1024; // 6MB (클라에서 압축 후 업로드)

/** 토큰(=청첩장 열람 세션)당 10분 30장, IP당 10분 300장 (예식장 공용 Wi-Fi 고려) */
const PER_TOKEN = { limit: 30, windowSec: 600 };
const PER_IP = { limit: 300, windowSec: 600 };

/**
 * 하객 사진 업로드 (공개 경로, P0-3 강화판). 청첩장 '하객 스냅'에서 호출.
 * - 권한: 서버가 청첩장 페이지 렌더 시 발급한 단기 HMAC 업로드 토큰(2h).
 *   NEXT_PUBLIC_INVITATION_KEY 는 공개값이므로 더 이상 업로드 권한으로 쓰지 않는다.
 * - 남용 방지: DB 기반 rate limit(rl_hit) — 토큰 nonce 별 + IP 별.
 * - 파일 검증: MIME allowlist + magic bytes 확인, 크기 6MB, 파일명은 crypto.randomUUID.
 * - service role 로 Storage 업로드 + guest_photos insert (실패 시 파일 롤백).
 */
export async function POST(req: Request) {
  if (process.env.GUEST_PHOTO_STORAGE === "nas")
    return NextResponse.json({ error: "청첩장을 새로고침한 뒤 다시 업로드해주세요.", code: "direct_upload_required" }, { status: 409 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 503 });

  const form = await req.formData();
  const file = form.get("file");
  const token = form.get("token");
  const name = String(form.get("name") ?? "").trim().slice(0, 40) || null;
  const message = String(form.get("message") ?? "").trim().slice(0, 200) || null;

  // 1) 업로드 토큰 검증 (fail-closed: 서명 키 없으면 503)
  const v = verifyToken(token, UPLOAD_TOKEN_PURPOSE);
  if (!v.ok) {
    if (v.reason === "no_key")
      return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 503 });
    return NextResponse.json(
      {
        error:
          v.reason === "expired"
            ? "업로드 권한이 만료됐어요. 청첩장을 새로고침 해주세요 🙏"
            : "청첩장에서만 업로드할 수 있어요.",
        code: v.reason === "expired" ? "token_expired" : "token_invalid",
      },
      { status: 401 }
    );
  }

  // 2) Rate limit (DB 기반 — 인스턴스 재시작/다중 인스턴스에도 유지)
  const ip = clientIp(req);
  const [okTok, okIp] = await Promise.all([
    rateLimitAllow(`upload:tok:${v.payload.n}`, PER_TOKEN.limit, PER_TOKEN.windowSec),
    rateLimitAllow(`upload:ip:${ip}`, PER_IP.limit, PER_IP.windowSec),
  ]);
  if (!okTok || !okIp)
    return NextResponse.json(
      { error: "사진을 너무 많이 올렸어요. 잠시 후 다시 시도해주세요 🙏", code: "rate_limited" },
      { status: 429 }
    );

  // 3) 파일 검증
  if (!(file instanceof File))
    return NextResponse.json({ error: "사진이 없습니다." }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json(
      { error: "사진이 너무 커요. 잠시 후 다시 시도해주세요." },
      { status: 400 }
    );
  if (!ALLOWED_IMAGE_MIMES.has(file.type.toLowerCase()))
    return NextResponse.json(
      { error: "JPG·PNG·WebP·HEIC 사진만 올릴 수 있어요." },
      { status: 400 }
    );
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(buf);
  if (!sniffed)
    return NextResponse.json(
      { error: "올바른 사진 파일이 아니에요. 다른 사진으로 시도해주세요." },
      { status: 400 }
    );

  // 4) 저장 — 파일명은 클라이언트 값과 무관하게 서버가 생성 (확장자도 실제 시그니처 기준)
  const path = `snap/${Date.now()}-${crypto.randomUUID()}.${EXT_BY_MIME[sniffed]}`;
  const up = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: sniffed, upsert: false });
  if (up.error)
    return NextResponse.json({ error: up.error.message }, { status: 500 });

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const { data, error } = await supabaseAdmin
    .from("guest_photos")
    .insert({ url: pub.publicUrl, path, name, message })
    .select("id, url, name, message, created_at")
    .single();
  if (error) {
    // 롤백: 방금 올린 파일 제거
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ photo: data });
}
