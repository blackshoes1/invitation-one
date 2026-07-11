import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
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
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://invitation-one-three.vercel.app";
const ogImageAlt = `${groom.name} ♥ ${bride.name} 웨딩`;

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
      <body className="min-h-full bg-wedding-cream">{children}</body>
    </html>
  );
}
