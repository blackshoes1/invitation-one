"use client";

import { useRef, useState, type ReactNode } from "react";
import { LayoutDashboard, Package, CalendarDays, Route, Users, Clock3, MessageSquare,
  Camera, MapPin, PanelsTopLeft, Menu, X, ArrowUpRight, Sparkles } from "lucide-react";
import type { View } from "@/app/admin/shared";

const sections: { label: string; items: { id: View; label: string; icon: typeof Package; description: string }[] }[] = [
  { label: "배송 관리", items: [
    { id: "dashboard", label: "요약", icon: LayoutDashboard, description: "신청과 배송 현황을 한눈에 확인하세요." },
    { id: "orders", label: "주문", icon: Package, description: "전해드릴 청첩장과 배송 일정을 관리하세요." },
    { id: "calendar", label: "캘린더", icon: CalendarDays, description: "날짜별 일정을 확인하고 계획하세요." },
    { id: "route", label: "배송경로", icon: Route, description: "오늘의 방문 순서와 이동 경로를 확인하세요." },
  ] },
  { label: "하객 관리", items: [
    { id: "groups", label: "그룹", icon: Users, description: "모임별 명단과 개인 초대를 한곳에서 관리하세요." },
    { id: "waiting", label: "대기자", icon: Clock3, description: "청첩장을 기다리는 분들을 확인하세요." },
    { id: "field", label: "현장운영", icon: MapPin, description: "예식 당일 체크인과 좌석을 관리하세요." },
  ] },
  { label: "청첩장 관리", items: [
    { id: "messages", label: "방명록", icon: MessageSquare, description: "하객들이 남겨주신 축하의 마음을 확인하세요." },
    { id: "snap", label: "하객스냅", icon: Camera, description: "함께 남긴 소중한 순간들을 관리하세요." },
    { id: "content", label: "콘텐츠", icon: PanelsTopLeft, description: "청첩장의 사진과 이야기를 업데이트하세요." },
  ] },
];

export default function AdminShell({ view, onNavigate, children }: {
  view: View; onNavigate: (view: View) => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const active = sections.flatMap((s) => s.items).find((item) => item.id === view)!;
  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-800 lg:pl-64">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:p-3">본문으로 이동</a>
      <aside className="bg-[#203a32] text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-5 lg:px-7 lg:py-9">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-white/10"><Sparkles size={20} aria-hidden="true" /></span>
            <div><p className="text-lg font-semibold tracking-tight">까치 어드민</p><p className="mt-0.5 text-[10px] tracking-[0.18em] text-[#b9ccc2]">WEDDING WORKSPACE</p></div>
          </div>
          <button ref={menuButton} type="button" aria-expanded={open} aria-controls="admin-navigation"
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"} onClick={() => setOpen(!open)}
            className="rounded-xl p-3 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white lg:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav id="admin-navigation" aria-label="관리자 메뉴" className={`${open ? "block" : "hidden"} px-4 pb-6 lg:block lg:px-5`}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); menuButton.current?.focus(); } }}>
          {sections.map((section) => <div key={section.label} className="mb-6">
            <p className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[#b9ccc2]">{section.label}</p>
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {section.items.map(({ id, label, icon: Icon }) => <button type="button" key={id}
                aria-current={view === id ? "page" : undefined}
                onClick={() => { onNavigate(id); setOpen(false); if (open) menuButton.current?.focus(); }}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-white ${view === id ? "bg-[#e3eddf] font-semibold text-[#203a32] shadow-sm" : "text-[#e0e8e3] hover:bg-white/10"}`}>
                <Icon size={18} strokeWidth={1.7} aria-hidden="true" />{label}
                {view === id && <span className="ml-auto size-1.5 rounded-full bg-[#42634a]" aria-hidden="true" />}
              </button>)}
            </div>
          </div>)}
          <div className="border-t border-white/15 pt-5">
            <p className="px-3 text-xs leading-6 text-[#b9ccc2]">소중한 만남을 준비하는 공간</p>
          </div>
        </nav>
      </aside>
      <main id="admin-content" className="mx-auto max-w-6xl px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <header className="mb-7 flex items-start justify-between gap-3 border-b border-neutral-200/80 pb-6">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Admin workspace</p>
            <h1 className="text-2xl font-semibold tracking-tight text-[#203a32] sm:text-3xl">{active.label}</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-500">{active.description}</p>
          </div>
          <a href="/" target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2.5 text-xs font-medium text-neutral-600 hover:border-neutral-400">
            사이트 <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </header>
        <div className="min-w-0 space-y-5">{children}</div>
      </main>
    </div>
  );
}
