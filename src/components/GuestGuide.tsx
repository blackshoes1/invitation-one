import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight, Images, ParkingCircle } from "lucide-react";
import Account from "@/components/sections/Account";
import ParkingRouteMap from "@/components/ParkingRouteMap";
import ShareButton from "@/components/ShareButton";
import { bride, groom, parkingLot, venue, formatFullDate, formatTime } from "@/lib/wedding";

const actionClass = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sage-100 px-4 py-3 text-sm font-medium text-sage-800 transition-colors hover:bg-sage-200";

export default function GuestGuide({
  view,
  query,
}: {
  view?: string;
  query: { key?: string; via?: string };
}) {
  const detail = view === "accounts" || view === "route";

  if (!detail) {
    return (
      <div className="min-h-screen bg-[#354b31] bg-[radial-gradient(ellipse_at_top_left,#455c3b80,transparent_60%),radial-gradient(ellipse_at_bottom_right,#263c2780,transparent_60%)] text-[#faf9f5]">
        <div className="mx-auto max-w-[440px] px-[22px] pt-[64px] pb-7">
          <header className="px-3 pb-5">
            <p className="font-serif text-[11px] leading-normal tracking-[0.12em]">{formatFullDate()} · {formatTime()}</p>
            <h1 className="mt-6 font-serif text-[clamp(1.5rem,8.5vw,2rem)] leading-[1.45] tracking-tight">
              <span className="block font-light">예식 전,</span>
              <span className="block font-semibold">꼭 확인해 주세요.</span>
            </h1>
            <p className="mt-4 font-serif text-[14px] leading-relaxed text-white/90">하객 여러분을 위한 예식 당일 안내입니다.</p>
          </header>

          <nav aria-label="예식 당일 안내" className="space-y-[10px]">
            <Link href={{ pathname: "/", query: { ...query, view: "accounts" } }} aria-label="축의금 계좌 안내" className="relative block rounded-[15px] bg-[#faf9f6] px-[22px] py-[20px] text-[#111511] transition-colors hover:bg-white">
              <p className="font-serif text-[14px] leading-tight text-[#455c3c]">01</p>
              <h2 className="mt-1.5 pr-5 font-serif text-[clamp(16px,4.7vw,22px)] font-semibold leading-relaxed">축의금 계좌 안내</h2>
              <p className="mt-1.5 text-[14px] leading-[1.5] text-[#6c7077]">현장 축의대는 운영하지 않습니다.</p>
              <ChevronRight size={24} aria-hidden="true" className="absolute top-1/2 right-4 -translate-y-1/2 text-[#455c3c]" />
            </Link>
            <Link href={{ pathname: "/", query: { ...query, view: "route" } }} aria-label="예식장 오시는 길" className="relative block rounded-[15px] bg-[#faf9f6] px-[22px] py-[20px] text-[#111511] transition-colors hover:bg-white">
              <p className="font-serif text-[14px] leading-tight text-[#455c3c]">02</p>
              <h2 className="mt-1.5 pr-5 font-serif text-[clamp(16px,4.7vw,22px)] font-semibold leading-relaxed">예식장 오시는 길</h2>
              <p className="mt-1.5 text-[14px] leading-[1.5] text-[#6c7077]">주차장에서 예식장까지 오시는 길을 안내해 드려요.</p>
              <ChevronRight size={24} aria-hidden="true" className="absolute top-1/2 right-4 -translate-y-1/2 text-[#455c3c]" />
            </Link>
            <Link href={{ pathname: "/", query: { ...query, view: "photos" }, hash: "guest-snap" }} prefetch={false} aria-label="오늘의 베스트샷을 찾습니다!" className="relative block rounded-[15px] bg-[#faf9f6] px-[22px] py-[20px] text-[#111511] transition-colors hover:bg-white">
              <p className="font-serif text-[14px] leading-tight text-[#455c3c]">03</p>
              <h2 className="mt-1.5 pr-5 font-serif text-[clamp(16px,4.7vw,22px)] font-semibold leading-relaxed">오늘의 베스트샷을 찾습니다!</h2>
              <p className="mt-1.5 text-[14px] leading-[1.5] text-[#6c7077]">사진을 올려주시는 분들 중<br />첫 업로드와 베스트샷에 선물을 드려요.</p>
              <ChevronRight size={24} aria-hidden="true" className="absolute top-1/2 right-4 -translate-y-1/2 text-[#455c3c]" />
            </Link>
          </nav>

          <Link href={{ pathname: "/", query: { ...query, view: "photos" } }} prefetch={false} className="mt-4 flex min-h-[52px] items-center justify-center gap-3 rounded-full bg-[#ffffff24] px-4 py-3 text-[16px] transition-colors hover:bg-white/20">
            모바일 청첩장 보러가기 <ArrowRight size={22} aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[440px] px-6 pt-6 pb-8">
      <Link href={{ pathname: "/", query }} className="inline-flex min-h-11 items-center gap-2 text-sm text-sage-700">
        <ArrowLeft size={16} aria-hidden="true" /> 하객 안내로
      </Link>

      <header className="pt-4 pb-4">
        <p className="mb-2 text-xs tracking-[0.12em] text-sage-600">
          {view === "accounts" ? "마음 전하실 곳" : "주차 후 이동 안내"}
        </p>
        <h1 className="font-serif text-xl leading-[1.35] tracking-tight">
          {view === "accounts" ? (
            <>마음 전하기</>
          ) : (
            <>주차장에서 예식장까지 안내드려요.</>
          )}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-sage-600">
          {view === "accounts" ? "현장 축의대는 운영하지 않습니다. 축의금은 계좌 입금을 부탁드립니다." : `${parkingLot.name} → ${venue.name} 야외예식장`}
        </p>
      </header>

      {view === "accounts" ? (
        <div className="overflow-hidden rounded-2xl border border-sage-200">
          <Account initiallyOpen />
        </div>
      ) : (
        <section aria-label="주차장부터 예식장까지 이동 안내" className="space-y-5">
          <article className="rounded-2xl border border-sage-200 bg-white p-5">
            <p className="mb-2 text-xs tracking-wider text-sage-600">01 · 주차 위치</p>
            <h2 className="text-lg font-medium">{parkingLot.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-sage-600">{parkingLot.address}</p>
            <p className="mt-3 text-sm leading-relaxed text-sage-600">박물관 사정에 따라 주차가 어려울 수 있으니 가급적 대중교통 이용을 권장드립니다.</p>
            <a href={parkingLot.nav.naverWeb} target="_blank" rel="noopener noreferrer" className={`${actionClass} mt-4`}>
              <ParkingCircle size={16} aria-hidden="true" /> 주차장 위치 보기 <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
          <article className="rounded-2xl border border-sage-200 bg-white p-5">
            <p className="mb-2 text-xs tracking-wider text-sage-600">02 · 예식장으로 이동</p>
            <h2 className="mb-4 text-lg font-medium">주차 후 도보로 이동해 주세요.</h2>
            <div className="overflow-hidden rounded-xl"><ParkingRouteMap /></div>
            <p className="mt-3 text-xs leading-relaxed text-sage-600">지도에 표시된 선은 이동 방향을 나타내는 약도입니다. 정확한 보행 경로는 아래 도보 길찾기로 확인해 주세요.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={parkingLot.walkNav.kakaoWeb} target="_blank" rel="noopener noreferrer" className={actionClass}>카카오맵 길찾기</a>
              <a href={parkingLot.walkNav.naverWeb} target="_blank" rel="noopener noreferrer" className={actionClass}>네이버 도보 길찾기</a>
            </div>
          </article>
          <article className="rounded-2xl border border-sage-200 bg-white p-5">
            <p className="mb-2 text-xs tracking-wider text-sage-600">03 · 예식장 도착</p>
            <h2 className="text-lg font-medium">{venue.name} 야외예식장</h2>
            <p className="mt-2 text-sm leading-relaxed text-sage-600">{venue.address}</p>
            <a href={`tel:${venue.tel}`} className="mt-4 inline-flex min-h-11 items-center text-sm text-sage-700 underline underline-offset-4">예식장 문의 · {venue.tel}</a>
          </article>
        </section>
      )}

      <div className="mt-5 border-t border-sage-200 pt-4 text-center">
        <p className="mb-3 text-sm text-sage-600">저희의 이야기도 만나보세요.</p>
        <Link href={{ pathname: "/", query: { ...query, view: "photos" } }} prefetch={false} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sage-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sage-800">
          <Images size={17} aria-hidden="true" /> 사진 보기 <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <p className="mt-3 text-xs leading-relaxed text-sage-600">사진과 초대의 마음이 담긴 모바일 청첩장으로</p>
      </div>
      <footer className="pt-7 text-center">
        <p className="font-serif text-sm text-sage-700">{groom.name} · {bride.name}</p>
        <p className="mt-2 text-xs leading-relaxed text-sage-600">{formatFullDate()} {formatTime()}<br />{venue.name} 야외예식장</p>
        <div className="mt-6"><ShareButton /></div>
      </footer>
    </div>
  );
}
