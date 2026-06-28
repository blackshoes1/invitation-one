"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TabBar, { type TabKey } from "@/components/TabBar";
import SnapView from "@/components/SnapView";
import Hero from "@/components/sections/Hero";
import Greeting from "@/components/sections/Greeting";
import Dday from "@/components/sections/Dday";
import Gallery from "@/components/sections/Gallery";
import ReceiveTab from "@/components/sections/ReceiveTab";
import Location from "@/components/sections/Location";
import Account from "@/components/sections/Account";
import Rsvp from "@/components/sections/Rsvp";

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0.4 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0.4 }),
};

function TabContent({ tab }: { tab: TabKey }) {
  switch (tab) {
    case "invite":
      return (
        <SnapView>
          <Hero />
          <Greeting />
          <Dday />
        </SnapView>
      );
    case "gallery":
      return (
        <SnapView>
          <Gallery />
        </SnapView>
      );
    case "receive":
      return <ReceiveTab />;
    case "info":
      return (
        <SnapView>
          <Location />
          <Account />
          <Rsvp />
        </SnapView>
      );
  }
}

export default function AppShell() {
  const [{ tab, dir }, setState] = useState<{ tab: TabKey; dir: number }>({
    tab: "invite",
    dir: 0,
  });
  const indexOf: Record<TabKey, number> = {
    invite: 0,
    gallery: 1,
    receive: 2,
    info: 3,
  };

  const change = (next: TabKey, index: number) => {
    if (next === tab) return;
    setState({ tab: next, dir: index > indexOf[tab] ? 1 : -1 });
  };

  return (
    <div className="relative mx-auto w-full max-w-[480px] h-[100dvh] overflow-hidden bg-white shadow-sm">
      {/* 탭 패널 (탭바 높이만큼 하단 여백) */}
      <div className="absolute inset-0 bottom-[64px] overflow-hidden">
        <AnimatePresence custom={dir} initial={false} mode="popLayout">
          <motion.div
            key={tab}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "tween", duration: 0.32, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <TabContent tab={tab} />
          </motion.div>
        </AnimatePresence>
      </div>

      <TabBar active={tab} onChange={change} />
    </div>
  );
}
