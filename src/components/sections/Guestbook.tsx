"use client";

import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured, type Message } from "@/lib/supabase";
import FadeIn from "@/components/FadeIn";

export default function Guestbook() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase!
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (alive) {
        setMessages(Array.isArray(data) ? (data as Message[]) : []);
        setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="px-6 py-24 bg-wedding-cream border-t border-wedding-gold/10">
      <div className="max-w-sm mx-auto space-y-8 text-center">
        <FadeIn className="space-y-2">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            GUESTBOOK
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            방명록
          </h2>
        </FadeIn>

        {loaded && messages.length === 0 ? (
          <FadeIn>
            <p className="text-sm text-neutral-400 py-6">
              가장 먼저 축하 마음을 남겨주세요 💐
            </p>
          </FadeIn>
        ) : (
          <FadeIn className="space-y-3 text-left">
            {messages.map((m) => (
              <div
                key={m.id}
                className="bg-white border border-wedding-gold/10 p-4 flex gap-3"
              >
                <span className="text-2xl shrink-0">{m.stamp ?? "💌"}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sage-700">{m.name}</p>
                  {m.message && (
                    <p className="text-xs text-neutral-500 leading-relaxed mt-0.5 break-words">
                      {m.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </FadeIn>
        )}
      </div>
    </section>
  );
}
