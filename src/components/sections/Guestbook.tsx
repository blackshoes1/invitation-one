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
export default function Guestbook({
  qrEntry = false,
  mapOnly = false,
}: {
  qrEntry?: boolean;
  /** 공개 전 화면에서는 공개 지도만 표시하고 관리자 실명 조회는 하지 않는다. */
  mapOnly?: boolean;
}) {
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<ViewMode>("messages");
  const [mineId, setMineId] = useState<string | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  /**
   * 관리자(신랑·신부) 전용 실명 보기 — 관리자 세션이 있을 때만 서버가 내려준다.
   * 공개 피드는 그대로 마스킹된 채 두고 화면에서만 실명을 덧입힌다.
   */
  const [realNames, setRealNames] = useState<Record<
    string,
    { name: string; masked: boolean }
  > | null>(null);

  // 최초 로드 + 25초 폴링 (MP-1) — 새 마음/리뷰가 도착하면 지도·피드 갱신 + 토스트
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
      return;
    }
    let alive = true;
    const seen = new Set<string>();
    let first = true;

    const fetchNow = async () => {
      const { data, error } = await supabase!.rpc("get_celebrations");
      if (!alive) return;
      if (error || !Array.isArray(data)) {
        // RPC 실패 시에도 로딩 표시는 해제 — "불러오는 중…" 영구 표시 방지.
        // 오류 안내를 표시하고, 25초 폴링이 재시도한다.
        setLoaded(true);
        setLoadFailed(true);
        return;
      }
      const list = data as Celebration[];
      // 최초 로드 이후 새로 들어온 항목 감지 → 토스트
      if (!first) {
        const fresh = list.find((c) => !seen.has(c.id));
        if (fresh) {
          const where = fresh.area ? `${fresh.area}에서 ` : "";
          setLiveToast(
            fresh.kind === "마음배송"
              ? `방금 ${where}마음이 도착했어요 💌`
              : `방금 ${where}축하가 도착했어요 🛵`
          );
          setTimeout(() => alive && setLiveToast(null), 4000);
        }
      }
      list.forEach((c) => seen.add(c.id));
      first = false;
      setCelebrations(list);
      setLoaded(true);
      setLoadFailed(false);
    };

    fetchNow();
    // 백그라운드 탭에서는 폴링 스킵 (배터리/요청 절약)
    const timer = setInterval(() => {
      if (!document.hidden) fetchNow();
    }, 25000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // 관리자 세션이면 실명 매핑을 받아둔다 (하객은 401 → null 유지)
  useEffect(() => {
    if (mapOnly) return;
    let alive = true;
    fetch("/api/admin/celebrations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.realNames) setRealNames(j.realNames);
      })
      .catch(() => {
        /* 하객·비로그인 — 무시 */
      });
    return () => {
      alive = false;
    };
  }, [mapOnly]);

  const count = celebrations.length;
  const empty = loaded && count === 0;
  const feed = mapOnly ? [] : buildFeed(celebrations);

  return (
    <section
      aria-label="우리를 축하해준 사람들"
      className={`relative ${mapOnly ? "py-8" : "px-6 py-12"} bg-wedding-cream border-t border-wedding-gold/10`}
    >
      {liveToast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-sage-700 text-white text-xs px-4 py-2 rounded-full shadow-md animate-pulse">
          {liveToast}
        </div>
      )}
      <div className="max-w-sm mx-auto space-y-6 text-center">
        <FadeIn className="space-y-2">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            CELEBRATION
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            우리를 축하해준 사람들
          </h2>
          {!empty && !loadFailed && (
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

        {loadFailed && count === 0 ? (
          <p role="status" className="text-sm text-neutral-500 py-8">
            축하 소식을 잠시 불러오지 못했어요. 잠시 후 자동으로 다시 확인할게요.
          </p>
        ) : empty ? (
          <FadeIn>
            <p className="text-sm text-neutral-500 py-8">
              첫 손님을 기다리고 있어요 🛵
              <br />
              가장 먼저 축하 마음을 남겨주세요 💐
            </p>
          </FadeIn>
        ) : (
          <>
            {/* 뷰 전환 */}
            {!mapOnly && (
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
            )}

            <FadeIn>
              {mapOnly || mode === "map" ? (
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
                <>
                  {realNames && (
                    <p className="mb-2 text-[11px] text-sage-600 bg-sage-50 border border-dashed border-sage-300 px-3 py-1.5 rounded-sm">
                      🔒 관리자 모드 — 점선 배지의 실명은 <b>나에게만</b> 보여요
                      (하객 화면에는 별명만 표시됩니다)
                    </p>
                  )}
                  <MessageFeed items={feed} highlightId={mineId} realNames={realNames} />
                </>
              )}
            </FadeIn>
          </>
        )}

        {/* 본인 확인 + 뱃지 — 종이 QR 진입자에게만 노출 */}
        {qrEntry && !mapOnly && (
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
