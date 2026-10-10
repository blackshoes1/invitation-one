import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Flower2, Footprints, Images, MapPin, ParkingCircle, Wallet } from "lucide-react";
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

  return (
    <div className="mx-auto max-w-[440px] px-6 pt-12 pb-8">
      {detail ? (
        <Link href={{ pathname: "/", query }} className="inline-flex min-h-11 items-center gap-2 text-sm text-sage-700">
          <ArrowLeft size={16} aria-hidden="true" /> 하객 안내로
        </Link>
      ) : (
        <p className="flex items-center gap-2 font-serif text-xs tracking-[0.12em] text-sage-600">
          <Flower2 size={15} aria-hidden="true" /> OUR WEDDING
        </p>
      )}

      <header className="pt-8 pb-7">
        <p className="mb-3 text-xs tracking-[0.12em] text-sage-600">
          {view === "accounts" ? "마음 전하실 곳" : view === "route" ? "주차 후 이동 안내" : "소중한 하객 여러분께"}
        </p>
        <h1 className="font-serif text-[1.8rem] leading-[1.55] tracking-tight">
          {view === "accounts" ? (
            <>축하의 마음,<br />감사히 받겠습니다.</>
          ) : view === "route" ? (
            <>주차장에서<br />예식장까지 안내드려요.</>
          ) : (
            <>함께해 주실 날,<br />먼저 안내드려요.</>
          )}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-sage-600">
          {detail ? (
            view === "accounts" ? "현장 축의대는 운영하지 않습니다. 축의금은 계좌 입금을 부탁드립니다." : `${parkingLot.name} → ${venue.name} 야외예식장`
          ) : (
            <>편안하게 오실 수 있도록<br />두 가지 안내를 준비했습니다.</>
          )}
        </p>
      </header>

      {view === "accounts" ? (
        <div className="overflow-hidden rounded-2xl border border-sage-200">
          <Account initiallyOpen />
        </div>
      ) : view === "route" ? (
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
      ) : (
        <section aria-label="꼭 확인해 주세요" className="space-y-4">
          <article className="rounded-2xl border border-sage-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between text-sage-600">
              <p className="text-xs tracking-wide">마음 전하실 곳</p><span className="font-serif text-2xl">01</span>
            </div>
            <h2 className="text-xl font-medium leading-relaxed">축의대는<br />운영하지 않습니다.</h2>
            <p className="mt-3 text-sm leading-relaxed text-sage-600">별도의 현장 접수는 없어요.<br />축의금은 아래 계좌로 보내주시면<br />감사하겠습니다.</p>
            <Link href={{ pathname: "/", query: { ...query, view: "accounts" } }} className={`${actionClass} mt-5`}>
              <Wallet size={16} aria-hidden="true" /> 계좌 확인하기 <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </article>
          <article className="rounded-2xl border border-sage-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between text-sage-600">
              <p className="text-xs tracking-wide">오시는 길</p><span className="font-serif text-2xl">02</span>
            </div>
            <h2 className="text-xl font-medium leading-relaxed">주차 후, 예식장까지<br />이렇게 오세요.</h2>
            <p className="mt-3 text-sm leading-relaxed text-sage-600">{parkingLot.name}에 주차 후<br />{venue.name} 야외예식장으로 이동해 주세요.</p>
            <div className="mt-4 flex items-center justify-between gap-2 text-xs text-sage-700" aria-label="주차장, 이동 경로, 예식장 순서">
              <span className="inline-flex items-center gap-1"><ParkingCircle size={14} aria-hidden="true" />주차장</span><ArrowRight size={14} aria-hidden="true" />
              <span>이동 경로</span><ArrowRight size={14} aria-hidden="true" /><span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" />예식장</span>
            </div>
            <Link href={{ pathname: "/", query: { ...query, view: "route" } }} className={`${actionClass} mt-5`}>
              <Footprints size={16} aria-hidden="true" /> 주차장 → 예식장 길 안내 <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </article>
        </section>
      )}

      <div className="mt-7 border-t border-sage-200 pt-6 text-center">
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
