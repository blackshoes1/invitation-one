import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { groom, bride, formatFullDate, formatTime, venue } from "@/lib/wedding";

// 본문 폰트는 Pretendard Variable (globals.css 에서 CDN @import)
const notoSerif = Noto_Serif_KR({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-serif",
});

const title = `${groom.name} ♥ ${bride.name} 결혼합니다`;
const description = `${formatFullDate()} ${formatTime()}, 서울 ${venue.name}. 소중한 분들을 초대합니다.`;

// 배포 도메인 (카카오톡/SNS 공유 미리보기의 절대 URL 기준). 필요 시 env 로 override.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://kkachi.vercel.app";
const ogImageAlt = `${groom.name} ♥ ${bride.name} 웨딩`;

/**
 * Vercel Web Analytics — 청첩장 방문 수·기기·유입 경로를 Vercel 대시보드에서 본다.
 *
 * `@vercel/analytics` 패키지 대신 Vercel 이 안내하는 스크립트 태그 방식을 쓴다.
 * 패키지는 선택적 peer(@sveltejs/kit → vite 8)가 기존 vite 7 과 충돌해 설치가 안 된다.
 * 스크립트는 같은 출처(`/_vercel/insights/*`)라 CSP 를 바꿀 필요가 없다.
 *
 * **운영 배포에서만** 붙인다 — 그 경로는 Vercel 에만 있어서 로컬·CI·프리뷰에선 404 가
 * 나고, 대시보드도 운영 방문만 센다. 주소 이동(pushState)은 스크립트가 알아서 센다.
 */
const ANALYTICS = process.env.VERCEL_ENV === "production";

export const metadata: Metadata = {
  // metadataBase 가 있어야 상대경로 OG 이미지가 절대 URL 로 변환됨 (카톡 썸네일 정상화)
  metadataBase: new URL(SITE_URL),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "/",
    siteName: title,
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/pic/wedding_main.jpg", alt: ogImageAlt }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/pic/wedding_main.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f2ea",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSerif.variable} h-full antialiased`}>
      <body className="min-h-full bg-wedding-cream">
        {/* Pretendard 다이나믹 서브셋 — CSS @import 대신 head 링크로 로드해
            HTML 파싱 시점에 preconnect·병렬 다운로드 (React 19 가 head 로 호이스팅) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          precedence="default"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {children}
        {ANALYTICS && (
          <>
            <Script id="vercel-analytics-queue" strategy="afterInteractive">
              {"window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};"}
            </Script>
            <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
          </>
        )}
      </body>
    </html>
  );
}
