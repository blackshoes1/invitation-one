"use client";

import { useEffect, useState } from "react";
import type { RouteDay } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";
import RouteMap from "@/components/RouteMap";
import type { TabCtx } from "@/app/admin/shared";

/** 배송경로 탭 — 날짜별 묶음 + 지오코딩 지도 + 최근접 동선. 마운트 시 자체 로드. */
export default function RouteTab({ api, setError, setNotice: _setNotice }: TabCtx) {
  void _setNotice; // TabCtx 시그니처 유지용 (이 탭은 notice 미사용)
  const [routeDays, setRouteDays] = useState<RouteDay[]>([]);
  const [routeOrigin, setRouteOrigin] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const [routeDate, setRouteDate] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/admin/route");
        const j = await res.json();
        if (!alive) return;
        if (res.ok) {
          const days = (j.days ?? []) as RouteDay[];
          setRouteDays(days);
          setRouteOrigin(j.origin ?? null);
          setRouteDate((prev) =>
            prev && days.some((d) => d.date === prev) ? prev : days[0]?.date ?? ""
          );
        } else setError(j.error ?? "경로 불러오기 실패");
      } catch {
        if (alive) setError("경로를 불러오지 못했습니다. 네트워크를 확인해주세요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-neutral-400 text-center">
        배송할 주문(대기중·확정)을 날짜별로 묶고, 식장 기준 가까운 순서로 정렬했어요.
        번호대로 돌면 효율적이에요. (주소는 카카오로 자동 위치 변환)
      </p>

      {loading && (
        <p className="text-xs text-neutral-400 text-center">불러오는 중…</p>
      )}
      {!loading && routeDays.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-10">
          배송할 주문이 없습니다.
        </p>
      )}

      {routeDays.length > 0 && (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {routeDays.map((d) => (
              <button
                key={d.date}
                onClick={() => setRouteDate(d.date)}
                className={`px-3 py-1.5 text-xs border ${
                  routeDate === d.date
                    ? "bg-sage-600 text-white border-sage-600"
                    : "bg-white text-neutral-500 border-wedding-gold/20"
                }`}
              >
                {formatYmdKo(d.date)} · {d.count}건
              </button>
            ))}
          </div>

          {(() => {
            const day = routeDays.find((d) => d.date === routeDate);
            if (!day || !routeOrigin) return null;
            return (
              <>
                <RouteMap stops={day.stops} origin={routeOrigin} />
                <ol className="space-y-2">
                  {day.stops.map((s) => {
                    const noGeo = s.lat == null || s.lng == null;
                    return (
                      <li
                        key={s.id}
                        className="bg-white border border-wedding-gold/15 p-3 flex gap-3 text-sm"
                      >
                        <span
                          className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            noGeo
                              ? "bg-neutral-200 text-neutral-500"
                              : "bg-delivery text-white"
                          }`}
                        >
                          {noGeo ? "?" : s.order}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sage-700">
                            {s.name}
                            {s.count > 1 && (
                              <span className="text-[11px] text-neutral-400 font-normal">
                                {" "}
                                외 {s.count - 1}명
                              </span>
                            )}
                            <span className="text-[11px] text-neutral-400 font-normal">
                              {" · "}
                              {s.time_slot} · {s.tracking_stage}
                            </span>
                          </p>
                          <p className="text-xs text-neutral-500 break-words">
                            📍 {s.location}
                            {noGeo && (
                              <span className="text-red-400"> (위치 못 찾음)</span>
                            )}
                          </p>
                          <div className="flex gap-3 mt-1 text-[11px]">
                            {s.phone && (
                              <a
                                href={`tel:${s.phone}`}
                                className="text-delivery underline"
                              >
                                {s.phone}
                              </a>
                            )}
                            <a
                              href={`https://map.kakao.com/?q=${encodeURIComponent(
                                s.location
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sage-600 underline"
                            >
                              카카오맵 열기
                            </a>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
