import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 (service_role 키 사용 → RLS 우회).
 * 절대 클라이언트 컴포넌트에서 import 하지 마세요. API 라우트에서만 사용합니다.
 *
 * .env.local:
 *   SUPABASE_SERVICE_ROLE_KEY=...   (Project Settings → API → service_role)
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin: SupabaseClient | null =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isAdminConfigured = Boolean(url && serviceKey);
