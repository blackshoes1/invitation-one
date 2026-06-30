"use client";

import { STAMPS } from "@/lib/wedding";

export default function StampPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="flex justify-center gap-2">
      {STAMPS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-pressed={value === s}
          className={`w-12 h-12 rounded-2xl text-2xl flex items-center justify-center border-2 transition-all ${
            value === s
              ? "border-delivery bg-delivery/10 scale-110"
              : "border-transparent bg-white"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
