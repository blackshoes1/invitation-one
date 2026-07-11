"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured, type Celebration } from "@/lib/supabase";
import { sidoOf } from "@/lib/regions";
import { SIDO_POS } from "@/lib/koreaGeo";
import FadeIn from "@/components/FadeIn";
import MessageFeed, { buildFeed } from "@/components/sections/MessageFeed";
import JourneyMap from "@/components/sections/JourneyMap";
import VerifyBadge from "@/components/sections/VerifyBadge";

type ViewMode = "map" | "messages";

// 예식지(서울 용산) 기준 위치 — '가장 먼 곳' 계산용
const SEOUL = SIDO_POS["서울"];

/** 축하 지역 통계 (MP-2) — TOP 3 지역 + 가장 먼 곳 */
function regionStats(celebrations: Celebration[]) {
  const counts = new Map<string, number>();
  let overseas = 0;
  for (const c of celebrations) {
    if (c.area?.startsWith("해외")) {
      overseas++;
      continue;
    }
    const sido = sidoOf(c.area);
    if (sido) counts.set(sido, (counts.get(sido) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  let farthest: string | null = null;
  if (overseas > 0) farthest = "해외 🌍";
  else {
    let best = -1;
    for (const [sido] of counts) {
      const p = SIDO_POS[sido];
      if (!p) continue;
      const d = (p.x - SEOUL.x) ** 2 + (p.y - SEOUL.y) ** 2;
      if (d > best) {
        best = d;
        farthest = sido;
      }
    }
  }
  return { top, farthest, hasAny: top.length > 0 || overseas > 0 };
}

/**
 * 💝 우리를 축하해준 사람들 — 지도(🛵/💌 핀) / 메시지(방명록+리뷰) 통합
 * 데이터: participants 기반 get_celebrations RPC 하나로 조회
 */
export default function Guestbook({ qrEntry = false }: { qrEntry?: boolean }) {
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<ViewMode>("messages");
  const [mineId, setMineId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase!.rpc("get_celebrations");
      if (!alive) return;
      setCelebrations(Array.isArray(data) ? (data as Celebration[]) : []);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const count = celebrations.length;
  const empty = loaded && count === 0;
  const feed = buildFeed(celebrations);

  return (
    <section className="px-6 py-12 bg-wedding-cream border-t border-wedding-gold/10">
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
                <>
                  {(() => {
                    const st = regionStats(celebrations);
                    if (!st.hasAny) return null;
                    return (
                      <div className="mb-3 flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                        {st.top.length > 0 && (
                          <span>
                            🏅 축하 많은 지역{" "}
                            {st.top.map(([s, n], i) => (
                              <span key={s}>
                                {i > 0 && " · "}
                                <span className="font-bold text-sage-700">{s}</span> {n}
                              </span>
                            ))}
                          </span>
                        )}
                        {st.farthest && (
                          <span>
                            🌍 가장 먼 곳{" "}
                            <span className="font-bold text-sage-700">{st.farthest}</span>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <JourneyMap celebrations={celebrations} highlightId={mineId} />
                </>
              ) : (
                <MessageFeed items={feed} highlightId={mineId} />
              )}
            </FadeIn>
          </>
        )}

        {/* 본인 확인 + 뱃지 — 종이 QR 진입자에게만 노출 */}
        {qrEntry && (
          <FadeIn className="pt-2">
            <VerifyBadge onVerified={(id) => setMineId(id)} />
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
