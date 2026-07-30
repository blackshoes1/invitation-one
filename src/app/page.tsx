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
 * Admin 업로드 메인 사진을 서버에서 미리 조회 (5분 캐시).
 * Hero 가 정적 폴백을 먼저 그렸다가 교체하면서 사진을 두 번 받던 것을 방지.
 * 실패 시 null → Hero 가 기존 클라이언트 조회로 폴백.
 */
async function fetchHeroImage(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/site_settings?key=eq.hero_image&select=value`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 300 }, // admin 교체 후 최대 5분 내 반영
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { value?: unknown }[];
    const v = rows?.[0]?.value;
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

/**
 * 모바일 청첩장
 * Hero → Greeting → Gallery → Album(세이브 더 데이트) → Location
 * → 💝 축하해준 사람들 → 마음 전하기
 * (Album 은 admin 콘텐츠 탭에서 사진을 넣어야 표시.
 *  D-Day 섹션은 제거 — 컴포넌트 Dday.tsx 는 보존, 필요 시 한 줄로 복구.
 *  RSVP 섹션은 숨김 — 배달 신청과 이중 입력이라 제외. 좌석/개인 QR 체크인을
 *  쓰기로 하면 Rsvp.tsx·rsvpSubmitToken import 와 아래 주석 한 줄로 복구)
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
  const heroUrl = await fetchHeroImage();

  return (
    <main className="w-full min-h-screen bg-white text-neutral-800 antialiased">
      <TextSizeToggle />
      <BgmToggle />
      <PostWeddingBanner />
      <Hero heroUrl={heroUrl} />
      <Greeting />
      <LoveStory />
      <Gallery />
      <Album />
      <Location />
      {/* RSVP 복구 시: <Rsvp submitToken={rsvpSubmitToken()} /> */}
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
