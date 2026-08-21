"use client";

import { groom, bride } from "@/lib/wedding";
import type { Rider } from "./types";
import Q from "./Q";

export default function StepMessage({
  rider,
  message,
  onMessageChange,
}: {
  rider: Rider | null;
  message: string;
  onMessageChange: (v: string) => void;
}) {
  return (
    <Q
      title={`배송기사(${
        rider === "신랑+신부"
          ? "신랑·신부"
          : rider === "신부"
          ? bride.name
          : groom.name
      })에게 요청사항이 있으신가요? 💬`}
      sub="예: 저녁 7시 이후에 와주세요 (선택)"
    >
      <textarea
        autoFocus
        value={message}
        maxLength={500}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="요청사항을 적어주세요"
        className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-28 text-base"
      />
    </Q>
  );
}
