"use client";

import type { Message, PublicReview } from "@/lib/supabase";

/** 방명록(마음 배송) + 리뷰(직접 배달)를 시간순으로 섞은 한 줄기 피드 */
export type FeedItem =
  | { kind: "message"; key: string; name: string; stamp: string | null; text: string | null; at: string }
  | { kind: "review"; key: string; name: string; rating: number; text: string | null; at: string };

export function buildFeed(messages: Message[], reviews: PublicReview[]): FeedItem[] {
  const items: FeedItem[] = [
    ...messages.map<FeedItem>((m) => ({
      kind: "message",
      key: `m-${m.id}`,
      name: m.name,
      stamp: m.stamp,
      text: m.message,
      at: m.created_at,
    })),
    ...reviews.map<FeedItem>((r, i) => ({
      kind: "review",
      key: `r-${r.created_at}-${i}`,
      name: r.name,
      rating: r.review_rating,
      text: r.review_text,
      at: r.created_at,
    })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)); // 최신순
}

export default function MessageFeed({
  items,
  highlightName,
}: {
  items: FeedItem[];
  highlightName?: string | null;
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
        const mine = highlightName && it.name === highlightName;
        return (
          <li
            key={it.key}
            className={`bg-white border p-4 flex gap-3 rounded-sm ${
              mine
                ? "border-wedding-gold/60 ring-1 ring-wedding-gold/30"
                : "border-wedding-gold/10"
            }`}
          >
            <span className="text-xl shrink-0 leading-none pt-0.5">
              {it.kind === "review" ? "🛵" : it.stamp ?? "💌"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium text-sage-700">{it.name}</p>
                {it.kind === "review" ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-delivery/10 text-delivery font-bold">
                    🛵✅ 직접 받음
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-wedding-gold/10 text-wedding-gold font-bold">
                    💌 마음 배송
                  </span>
                )}
                {mine && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sage-600 text-white">
                    내 축하
                  </span>
                )}
              </div>
              {it.kind === "review" && (
                <p className="text-xs text-amber-500 mt-0.5">
                  {"⭐".repeat(it.rating)}
                </p>
              )}
              {it.text && (
                <p className="text-xs text-neutral-500 leading-relaxed mt-0.5 break-words">
                  {it.text}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
