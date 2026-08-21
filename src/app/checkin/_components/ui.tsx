"use client";

import { WINDOW_MSG } from "./constants";

export function Stepper({
  label,
  value,
  setValue,
  min = 1,
}: {
  label: string;
  value: number;
  setValue: (f: (v: number) => number) => void;
  min?: number;
}) {
  return (
    <div>
      <p className="text-sm text-neutral-500 mb-2 text-center">{label}</p>
      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => setValue((p) => Math.max(min, p - 1))}
          className="w-12 h-12 rounded-full border border-wedding-gold/30 text-xl text-sage-700"
          aria-label="줄이기"
        >
          −
        </button>
        <span className="text-3xl font-bold text-sage-700 w-14 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => setValue((p) => Math.min(20, p + 1))}
          className="w-12 h-12 rounded-full border border-wedding-gold/30 text-xl text-sage-700"
          aria-label="늘리기"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function BigButton({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 text-base font-medium tracking-wide rounded-md transition-colors disabled:opacity-60 ${
        variant === "solid"
          ? "bg-sage-700 text-white"
          : "bg-white text-sage-700 border border-sage-600"
      }`}
    >
      {children}
    </button>
  );
}

export function WindowNotice({ state }: { state: string }) {
  return (
    <p className="text-base text-sage-700 leading-relaxed whitespace-pre-line py-4">
      {WINDOW_MSG[state] ?? WINDOW_MSG.checkin_not_enabled}
    </p>
  );
}
