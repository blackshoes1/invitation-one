"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const ITEMS = [
  {
    q: "꼭 신청해야 하나요?",
    a: "아니에요, 부담 없이 편하게 골라주세요!",
  },
  {
    q: "배달비가 정말 없나요?",
    a: "네! 신랑신부가 직접 찾아가는 거라 배달비는 0원이에요 🛵",
  },
  {
    q: "‘직접 받기’와 ‘한마디 남기기’가 결혼식 참석 여부인가요?",
    a: "아니에요! 둘 다 결혼식 참석과는 상관없이, 종이 청첩장을 어떻게 받을지 고르는 거예요. 참석 여부는 한마디 남기실 때 (선택사항으로) 알려주시면 돼요 🙂",
  },
  {
    q: "못 만나면 어떡하죠?",
    a: "‘축하 한마디만 남기기(마음 배송)’로 축하만 남겨주시면 돼요. 종이 청첩장 대신 그 자리에서 바로 모바일 청첩장을 보실 수 있어요 💌",
  },
  {
    q: "남긴 이름과 한마디는 누가 보나요?",
    a: "기본은 ‘익명의 하객’으로 청첩장 방명록에 표시돼요. 원하시면 실명 공개로 바꾸거나, 신랑신부에게만 보이게 할 수도 있어요. 이름·연락처 원본은 신랑신부만 봅니다 🔒",
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
