"use client";

import { groom, bride, daysUntil, formatShortDate } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

export default function Dday() {
  const d = daysUntil();

  const message =
    d > 0
      ? `${groom.name}, ${bride.name}의 결혼식이 ${d}일 남았습니다.`
      : d === 0
      ? `오늘은 ${groom.name}, ${bride.name}의 결혼식입니다.`
      : `${groom.name}, ${bride.name}의 결혼식이 있었습니다.`;

  return (
    <section className="snap-start min-h-full flex flex-col justify-center px-6 py-20 bg-wedding-cream text-center">
      <FadeIn className="max-w-sm mx-auto space-y-5">
        <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
          {formatShortDate()}
        </p>
        <div className="flex items-end justify-center gap-2">
          <span className="font-serif text-5xl font-light text-sage-700 leading-none">
            {d > 0 ? `D-${d}` : d === 0 ? "D-DAY" : `D+${Math.abs(d)}`}
          </span>
        </div>
        <p className="text-xs text-neutral-500 font-light tracking-wide">
          {message}
        </p>
      </FadeIn>
    </section>
  );
}
