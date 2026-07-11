"use client";

import { useEffect, useRef } from "react";
import type { RouteStop } from "@/lib/supabase";

// Kakao Maps SDK 전역
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao?: any;
  }
}

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

/**
 * 배송 경로 지도 (AD-1) — 식장(출발) + 배송지 번호 마커 + 방문 순서 폴리라인.
 * 좌표 있는 정류장만 지도에 표시.
 */
export default function RouteMap({
  stops,
  origin,
}: {
  stops: RouteStop[];
  origin: { lat: number; lng: number; name: string };
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!KAKAO_KEY || !ref.current) return;
    const geoStops = stops.filter((s) => s.lat != null && s.lng != null);

    const render = () => {
      const kakao = window.kakao;
      if (!kakao?.maps) return;
      kakao.maps.load(() => {
        const el = ref.current;
        if (!el) return;
        const map = new kakao.maps.Map(el, {
          center: new kakao.maps.LatLng(origin.lat, origin.lng),
          level: 8,
        });
        const bounds = new kakao.maps.LatLngBounds();

        // 출발점(식장)
        const o = new kakao.maps.LatLng(origin.lat, origin.lng);
        bounds.extend(o);
        new kakao.maps.CustomOverlay({
          map,
          position: o,
          yAnchor: 1,
          content:
            '<div style="padding:2px 6px;background:#5f6b52;color:#fff;font-size:11px;border-radius:10px;white-space:nowrap;">🏛 식장</div>',
        });

        // 경로 폴리라인 (식장 → 정류장 순서)
        const path = [o];
        geoStops.forEach((s) => {
          const pos = new kakao.maps.LatLng(s.lat, s.lng);
          bounds.extend(pos);
          path.push(pos);
          new kakao.maps.CustomOverlay({
            map,
            position: pos,
            yAnchor: 1,
            content: `<div style="width:22px;height:22px;background:#2AC1BC;color:#fff;font-size:12px;font-weight:700;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${s.order}</div>`,
          });
        });
        if (path.length > 1) {
          new kakao.maps.Polyline({
            map,
            path,
            strokeWeight: 3,
            strokeColor: "#2AC1BC",
            strokeOpacity: 0.7,
            strokeStyle: "solid",
          });
        }
        if (geoStops.length > 0) map.setBounds(bounds);
      });
    };

    if (window.kakao?.maps) return render();
    const ID = "kakao-maps-sdk";
    const existing = document.getElementById(ID);
    if (existing) {
      existing.addEventListener("load", render);
      return;
    }
    const s = document.createElement("script");
    s.id = ID;
    s.async = true;
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    s.onload = render;
    document.head.appendChild(s);
  }, [stops, origin]);

  if (!KAKAO_KEY) {
    return (
      <div className="w-full aspect-[4/3] bg-neutral-100 flex items-center justify-center text-xs text-neutral-400 border border-neutral-200">
        지도 키가 설정되지 않았어요
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="w-full aspect-[4/3] border border-neutral-200 bg-neutral-50"
    />
  );
}
