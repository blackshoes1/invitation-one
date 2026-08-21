import type { NextConfig } from "next";

// Supabase Storage 공개 버킷(하객 스냅 등) 이미지를 next/image 로 최적화하기 위한 허용 목록
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "https://*.supabase.co";

/**
 * 보안 헤더 (P2-2).
 * CSP 는 우선 Report-Only 로만 적용해 실제 차단 없이 위반 보고(/api/csp-report)를 모은다.
 * 충분히 관찰한 뒤 enforce 로 전환할 때는 아래 CSP 를 "Content-Security-Policy" 헤더로 바꾸면 된다.
 * 허용 출처: Supabase(REST/Storage/Realtime), 카카오(지도 SDK·공유 SDK·daumcdn 타일),
 *            네이버/티맵(링크만 — 리소스 로드 없음), YouTube 임베드, Pretendard(jsdelivr), next/font(self)
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  // Next.js 인라인 런타임·카카오 SDK. (nonce 도입 전까지 unsafe-inline 허용)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://t1.kakaocdn.net https://*.daumcdn.net https://*.kakao.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  `img-src 'self' data: blob: ${supabaseOrigin} https://*.daumcdn.net https://*.kakaocdn.net https://*.kakao.com https://i.ytimg.com https://*.ytimg.com`,
  `media-src 'self' blob: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, "wss:")} https://dapi.kakao.com https://*.daumcdn.net https://*.kakao.com https://*.kakaocdn.net`,
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtu.be https://*.kakao.com https://map.kakao.com https://map.naver.com https://tmap.life",
  "form-action 'self' https://*.kakao.com",
  "worker-src 'self' blob:",
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // 카메라(체크인/사진 input capture 는 권한정책 대상 아님)·위치는 self 만, 그 외 민감 기능 차단
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=(), interest-cohort=()",
  },
  { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
