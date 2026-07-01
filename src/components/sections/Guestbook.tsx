"use client";

import { useEffect, useState } from "react";
import {
  supabase,
  isSupabaseConfigured,
  type Message,
  type PublicReview,
  type JourneyPin,
} from "@/lib/supabase";
import FadeIn from "@/components/FadeIn";
import MessageFeed, { buildFeed, type FeedItem } from "@/components/sections/MessageFeed";
import JourneyMap from "@/components/sections/JourneyMap";
import VerifyBadge from "@/components/sections/VerifyBadge";

type ViewMode = "map" | "messages";

export default function Guestbook({ qrEntry = false }: { qrEntry?: boolean }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [pins, setPins] = useState<JourneyPin[]>([]);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<ViewMode>("messages");
  const [mine, setMine] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const [msgRes, revRes, pinRes] = await Promise.all([
        supabase!
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase!.rpc("get_public_reviews"),
        supabase!.rpc("get_journey_pins"),
      ]);
      if (!alive) return;
      const messages = (Array.isArray(msgRes.data) ? msgRes.data : []) as Message[];
      const reviews = (Array.isArray(revRes.data) ? revRes.data : []) as PublicReview[];
      const journeyPins = (Array.isArray(pinRes.data) ? pinRes.data : []) as JourneyPin[];
      setFeed(buildFeed(messages, reviews));
      setPins(journeyPins);
      // 함께해준 사람 수 = 마음 배송 + 직접 배달 완료
      setCount(messages.length + journeyPins.length);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const empty = loaded && count === 0;

  return (
    <section className="px-6 py-24 bg-wedding-cream border-t border-wedding-gold/10">
      <div className="max-w-sm mx-auto space-y-6 text-center">
        <FadeIn className="space-y-2">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            CELEBRATION
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            우리를 축하해준 사람들
          </h2>
          {!empty && (
            <p className="text-sm text-neutral-500">
              {loaded ? (
                <>
                  지금까지 <span className="font-bold text-sage-700">{count}명</span>이
                  함께해주셨어요 💝
                </>
              ) : (
                "불러오는 중…"
              )}
            </p>
          )}
        </FadeIn>

        {empty ? (
          <FadeIn>
            <p className="text-sm text-neutral-400 py-8">
              첫 손님을 기다리고 있어요 🛵
              <br />
              가장 먼저 축하 마음을 남겨주세요 💐
            </p>
          </FadeIn>
        ) : (
          <>
            {/* 뷰 전환 */}
            <FadeIn>
              <div className="inline-flex bg-white rounded-full p-1 border border-wedding-gold/20">
                <ToggleBtn active={mode === "map"} onClick={() => setMode("map")}>
                  🗺️ 지도
                </ToggleBtn>
                <ToggleBtn
                  active={mode === "messages"}
                  onClick={() => setMode("messages")}
                >
                  💬 메시지
                </ToggleBtn>
              </div>
            </FadeIn>

            <FadeIn>
              {mode === "map" ? (
                <JourneyMap pins={pins} highlightName={mine} />
              ) : (
                <MessageFeed items={feed} highlightName={mine} />
              )}
            </FadeIn>
          </>
        )}

        {/* 본인 확인 + 뱃지 — 종이 QR 진입자에게만 노출 */}
        {qrEntry && (
          <FadeIn className="pt-2">
            <VerifyBadge onVerified={setMine} />
          </FadeIn>
        )}
      </div>
    </section>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-2 text-sm rounded-full transition-colors ${
        active ? "bg-sage-600 text-white font-bold" : "text-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}
