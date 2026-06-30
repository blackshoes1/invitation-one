"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase, isSupabaseConfigured, type Group } from "@/lib/supabase";
import { groom, bride, DELIVERY_CAPACITY } from "@/lib/wedding";
import MenuSelect, { type DeliveryMode } from "@/components/delivery/MenuSelect";
import DeliveryForm from "@/components/delivery/DeliveryForm";
import HeartForm from "@/components/delivery/HeartForm";
import GroupMembers from "@/components/delivery/GroupMembers";
import DeliveryClosed from "@/components/delivery/DeliveryClosed";
import Faq from "@/components/delivery/Faq";

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const slug = params.groupId;

  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [taken, setTaken] = useState(0);
  const [mode, setMode] = useState<DeliveryMode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data } = await supabase.rpc("get_booked_dates");
    if (Array.isArray(data)) setTaken(data.length);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isSupabaseConfigured || !supabase) {
        // 데모 모드: 그룹명만 임시 표시
        if (alive) setGroup({ id: "demo", name: "데모 그룹", slug });
        return;
      }
      const { data } = await supabase.rpc("get_group", { p_slug: slug });
      if (alive) setGroup(Array.isArray(data) && data[0] ? (data[0] as Group) : null);
    })();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
    return () => {
      alive = false;
    };
  }, [slug]);

  const remaining = Math.max(0, DELIVERY_CAPACITY - taken);
  const closed = remaining <= 0;

  if (group === undefined) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-neutral-400 text-sm">
        불러오는 중…
      </div>
    );
  }

  if (group === null) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center text-center px-8 gap-3">
        <div className="text-5xl">🔍</div>
        <p className="font-bold text-neutral-700">그룹을 찾을 수 없어요</p>
        <p className="text-xs text-neutral-400">링크를 다시 확인해 주세요.</p>
        <Link
          href="/delivery"
          className="mt-3 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold"
        >
          배달 메인으로
        </Link>
      </div>
    );
  }

  return (
    <div>
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center justify-between shadow-sm">
        <span className="font-serif font-bold tracking-tight">
          🛵 {groom.name}·{bride.name} 스토어
        </span>
        <Link href="/" className="text-xs bg-white/20 px-3 py-1.5 rounded-full font-medium">
          💌 청첩장
        </Link>
      </header>

      <section className="px-6 pt-7 pb-5 text-center">
        <span className="inline-block text-[11px] bg-delivery-yellow/30 text-delivery-dark font-bold px-3 py-1 rounded-full">
          ⭐ 신규 오픈 · 무료배송
        </span>
        <h1 className="mt-3 text-2xl font-extrabold text-neutral-800">
          {group.name}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          📦 남은 자리:{" "}
          <span className="text-delivery font-bold">{remaining}개</span>
        </p>
      </section>

      <div className="px-6 pb-6 max-w-md mx-auto">
        <GroupMembers slug={slug} refreshKey={refreshKey} />
      </div>

      {closed ? (
        <DeliveryClosed />
      ) : (
        <section className="pb-6">
          {mode === null && (
            <div className="px-6 pb-4 text-center">
              <button
                onClick={() => setMode("delivery")}
                className="w-full max-w-xs py-4 rounded-full bg-delivery text-white font-extrabold shadow-md active:scale-95 transition-transform"
              >
                나도 신청하기 🛵
              </button>
              <div className="mt-5">
                <MenuSelect onPick={setMode} />
              </div>
            </div>
          )}
          {mode !== null && (
            <div className="max-w-md mx-auto px-5">
              <button onClick={() => setMode(null)} className="text-xs text-neutral-400 mb-1">
                ← 메뉴로 돌아가기
              </button>
            </div>
          )}
          {mode === "delivery" && (
            <DeliveryForm
              group={{ id: group.id, name: group.name }}
              onSubmitted={() => setRefreshKey((k) => k + 1)}
            />
          )}
          {mode === "heart" && (
            <HeartForm group={{ id: group.id, name: group.name }} />
          )}
        </section>
      )}

      <Faq />

      <footer className="text-center text-[11px] text-neutral-400 pb-8">
        청첩장배달 🛵 · {groom.name} ♥ {bride.name}
      </footer>
    </div>
  );
}
