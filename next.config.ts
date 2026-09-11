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
const nasBase = process.env.NAS_PHOTO_BASE_URL;
const nasOrigin = nasBase ? new URL(nasBase).origin : "";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  // Next.js 인라인 런타임·카카오 SDK. (nonce 도입 전까지 unsafe-inline 허용)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://t1.kakaocdn.net https://*.daumcdn.net https://*.kakao.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  `img-src 'self' data: blob: ${supabaseOrigin} ${nasOrigin} https://*.daumcdn.net https://*.kakaocdn.net https://*.kakao.com https://i.ytimg.com https://*.ytimg.com`,
  `media-src 'self' blob: ${supabaseOrigin}`,
  `connect-src 'self' ${nasOrigin} ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, "wss:")} https://dapi.kakao.com https://*.daumcdn.net https://*.kakao.com https://*.kakaocdn.net`,
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtu.be https://*.kakao.com https://map.kakao.com https://map.naver.com https://tmap.life",
  "form-action 'self' https://*.kakao.com",
  "worker-src 'self' blob:",
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

/**
 * P2-2: enforce 전환 스위치 — 기본은 Report-Only(관찰만, 차단 없음).
 * /api/csp-report 위반 로그를 충분히 관찰한 뒤 Vercel 환경변수
 * CSP_ENFORCE=true 를 설정하면 재배포만으로 enforce 로 전환된다.
 * (문제가 생기면 변수 제거 + 재배포로 즉시 Report-Only 복귀 — 코드 수정 불필요)
 */
const CSP_HEADER =
  process.env.CSP_ENFORCE === "true"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

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
  { key: CSP_HEADER, value: CSP },
];

const nextConfig: NextConfig = {
  // 같은 와이파이의 휴대폰 등에서 dev 서버 접속 허용 (LAN 대역)
  allowedDevOrigins: ["192.168.0.148", "192.168.0.0/24"],
  images: {
    // 하객 사진·관리자 업로드 원본은 최대 10MB 라 반드시 최적화 경로를 태운다.
    // AVIF 우선(같은 화질에 WebP 대비 ~20~30% 작음), 미지원 브라우저는 WebP 폴백.
    formats: ["image/avif", "image/webp"],
    // Next 16 부터 quality 는 허용 목록에 있는 값만 쓸 수 있다 (기본 [75]).
    // 사진 위주 청첩장이라 갤러리/앨범은 70, 히어로는 80 을 쓴다.
    qualities: [70, 75, 80],
    // 사진은 관리자가 교체하기 전까지 바뀌지 않는다 — 최적화 결과를 오래 캐시해
    // Vercel 이미지 최적화 호출 수와 응답 지연을 함께 줄인다. (교체 시 URL 이 바뀜)
    minimumCacheTTL: 60 * 60 * 24 * 31, // 31일
    // 모바일 청첩장이라 데스크톱 대형 폭은 필요 없다 — 불필요한 변환본 생성을 막는다.
    deviceSizes: [360, 420, 640, 750, 828, 1080, 1200],
    remotePatterns: [
      ...(supabaseUrl ? [new URL(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/**`)] : []),
      ...(nasOrigin ? [new URL(`${nasOrigin}/photos/snap/**`)] : []),
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // 토큰이 **URL 자체**인 페이지들. 기본 정책도 cross-origin 에는 origin 만
      // 보내지만, 여기서는 아예 보내지 않는다 — 링크 하나가 곧 관리 권한이라
      // 새어 나갈 경로를 하나도 남기지 않는 편이 낫다.
      // (캐시 금지도 함께 — 공용 기기의 뒤로 가기로 되살아나지 않게)
      ...["/delivery/manage/:path*", "/delivery/recover/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      })),
    ];
  },
};

export default nextConfig;
