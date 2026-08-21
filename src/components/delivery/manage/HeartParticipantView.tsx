"use client";

import Link from "next/link";
import type { ParticipantDetail } from "@/lib/supabase";
import { invitationHref } from "./types";

/* ---------- 마음배송 참여자 ---------- */
export default function HeartParticipantView({
  detail,
  token,
}: {
  detail: ParticipantDetail;
  token: string;
}) {
  const convertHref = detail.group_slug
    ? `/delivery/group/${detail.group_slug}?convert=${token}`
    : `/delivery?convert=${token}`;
  return (
    <div className="max-w-md mx-auto px-6 py-10 space-y-5 text-center">
      <div className="text-5xl">{detail.stamp ?? "💌"}</div>
      <h1 className="text-xl font-extrabold text-neutral-800">
        {detail.name}님의 마음 배송
      </h1>
      {detail.region && (
        <p className="text-sm text-neutral-500">📍 {detail.region}에서 보내주셨어요</p>
      )}
      {detail.message && (
        <p className="text-sm text-neutral-500 bg-white rounded-2xl border border-delivery/10 p-4">
          “{detail.message}”
        </p>
      )}
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wedding-gold/10 text-wedding-gold text-xs font-bold">
        💌 마음으로 함께한 분
      </div>
      <div className="pt-3 space-y-3">
        <Link
          href={invitationHref}
          className="block mx-auto w-fit px-6 py-3.5 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform"
        >
          💌 모바일 청첩장 보기
        </Link>
        <div>
          <Link
            href={convertHref}
            className="text-sm text-delivery underline underline-offset-2"
          >
            역시 직접 만나서 받고 싶어요 🛵
          </Link>
          <p className="mt-1.5 text-[11px] text-neutral-400">
            언제든 마음이 바뀌면 직접 배달로 전환할 수 있어요
          </p>
        </div>
      </div>
    </div>
  );
}
