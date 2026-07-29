import type { NextConfig } from "next";

// Supabase Storage 공개 버킷(하객 스냅 등) 이미지를 next/image 로 최적화하기 위한 허용 목록
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  // 같은 와이파이의 휴대폰 등에서 dev 서버 접속 허용 (LAN 대역)
  allowedDevOrigins: ["192.168.0.148", "192.168.0.0/24"],
  images: supabaseUrl
    ? {
        remotePatterns: [
          new URL(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/**`),
        ],
      }
    : undefined,
};

export default nextConfig;
