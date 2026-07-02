import Hero from "@/components/sections/Hero";
import Greeting from "@/components/sections/Greeting";
import Gallery from "@/components/sections/Gallery";
import Dday from "@/components/sections/Dday";
import Location from "@/components/sections/Location";
import Guestbook from "@/components/sections/Guestbook";
import Account from "@/components/sections/Account";
import Rsvp from "@/components/sections/Rsvp";
import LockedGate from "@/components/LockedGate";
import { INVITATION_KEY } from "@/lib/wedding";

/**
 * 모바일 청첩장 — 7개 블록
 * Hero → Greeting → Gallery → D-Day → Location
 * → 💝 축하해준 사람들 → 마음 전하기 → 참석 의사 전하기
 *
 * 접근 제어: ?key=xxxx (INVITATION_KEY 설정 시)
 * QR 진입: ?via=qr → 본인 확인·뱃지 UI 노출
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; via?: string }>;
}) {
  const { key, via } = await searchParams;

  if (INVITATION_KEY && key !== INVITATION_KEY) {
    return <LockedGate />;
  }

  const qrEntry = via === "qr";

  return (
    <main className="w-full min-h-screen bg-white text-neutral-800 antialiased">
      <Hero />
      <Greeting />
      <Gallery />
      <Dday />
      <Location />
      <Guestbook qrEntry={qrEntry} />
      <Account />
      <Rsvp />
    </main>
  );
}
