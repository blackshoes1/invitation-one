"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { venue, parkingLot } from "@/lib/wedding";

// Kakao SDK 전역 (KakaoMap.tsx 와 동일 패턴)
declare global {
  interface Window {
    // 카카오 지도 SDK는 공식 타입 패키지가 없어 런타임 전역으로 사용
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao?: any;
  }
}

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

/**
 * 주차장 → 예식장 도보 경로 지도.
 * 한 지도에 🅿️ 주차장·💒 예식장 마커를 함께 띄우고, 사이를 점선(약도)으로
 * 연결해 이동 방향을 한눈에 보여줍니다. 정확한 보행 내비는 아래
 * "도보 길찾기" 버튼(카카오맵 도보 모드)으로 안내.
 * SDK 실패 시 KakaoMap 과 같은 정적 플레이스홀더로 폴백.
 */
export default function ParkingRouteMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!KAKAO_KEY || !mapRef.current) return;

    const SCRIPT_ID = "kakao-maps-sdk";
    const render = () => {
      const kakao = window.kakao;
      if (!kakao?.maps) return setFailed(true);
      kakao.maps.load(() => {
        try {
          const parking = new kakao.maps.LatLng(parkingLot.lat, parkingLot.lng);
          const hall = new kakao.maps.LatLng(venue.lat, venue.lng);
          const map = new kakao.maps.Map(mapRef.current, {
            center: parking,
            level: 5,
          });

          // 두 지점 마커 + 라벨
          new kakao.maps.Marker({ map, position: parking });
          new kakao.maps.Marker({ map, position: hall });
          const label = (pos: unknown, text: string, yAnchor: number) =>
            new kakao.maps.CustomOverlay({
              map,
              position: pos,
              yAnchor,
              content: `<div style="padding:2px 8px;border-radius:9999px;background:#4b5842;color:#fff;font-size:11px;letter-spacing:0.05em;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25)">${text}</div>`,
            });
          label(parking, "🅿️ 주차장", 2.6);
          label(hall, "💒 예식장", 2.6);

          // 도보 경로 약도 (점선) — 근사 웨이포인트
          new kakao.maps.Polyline({
            map,
            path: parkingLot.walkPath.map(
              ([la, ln]) => new kakao.maps.LatLng(la, ln)
            ),
            strokeWeight: 4,
            strokeColor: "#e8632e",
            strokeOpacity: 0.85,
            strokeStyle: "shortdash",
          });

          // 두 지점이 모두 보이도록 화면 맞춤
          const bounds = new kakao.maps.LatLngBounds();
          bounds.extend(parking);
          bounds.extend(hall);
          map.setBounds(bounds, 48);
          map.setDraggable(false);
          map.setZoomable(false);

          // 도메인 미등록/키 오류 시 타일이 안 그려짐 → 일정 시간 내 tilesloaded 없으면 폴백
          const guard = setTimeout(() => setFailed(true), 3000);
          kakao.maps.event.addListener(map, "tilesloaded", () =>
            clearTimeout(guard)
          );
        } catch {
          setFailed(true);
        }
      });
    };

    if (window.kakao?.maps) {
      render();
      return;
    }
    if (document.getElementById(SCRIPT_ID)) {
      document.getElementById(SCRIPT_ID)!.addEventListener("load", render);
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    script.onload = render;
    script.onerror = () => setFailed(true);
    document.head.appendChild(script);
  }, []);

  const showFallback = !KAKAO_KEY || failed;

  return (
    <div className="relative w-full aspect-[4/3] bg-sage-50 border border-wedding-gold/15 overflow-hidden">
      {!showFallback && <div ref={mapRef} className="w-full h-full" />}

      {showFallback && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-4">
          <MapPin size={22} className="text-wedding-gold" strokeWidth={1.4} />
          <p className="font-serif text-sm text-sage-700 tracking-wide">
            {parkingLot.name} → {venue.name}
          </p>
          <p className="text-xs text-neutral-500">{parkingLot.address}</p>
          <p className="text-[10px] text-neutral-500 mt-1 tracking-wide">
            아래 버튼으로 도보 길찾기를 이용해 주세요
          </p>
        </div>
      )}

      <div className="absolute bottom-3 right-3 bg-sage-700/85 backdrop-blur-sm text-white px-2 py-0.5 rounded-[2px] text-[10px] tracking-widest flex items-center gap-1 font-light">
        <MapPin size={10} /> 주차장 → 예식장
      </div>
    </div>
  );
}
