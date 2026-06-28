import Hero from "@/components/sections/Hero";
import Dday from "@/components/sections/Dday";
import Greeting from "@/components/sections/Greeting";
import Location from "@/components/sections/Location";
import Account from "@/components/sections/Account";
import Rsvp from "@/components/sections/Rsvp";

export default function Home() {
  return (
    <main className="w-full min-h-screen bg-white font-sans text-neutral-800 antialiased">
      <Hero />
      <Dday />
      <Greeting />
      <Location />
      <Account />
      <Rsvp />
    </main>
  );
}
