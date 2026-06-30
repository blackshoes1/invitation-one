"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const ITEMS = [
  {
    q: "꼭 신청해야 하나요?",
    a: "아니에요, 안 받으셔도 결혼식엔 꼭 와주세요 😊 부담 없이 편하게 골라주세요.",
  },
  {
    q: "배달비가 정말 없나요?",
    a: "네! 신랑신부가 직접 찾아가는 거라 배달비는 0원이에요 🛵",
  },
  {
    q: "못 만나면 어떡하죠?",
    a: "‘마음 배송’으로 메시지를 남겨주시면, 그 자리에서 바로 모바일 청첩장을 보실 수 있어요 💌",
  },
  {
    q: "날짜를 바꾸고 싶어요",
    a: "주문 완료 화면의 ‘신청 취소/날짜 변경하기’에서 언제든 변경·취소하실 수 있어요.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="max-w-md mx-auto px-6 py-8 space-y-2">
      <p className="text-center text-sm font-bold text-neutral-500 mb-2">
        자주 묻는 질문
      </p>
      {ITEMS.map((it, i) => (
        <div key={i} className="bg-white rounded-2xl border border-delivery/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left text-sm font-bold text-neutral-700"
          >
            {it.q}
            <ChevronDown
              size={16}
              className={`text-delivery transition-transform ${open === i ? "rotate-180" : ""}`}
            />
          </button>
          {open === i && (
            <p className="px-4 pb-4 text-sm text-neutral-500 leading-relaxed">{it.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}
