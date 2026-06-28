import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";
import { groom, bride, formatFullDate, formatTime, venue } from "@/lib/wedding";

const notoSans = Noto_Sans_KR({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans",
});

const notoSerif = Noto_Serif_KR({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-serif",
});

const title = `${groom.name} ♥ ${bride.name} 결혼합니다`;
const description = `${formatFullDate()} ${formatTime()}, 서울 ${venue.name}. 소중한 분들을 초대합니다.`;

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    images: ["/pic/wedding_main.jpg"],
    type: "website",
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
    <html
      lang="ko"
      className={`${notoSans.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-wedding-cream">{children}</body>
    </html>
  );
}
