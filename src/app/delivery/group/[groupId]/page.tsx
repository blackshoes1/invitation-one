"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  supabase,
  isSupabaseConfigured,
  type Group,
  type GroupOrder,
} from "@/lib/supabase";
import { groom, bride, DELIVERY_CAPACITY } from "@/lib/wedding";
import MenuSelect, { type DeliveryMode } from "@/components/delivery/MenuSelect";
import DeliveryForm from "@/components/delivery/DeliveryForm";
import JoinForm from "@/components/delivery/JoinForm";
import OrderList from "@/components/delivery/OrderList";
import HeartForm from "@/components/delivery/HeartForm";
import ReviewStrip from "@/components/delivery/ReviewStrip";
import DeliveryClosed from "@/components/delivery/DeliveryClosed";
import Faq from "@/components/delivery/Faq";

type View =
  | { kind: "menu" }
  | { kind: "join"; order: GroupOrder }
  | { kind: "new" }
  | { kind: "heart" };

function GroupPageInner() {
  const params = useParams<{ groupId: string }>();
  const search = useSearchParams();
  const slug = params.groupId;
  /** 마음배송 → 직접배달 전환으로 들어온 참여자 id (?convert=) */
  const convertId = search.get("convert");

  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [orders, setOrders] = useState<GroupOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [taken, setTaken] = useState(0);
  const [view, setView] = useState<View>({ kind: "menu" });

  const loadOrders = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setOrdersLoaded(true);
      return;
    }
    const [ordersRes, bookedRes] = await Promise.all([
      supabase.rpc("get_group_orders", { p_slug: slug }),
      supabase.rpc("get_booked_dates"),
    ]);
    if (Array.isArray(ordersRes.data)) setOrders(ordersRes.data as GroupOrder[]);
    if (Array.isArray(bookedRes.data)) setTaken(bookedRes.data.length);
    setOrdersLoaded(true);
  }, [slug]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (alive) setGroup({ id: "demo", name: "데모 그룹", slug });
        return;
      }
      const { data } = await supabase.rpc("get_group", { p_slug: slug });
      if (alive) setGroup(Array.isArray(data) && data[0] ? (data[0] as Group) : null);
    })();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
    return () => {
      alive = false;
    };
  }, [slug, loadOrders]);

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

      {view.kind === "menu" && (
        <div className="px-6 pb-6 max-w-md mx-auto">
          <OrderList
            orders={orders}
            loaded={ordersLoaded}
            onJoin={(order) => setView({ kind: "join", order })}
            onPropose={() => setView({ kind: "new" })}
          />
        </div>
      )}

      {closed && view.kind === "new" ? (
        <DeliveryClosed />
      ) : (
        <section className="pb-6">
          {view.kind === "menu" && (
            <>
              <ReviewStrip />
              <MenuSelect
                onPick={(mode: DeliveryMode) =>
                  setView(mode === "delivery" ? { kind: "new" } : { kind: "heart" })
                }
              />
            </>
          )}

          {view.kind !== "menu" && (
            <div className="max-w-md mx-auto px-5">
              <button
                onClick={() => setView({ kind: "menu" })}
                className="text-xs text-neutral-400 mb-1"
              >
                ← 주문 현황으로 돌아가기
              </button>
            </div>
          )}

          {view.kind === "join" && (
            <JoinForm
              order={view.order}
              groupSlug={slug}
              convertId={convertId}
              onBack={() => setView({ kind: "menu" })}
              onJoined={loadOrders}
            />
          )}
          {view.kind === "new" && (
            <DeliveryForm
              group={{ id: group.id, name: group.name }}
              convertId={convertId}
              onSubmitted={loadOrders}
            />
          )}
          {view.kind === "heart" && (
            <HeartForm
              group={{ id: group.id, name: group.name }}
              onSwitchToDelivery={() => setView({ kind: "new" })}
            />
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

export default function GroupPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[60vh] flex items-center justify-center text-neutral-400 text-sm">
          불러오는 중…
        </div>
      }
    >
      <GroupPageInner />
    </Suspense>
  );
}
