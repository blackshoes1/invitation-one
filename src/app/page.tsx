import Hero from "@/components/sections/Hero";
import Greeting from "@/components/sections/Greeting";
import Gallery from "@/components/sections/Gallery";
import Dday from "@/components/sections/Dday";
import Location from "@/components/sections/Location";
import Account from "@/components/sections/Account";
import Guestbook from "@/components/sections/Guestbook";
import Rsvp from "@/components/sections/Rsvp";
import LockedGate from "@/components/LockedGate";
import { INVITATION_KEY } from "@/lib/wedding";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const sp = await searchParams;
  // 접근 키가 설정돼 있고 키가 맞지 않으면 잠금 화면
  if (INVITATION_KEY && sp?.key !== INVITATION_KEY) {
    return <LockedGate />;
  }

  return (
    <main className="relative mx-auto max-w-[480px] min-h-screen bg-white text-neutral-800 antialiased shadow-sm">
      <Hero />
      <Greeting />
      <Gallery />
      <Dday />
      <Location />
      <Account />
      <Guestbook />
      <Rsvp />
    </main>
  );
}
