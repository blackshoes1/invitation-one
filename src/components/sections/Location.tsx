"use client";

import { Phone, Navigation, CalendarPlus, UserPlus, CircleParking } from "lucide-react";
import { venue, parkingLot, weddingIcs, weddingVcard } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";
import KakaoMap from "@/components/KakaoMap";

/** 텍스트를 파일로 내려받기 (Blob 다운로드 공통 헬퍼) */
function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 예식 일정을 .ics 로 내려받아 캘린더에 추가 */
function addToCalendar() {
  downloadFile(weddingIcs(), "wedding.ics", "text/calendar;charset=utf-8");
}

/** 예식 연락처를 .vcf 로 내려받아 연락처에 저장 */
function saveContact() {
  downloadFile(weddingVcard(), "wedding.vcf", "text/vcard;charset=utf-8");
}

/** 앱 스킴을 먼저 시도하고, 안 열리면 웹 지도로 폴백 */
function openNav(appUrl: string, webUrl: string) {
  const start = Date.now();
  const timer = setTimeout(() => {
    // 앱 전환이 일어났다면 페이지가 숨겨져 이 코드가 늦게 돈다 → 그때는 폴백 생략
    if (Date.now() - start < 1600 && !document.hidden) {
      window.location.href = webUrl;
    }
  }, 1200);
  window.addEventListener(
    "pagehide",
    () => clearTimeout(timer),
    { once: true }
  );
  window.location.href = appUrl;
}

const NAV_APPS: { title: string; app: string; web: string }[] = [
  { title: "네이버 지도", app: venue.nav.naverApp, web: venue.nav.naverWeb },
  { title: "카카오맵", app: venue.nav.kakaoApp, web: venue.nav.kakaoWeb },
  { title: "티맵", app: venue.nav.tmapApp, web: venue.nav.tmapWeb },
];

/** 주차장(자차) 길찾기 — 국립중앙박물관 주차장 목적지 */
const PARKING_NAV_APPS: { title: string; app: string; web: string }[] = [
  { title: "네이버 지도", app: parkingLot.nav.naverApp, web: parkingLot.nav.naverWeb },
  { title: "카카오맵", app: parkingLot.nav.kakaoApp, web: parkingLot.nav.kakaoWeb },
  { title: "티맵", app: parkingLot.nav.tmapApp, web: parkingLot.nav.tmapWeb },
];

export default function Location() {
  return (
    <section className="px-6 py-12 bg-white border-t border-wedding-gold/10">
      <div className="max-w-sm mx-auto space-y-9 text-center">
        <FadeIn className="space-y-2">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            LOCATION
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            오시는 길
          </h2>
        </FadeIn>

        <FadeIn className="space-y-2 text-sm font-light text-neutral-600 tracking-wide">
          <p className="font-serif font-normal text-base text-sage-700">
            {venue.name}
          </p>
          <p className="text-neutral-500 text-xs">{venue.address}</p>
          <div className="flex justify-center items-center gap-1 text-xs text-wedding-gold mt-2">
            <Phone size={11} />
            <a href={`tel:${venue.tel}`} className="underline underline-offset-2">
              {venue.tel}
            </a>
          </div>
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={addToCalendar}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-wedding-gold/30 text-xs text-sage-700 tracking-wide hover:bg-sage-50 transition-colors"
            >
              <CalendarPlus size={13} className="text-wedding-gold" />
              내 캘린더에 추가
            </button>
            <button
              type="button"
              onClick={saveContact}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-wedding-gold/30 text-xs text-sage-700 tracking-wide hover:bg-sage-50 transition-colors"
            >
              <UserPlus size={13} className="text-wedding-gold" />
              연락처 저장
            </button>
          </div>
        </FadeIn>

        <FadeIn>
          <KakaoMap />
        </FadeIn>

        <FadeIn className="grid grid-cols-3 gap-3">
          {NAV_APPS.map(({ title, app, web }) => (
            <button
              key={title}
              type="button"
              onClick={() => openNav(app, web)}
              className="flex flex-col items-center justify-center py-3 border border-wedding-gold/20 bg-white hover:bg-sage-50 transition-colors gap-1 text-[11px] text-neutral-600 font-light tracking-wider"
            >
              <span>{title}</span>
              <Navigation size={11} className="text-wedding-gold rotate-45" />
            </button>
          ))}
        </FadeIn>

        {/* 🚗 주차 안내 — 국립중앙박물관 주차장 (자차 하객) */}
        <FadeIn className="space-y-3 pt-2">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1.5 font-serif text-sm text-sage-700 tracking-widest">
              <CircleParking size={15} className="text-wedding-gold" />
              주차 안내
            </p>
            <p className="text-xs text-neutral-500 leading-relaxed font-light tracking-wide">
              <span className="font-normal text-sage-700 border-b border-wedding-gold/40 pb-0.5">
                {venue.parking}
              </span>
              <br />
              <span className="text-[11px] text-neutral-400">
                ({parkingLot.address} · 주차 후 예식장까지 도보 이동)
              </span>
            </p>
          </div>
          <KakaoMap
            lat={parkingLot.lat}
            lng={parkingLot.lng}
            name={parkingLot.name}
            address={parkingLot.address}
          />
          <div className="grid grid-cols-3 gap-3">
            {PARKING_NAV_APPS.map(({ title, app, web }) => (
              <button
                key={title}
                type="button"
                onClick={() => openNav(app, web)}
                className="flex flex-col items-center justify-center py-3 border border-wedding-gold/20 bg-white hover:bg-sage-50 transition-colors gap-1 text-[11px] text-neutral-600 font-light tracking-wider"
              >
                <span>{title}</span>
                <Navigation size={11} className="text-wedding-gold rotate-45" />
              </button>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
