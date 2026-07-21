import type { Metadata } from "next";

/** 체크인 페이지 — 검색 색인 차단 (docs/CHECKIN_SEATING_SPEC.md §10) */
export const metadata: Metadata = {
  title: "현장 체크인",
  robots: { index: false, follow: false },
};

export default function CheckinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
