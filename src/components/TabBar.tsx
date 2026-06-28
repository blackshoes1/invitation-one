"use client";

export const TABS = [
  { key: "invite", label: "초대장", emoji: "💌" },
  { key: "gallery", label: "갤러리", emoji: "📸" },
  { key: "receive", label: "받기", emoji: "🛵" },
  { key: "info", label: "정보", emoji: "📍" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export default function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey, index: number) => void;
}) {
  return (
    <nav className="absolute bottom-0 inset-x-0 h-[64px] bg-white/95 backdrop-blur border-t border-wedding-gold/15 flex z-30">
      {TABS.map((t, i) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key, i)}
            aria-current={on}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
          >
            <span
              className={`text-lg leading-none transition-transform ${
                on ? "scale-110" : "opacity-50 grayscale"
              }`}
            >
              {t.emoji}
            </span>
            <span
              className={`text-[10px] tracking-wider ${
                on ? "text-sage-700 font-medium" : "text-neutral-400"
              }`}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
