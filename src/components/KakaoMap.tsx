"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { venue } from "@/lib/wedding";

// Kakao SDK 전역
declare global {
  interface Window {
    // 카카오 지도 SDK는 공식 타입 패키지가 없어 런타임 전역으로 사용
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao?: any;
  }
}

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

/**
 * NEXT_PUBLIC_KAKAO_MAP_KEY 가 있으면 카카오 지도를 임베드하고,
 * 없으면 주소가 표기된 정적 약도 플레이스홀더를 보여줍니다.
 * (키 발급: https://developers.kakao.com → JavaScript 키, 도메인 등록 필요)
 */
export default function KakaoMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!KAKAO_KEY || !mapRef.current) return;

    const SCRIPT_ID = "kakao-maps-sdk";
    const render = () => {
      const kakao = window.kakao;
      if (!kakao?.maps) return setFailed(true);
      kakao.maps.load(() => {
        const center = new kakao.maps.LatLng(venue.lat, venue.lng);
        const map = new kakao.maps.Map(mapRef.current, { center, level: 4 });
        new kakao.maps.Marker({ map, position: center });
        map.setDraggable(false);
        map.setZoomable(false);
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
            {venue.name}
          </p>
          <p className="text-xs text-neutral-500">{venue.address}</p>
          <p className="text-[10px] text-neutral-400 mt-1 tracking-wide">
            아래 버튼으로 길찾기를 이용해 주세요
          </p>
        </div>
      )}

      <div className="absolute bottom-3 right-3 bg-sage-700/85 backdrop-blur-sm text-white px-2 py-0.5 rounded-[2px] text-[10px] tracking-widest flex items-center gap-1 font-light">
        <MapPin size={10} /> {venue.name}
      </div>
    </div>
  );
}
