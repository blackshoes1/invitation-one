"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured, type Celebration } from "@/lib/supabase";

/**
 * "먼저 받은 분들이 이렇게 말했어요 ⭐" — 신청 유도 리뷰 노출
 * 리뷰 0개면 아무것도 렌더하지 않음 (오픈 초반 대비)
 */
export default function ReviewStrip() {
  const [reviews, setReviews] = useState<Celebration[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let alive = true;
    (async () => {
      const { data } = await supabase!.rpc("get_celebrations");
      if (!alive || !Array.isArray(data)) return;
      setReviews(
        (data as Celebration[])
          .filter((c) => c.kind === "직접배달" && c.rating != null)
          .reverse()
          .slice(0, 10)
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (reviews.length === 0) return null;

  return (
    <div className="max-w-md mx-auto px-6 pb-6">
      <p className="text-center text-xs font-bold text-neutral-500 mb-3">
        먼저 받은 분들이 이렇게 말했어요 ⭐
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {reviews.map((r) => (
          <div
            key={r.id}
            className="shrink-0 w-56 snap-start bg-white rounded-2xl border border-delivery/10 p-4 space-y-1"
          >
            <p className="text-xs font-bold text-neutral-700">
              🛵✅ {r.name}
              <span className="ml-1 text-amber-400">
                {"⭐".repeat(r.rating ?? 0)}
              </span>
            </p>
            {r.review && (
              <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">
                “{r.review}”
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
