"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { supabase, isSupabaseConfigured, type GuestPhoto } from "@/lib/supabase";
import { groom, bride, INVITATION_KEY, formatShortDate } from "@/lib/wedding";

/**
 * 예식장 라이브 월 (GS-8) — 스크린 전용 모드.
 * 하객이 올린 스냅을 큰 화면에 크로스페이드 슬라이드로 자동 순환.
 * 25초마다 새 사진을 폴링해 도착하면 자동 반영, QR 로 즉석 업로드 유도.
 * 사용: 예식장 대형 스크린/노트북을 이 페이지(/live)로 전체화면.
 */
const ADVANCE_MS = 6000; // 슬라이드 전환 주기
const POLL_MS = 25000; // 새 사진 폴링 주기

export default function LiveWallPage() {
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [idx, setIdx] = useState(0);
  const [qr, setQr] = useState("");
  const [justArrived, setJustArrived] = useState(false);
  const prevCount = useRef(0);

  // QR — 하객 스냅 업로드로 바로 이동
  useEffect(() => {
    const base = window.location.origin;
    const url = `${base}/?${INVITATION_KEY ? `key=${INVITATION_KEY}&` : ""}snap=1`;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#1c1c1c", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, []);

  // 사진 폴링 (신규 도착 감지 → 배지 플래시)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let alive = true;
    const fetchNow = async () => {
      const { data } = await supabase!.rpc("get_guest_photos");
      if (!alive || !Array.isArray(data)) return;
      const list = data as GuestPhoto[];
      if (list.length > prevCount.current && prevCount.current > 0) {
        setJustArrived(true);
        setTimeout(() => alive && setJustArrived(false), 5000);
      }
      prevCount.current = list.length;
      setPhotos(list);
    };
    fetchNow();
    const t = setInterval(fetchNow, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // 자동 전환
  useEffect(() => {
    if (photos.length <= 1) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % photos.length),
      ADVANCE_MS
    );
    return () => clearInterval(t);
  }, [photos.length]);

  const current = photos.length ? photos[idx % photos.length] : null;
  const dateLabel = useMemo(() => formatShortDate(), []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white cursor-none select-none">
      {/* 배경 슬라이드 (블러 확장 — 여백 채움) */}
      <AnimatePresence mode="popLayout">
        {current && (
          <motion.div
            key={`bg-${current.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${current.url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(40px) brightness(0.5)",
              transform: "scale(1.1)",
            }}
          />
        )}
      </AnimatePresence>

      {/* 메인 사진 (Ken Burns) */}
      <AnimatePresence mode="popLayout">
        {current ? (
          <motion.img
            key={current.id}
            src={current.url}
            alt={current.name ? `${current.name}님의 스냅` : "하객 스냅"}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1.12 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 1.1 },
              scale: { duration: ADVANCE_MS / 1000 + 1.2, ease: "linear" },
            }}
            className="absolute inset-0 m-auto max-h-[86vh] max-w-[90vw] object-contain drop-shadow-2xl"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white/50 text-2xl font-serif tracking-widest">
              첫 사진을 기다리고 있어요 📸
            </p>
          </div>
        )}
      </AnimatePresence>

      {/* 상단 좌 — 타이틀 */}
      <div className="absolute top-8 left-10 z-10">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-rose-400/70" />
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          <span className="font-serif tracking-[0.3em] text-sm text-white/80">
            LIVE · 하객 스냅
          </span>
        </div>
        <p className="mt-2 font-serif text-3xl tracking-widest">
          {groom.name} <span className="text-white/50">♥</span> {bride.name}
        </p>
        <p className="mt-1 text-sm text-white/50 tracking-widest">{dateLabel}</p>
      </div>

      {/* 상단 우 — 장수 + 신규 배지 */}
      <div className="absolute top-8 right-10 z-10 text-right">
        <p className="text-sm text-white/60">
          지금까지 <span className="font-bold text-white">{photos.length}</span>장
        </p>
        <AnimatePresence>
          {justArrived && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-1 text-xs bg-rose-500/90 px-2.5 py-1 rounded-full inline-block"
            >
              방금 새 사진 도착 ✨
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* 하단 좌 — 업로더 이름 */}
      <AnimatePresence mode="wait">
        {current?.name && (
          <motion.div
            key={`cap-${current.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute bottom-10 left-10 z-10"
          >
            <p className="text-lg text-white/90 font-medium drop-shadow">
              📸 {current.name}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 하단 우 — 업로드 QR */}
      <div className="absolute bottom-8 right-10 z-10 flex items-center gap-3 bg-white/95 text-neutral-800 rounded-2xl px-4 py-3 shadow-xl">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="스냅 업로드 QR" className="w-20 h-20" />
        ) : (
          <div className="w-20 h-20 bg-neutral-100 animate-pulse rounded" />
        )}
        <div className="text-left leading-tight">
          <p className="text-sm font-bold">사진을 올려주세요</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            QR 스캔 → 바로 업로드
            <br />
            이 화면에 함께 걸려요
          </p>
        </div>
      </div>
    </main>
  );
}
