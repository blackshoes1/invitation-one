import Hero from "@/components/sections/Hero";
import Greeting from "@/components/sections/Greeting";
import Gallery from "@/components/sections/Gallery";
import Dday from "@/components/sections/Dday";
import Location from "@/components/sections/Location";
import Guestbook from "@/components/sections/Guestbook";
import Account from "@/components/sections/Account";
import LockedGate from "@/components/LockedGate";
import { INVITATION_KEY } from "@/lib/wedding";

/**
 * 모바일 청첩장 — 6개 블록
 * Hero → Greeting → Gallery → D-Day → Location
 * → 💝 축하해준 사람들 → 마음 전하기
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
      <Hero />
      <Greeting />
      <Gallery />
      <Dday />
      <Location />
      <Guestbook qrEntry={qrEntry} />
      <Account />
    </main>
  );
}
