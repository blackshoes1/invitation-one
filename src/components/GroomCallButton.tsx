"use client";

import { Phone } from "lucide-react";
import { groom } from "@/lib/wedding";
import { callGroom } from "@/lib/groomContact";

/**
 * "신랑에게 전화하기" — 링크(`<a href="tel:">`)가 아니라 버튼이다.
 * 번호는 누를 때만 브라우저에서 풀린다 (src/lib/groomContact.ts).
 */
export default function GroomCallButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={callGroom}
      aria-label={`신랑 ${groom.name}에게 전화하기`}
      className={`inline-flex items-center justify-center gap-1.5 ${className}`}
    >
      <Phone size={13} aria-hidden="true" />
      신랑에게 전화하기
    </button>
  );
}
