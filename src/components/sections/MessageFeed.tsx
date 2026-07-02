"use client";

import type { Celebration } from "@/lib/supabase";

/**
 * 방명록(마음 배송) + 리뷰(직접 배달)를 한 줄기로 섞은 피드
 * - 마음배송: 신청 즉시 노출 (스탬프 + 한마디 + 지역)
 * - 직접배달: 배송 완료 + 리뷰가 있을 때 노출 (별점 + 한줄)
 */
export function buildFeed(celebrations: Celebration[]): Celebration[] {
  return celebrations
    .filter((c) => c.kind === "마음배송" || c.rating != null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // 최신순
}

export default function MessageFeed({
  items,
  highlightId,
}: {
  items: Celebration[];
  highlightId?: string | null;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-400 py-8 text-center">
        가장 먼저 축하 마음을 남겨주세요 💐
      </p>
    );
  }

  return (
    <ul className="space-y-3 text-left">
      {items.map((it) => {
        const mine = highlightId != null && it.id === highlightId;
        const isReview = it.kind === "직접배달";
        return (
          <li
            key={it.id}
            className={`bg-white border p-4 flex gap-3 rounded-sm ${
              mine
                ? "border-wedding-gold/60 ring-1 ring-wedding-gold/30"
                : "border-wedding-gold/10"
            }`}
          >
            <span className="text-xl shrink-0 leading-none pt-0.5">
              {isReview ? "🛵" : it.stamp ?? "💌"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium text-sage-700">{it.name}</p>
                {isReview ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-delivery/10 text-delivery font-bold">
                    🛵✅ 직접 받음
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-wedding-gold/10 text-wedding-gold font-bold">
                    💌 마음 배송
                  </span>
                )}
                {!isReview && it.area && (
                  <span className="text-[10px] text-neutral-400">({it.area})</span>
                )}
                {mine && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sage-600 text-white">
                    내 축하
                  </span>
                )}
              </div>
              {isReview && it.rating != null && (
                <p className="text-xs text-amber-500 mt-0.5">
                  {"⭐".repeat(it.rating)}
                </p>
              )}
              {(isReview ? it.review : it.message) && (
                <p className="text-xs text-neutral-500 leading-relaxed mt-0.5 break-words">
                  {isReview ? it.review : it.message}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
