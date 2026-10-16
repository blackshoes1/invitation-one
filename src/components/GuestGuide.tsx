import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, Images } from "lucide-react";
import { AccountDetails } from "@/components/sections/Account";
import GuestRouteDetails from "@/components/GuestRouteDetails";
import ShareButton from "@/components/ShareButton";
import Guestbook from "@/components/sections/Guestbook";
import { bride, groom, venue, formatFullDate, formatTime } from "@/lib/wedding";

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
        <div className="mx-auto max-w-[440px] px-[22px] pt-16 pb-7">
          <header className="px-2 pb-5">
            <p className="font-serif text-base">{groom.name} · {bride.name}</p>
            <h1 className="mt-3 font-serif text-2xl font-semibold leading-snug tracking-tight">예식 당일 안내</h1>
            <div className="mt-3 space-y-1 text-sm leading-relaxed text-white/90">
              <p>{formatFullDate()} · {formatTime()}</p>
              <p>{venue.name} 야외예식장</p>
            </div>
          </header>

          <nav aria-label="예식 당일 안내" className="space-y-[10px]">
            <Link href={{ pathname: "/", query: { ...query, view: "accounts" } }} aria-label="축의금 계좌 안내" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[15px] bg-[#faf9f6] px-5 py-4 text-[#111511] transition-colors hover:bg-white">
              <div>
                <p className="font-serif text-sm leading-tight text-[#455c3c]">01</p>
                <h2 className="mt-1.5 font-serif text-lg font-semibold leading-relaxed">축의금 계좌 안내</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6c7077]">현장 축의대는 운영하지 않습니다.</p>
              </div>
              <ChevronRight size={24} aria-hidden="true" className="text-[#455c3c]" />
            </Link>
            <Link href={{ pathname: "/", query: { ...query, view: "route" } }} aria-label="예식장 오시는 길" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[15px] bg-[#faf9f6] px-5 py-4 text-[#111511] transition-colors hover:bg-white">
              <div>
                <p className="font-serif text-sm leading-tight text-[#455c3c]">02</p>
                <h2 className="mt-1.5 font-serif text-lg font-semibold leading-relaxed">예식장 오시는 길</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6c7077]">예식장 위치와 주차 후 이동을 안내해 드려요.</p>
              </div>
              <ChevronRight size={24} aria-hidden="true" className="text-[#455c3c]" />
            </Link>
            <Link href={{ pathname: "/", query: { ...query, view: "guest-snap" } }} prefetch={false} aria-label="오늘의 베스트샷을 찾습니다!" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[15px] bg-[#faf9f6] px-5 py-4 text-[#111511] transition-colors hover:bg-white">
              <div>
                <p className="font-serif text-sm leading-tight text-[#455c3c]">03</p>
                <h2 className="mt-1.5 font-serif text-lg font-semibold leading-relaxed">오늘의 베스트샷을 찾습니다!</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6c7077]">첫 업로드와 베스트샷에 선물을 드려요.</p>
              </div>
              <ChevronRight size={24} aria-hidden="true" className="text-[#455c3c]" />
            </Link>
          </nav>

          <Link href={{ pathname: "/", query: { ...query, view: "photos" } }} prefetch={false} className="mt-4 flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#ffffff24] px-4 py-3 text-base transition-colors hover:bg-white/20">
            모바일 청첩장 보러가기 <ArrowRight size={22} aria-hidden="true" />
          </Link>
          <div className="mt-8">
            <Guestbook villageOnly />
            <Link
              href={{ pathname: "/", query: { ...query, view: "photos" }, hash: "celebration-form" }}
              prefetch={false}
              className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#faf9f6] px-4 py-3 text-base font-medium text-[#354b31] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              축하메시지 남기러 가기 <ArrowRight size={20} aria-hidden="true" className="shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[440px] px-5 pt-6 pb-8">
      <Link href={{ pathname: "/", query }} className="inline-flex min-h-11 items-center gap-2 text-sm text-sage-700">
        <ArrowLeft size={16} aria-hidden="true" /> 하객 안내로
      </Link>

      <header className="pt-4 pb-4">
        <p className="mb-2 text-xs tracking-[0.12em] text-sage-600">
          {view === "accounts" ? "마음 전하실 곳" : "교통 · 주차 안내"}
        </p>
        <h1 className="font-serif text-xl leading-[1.35] tracking-tight">
          {view === "accounts" ? (
            <>마음 전하기</>
          ) : (
            <>예식장 오시는 길</>
          )}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-sage-600">
          {view === "accounts" ? (
            <>현장 축의대는 운영하지 않습니다.<br />마음을 전하실 분들을 위해 계좌를 안내드립니다.</>
          ) : `${venue.name} 야외예식장`}
        </p>
      </header>

      {view === "accounts" ? (
        <div className="space-y-4">
          <AccountDetails />
          <p className="text-sm leading-relaxed text-sage-600">화환은 둘 곳이 없어 정중히 사양합니다.<br />마음만 감사히 받겠습니다.</p>
        </div>
      ) : (
        <GuestRouteDetails />
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
      <a href="/privacy" className="mt-3 inline-block text-xs underline underline-offset-2">개인정보 처리 안내</a>
      </footer>
    </div>
  );
}
