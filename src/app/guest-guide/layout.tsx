import type { Metadata } from "next";

export const metadata: Metadata = { title: "예식 전 안내 확인", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
