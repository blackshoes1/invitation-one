"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { groom, bride } from "@/lib/wedding";
import CancelChangeForm from "@/components/delivery/CancelChangeForm";

export default function ManagePage() {
  const params = useParams<{ participantId: string }>();

  return (
    <div>
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center justify-between shadow-sm">
        <span className="font-serif font-bold tracking-tight">
          🛵 {groom.name}·{bride.name} 스토어
        </span>
        <Link href="/" className="text-xs bg-white/20 px-3 py-1.5 rounded-full font-medium">
          💌 청첩장
        </Link>
      </header>
      <CancelChangeForm participantId={params.participantId} />
    </div>
  );
}
