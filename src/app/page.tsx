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
import { cookies } from "next/headers";
import { GUEST_GUIDE_START, INVITATION_KEY } from "@/lib/wedding";
import { INVITATION_COOKIE } from "@/lib/inviteAccess";
import RememberInvitationKey from "@/components/RememberInvitationKey";
import { issueUploadToken } from "@/lib/signedToken";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GuestGuide from "@/components/GuestGuide";

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
 * 모바일 청첩장: 10월 15일(한국시간)부터 하객 안내 → 사진 보기(?view=photos)
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
  searchParams: Promise<{ key?: string; via?: string; view?: string }>;
}) {
  const { key, via, view } = await searchParams;

  if (!INVITATION_KEY) {
    // 배포 시 NEXT_PUBLIC_INVITATION_KEY 설정을 깜빡하면 바로 눈치채도록 로그
    console.warn(
      "[invitation] NEXT_PUBLIC_INVITATION_KEY 가 설정되지 않았습니다 — 청첩장이 전면 잠금 상태입니다."
    );
  }
  // 유효한 키로 한 번 들어온 기기는 쿠키로 기억 — 링크를 다시 찾지 않아도 열린다
  const remembered =
    (await cookies()).get(INVITATION_COOKIE)?.value === INVITATION_KEY;
  if (!INVITATION_KEY || (key !== INVITATION_KEY && !remembered)) {
    return <LockedGate />;
  }

  const query = { ...(key ? { key } : {}), ...(via ? { via } : {}) };
  // 미리보기 배포에서는 즉시 공개하고, 운영은 요청 시각을 기준으로 공개한다.
  // eslint-disable-next-line react-hooks/purity
  const guideActive = process.env.VERCEL_ENV === "preview" || Date.now() >= GUEST_GUIDE_START.getTime();
  if (guideActive && view !== "photos") {
    return (
      <main className="invitation-content min-h-screen bg-wedding-cream text-sage-800 font-sans antialiased">
        <RememberInvitationKey />
        <TextSizeToggle />
        {view === "guest-snap" ? (
          <>
            <div className="mx-auto max-w-[440px] px-6 pt-12 pb-4">
              <Link href={{ pathname: "/", query }} className="inline-flex min-h-11 items-center gap-2 text-sm text-sage-700">
                <ArrowLeft size={16} aria-hidden="true" /> 하객 안내로
              </Link>
            </div>
            <GuestSnap uploadToken={issueUploadToken()} />
          </>
        ) : (
          <GuestGuide view={view} query={query} />
        )}
      </main>
    );
  }

  const qrEntry = via === "qr";
  const heroUrl = await fetchHeroImage();

  return (
    <main className="invitation-content w-full min-h-screen bg-white text-neutral-800 antialiased">
      <RememberInvitationKey />
      <TextSizeToggle />
      <BgmToggle />
      <PostWeddingBanner />
      {guideActive && (
        <div className="bg-wedding-cream px-6 pt-12 pb-4">
          <Link href={{ pathname: "/", query }} className="mx-auto flex min-h-11 max-w-sm items-center gap-2 text-sm text-sage-700">
            <ArrowLeft size={16} aria-hidden="true" /> 하객 안내로 돌아가기
          </Link>
        </div>
      )}
      <Hero heroUrl={heroUrl} />
      <Greeting />
      <LoveStory />
      <Gallery />
      <Album />
      <Location />
      {/* RSVP 복구 시: <Rsvp submitToken={rsvpSubmitToken()} /> */}
      <NewlywedNews />
      <Guestbook qrEntry={qrEntry} />
      <GuestSnap uploadToken={issueUploadToken()} />
      <Account />
      <footer className="bg-wedding-cream px-6 pt-2 pb-16 text-center">
        <ShareButton />
      </footer>
    </main>
  );
}
