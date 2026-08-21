"use client";

import type { GroupOrder } from "@/lib/supabase";
import { formatYmdKo } from "@/lib/wedding";
import type { Mode } from "./types";

/* 갈아타기 */
export default function SwitchPanel({
  orders,
  busy,
  error,
  setMode,
  setError,
  doSwitch,
}: {
  orders: GroupOrder[];
  busy: boolean;
  error: string | null;
  setMode: (m: Mode) => void;
  setError: (e: string | null) => void;
  doSwitch: (targetId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-neutral-700">어느 주문으로 옮길까요? 🔄</p>
      {orders.map((o) => {
        const owner = o.member_names[0] ?? "";
        const extra = o.member_names.length - 1;
        return (
          <button
            key={o.id}
            onClick={() => doSwitch(o.id)}
            disabled={busy}
            className="w-full text-left bg-white rounded-2xl border-2 border-delivery/15 p-4 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            <p className="text-sm font-extrabold text-neutral-800">
              🛵 {formatYmdKo(o.date)} {o.time_slot}
              <span className="font-medium text-neutral-500">
                {" "}
                — {owner}
                {extra > 0 ? ` 외 ${extra}명` : ""}
              </span>
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              참여: {o.member_names.join(", ")}
            </p>
          </button>
        );
      })}
      {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
      <button
        onClick={() => {
          setMode("view");
          setError(null);
        }}
        className="w-full py-3 rounded-full bg-white border-2 border-delivery/20 text-neutral-500 text-sm font-bold"
      >
        이전
      </button>
    </div>
  );
}
