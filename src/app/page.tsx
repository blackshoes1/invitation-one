import Hero from "@/components/sections/Hero";
import Greeting from "@/components/sections/Greeting";
import LoveStory from "@/components/sections/LoveStory";
import Gallery from "@/components/sections/Gallery";
import Album from "@/components/sections/Album";
import Location from "@/components/sections/Location";
import NewlywedNews from "@/components/sections/NewlywedNews";
import Guestbook from "@/components/sections/Guestbook";
import GuestSnap from "@/components/sections/GuestSnap";
import Account from "@/components/sections/Account";
import ShareButton from "@/components/ShareButton";
import TextSizeToggle from "@/components/TextSizeToggle";
import BgmToggle from "@/components/BgmToggle";
import PostWeddingBanner from "@/components/PostWeddingBanner";
import LockedGate from "@/components/LockedGate";
import { INVITATION_KEY } from "@/lib/wedding";

/**
 * 모바일 청첩장
 * Hero → Greeting → Gallery → Album(세이브 더 데이트) → Location
 * → 💝 축하해준 사람들 → 마음 전하기
 * (Album 은 admin 콘텐츠 탭에서 사진을 넣어야 표시.
 *  D-Day 섹션은 제거 — 컴포넌트 Dday.tsx 는 보존, 필요 시 한 줄로 복구)
 *
 * 접근 제어: ?key=xxxx — QR을 찍어야 열리는 컨셉이 핵심이므로
 * 키가 일치할 때만 공개. 환경변수 미설정 시에도 잠금(fail-closed).
 * QR 진입: ?via=qr → 본인 확인·뱃지 UI 노출
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; via?: string }>;
}) {
  const { key, via } = await searchParams;

  if (!INVITATION_KEY) {
    // 배포 시 NEXT_PUBLIC_INVITATION_KEY 설정을 깜빡하면 바로 눈치채도록 로그
    console.warn(
      "[invitation] NEXT_PUBLIC_INVITATION_KEY 가 설정되지 않았습니다 — 청첩장이 전면 잠금 상태입니다."
    );
  }
  if (!INVITATION_KEY || key !== INVITATION_KEY) {
    return <LockedGate />;
  }

  const qrEntry = via === "qr";

  return (
    <main className="w-full min-h-screen bg-white text-neutral-800 antialiased">
      <TextSizeToggle />
      <BgmToggle />
      <PostWeddingBanner />
      <Hero />
      <Greeting />
      <LoveStory />
      <Gallery />
      <Album />
      <Location />
      <NewlywedNews />
      <Guestbook qrEntry={qrEntry} />
      <GuestSnap />
      <Account />
      <footer className="bg-wedding-cream px-6 pt-2 pb-16 text-center">
        <ShareButton />
      </footer>
    </main>
  );
}
