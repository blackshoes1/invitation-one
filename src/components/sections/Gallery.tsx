"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { galleryImages } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

export default function Gallery() {
  const [index, setIndex] = useState(0);
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  const count = galleryImages.length;

  const go = (dir: number) =>
    setIndex((i) => (i + dir + count) % count);

  // 자동 슬라이드
  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 4500);
    return () => clearInterval(t);
  }, [count]);

  const current = galleryImages[index];

  return (
    <section className="px-6 py-20 bg-white">
      <div className="max-w-sm mx-auto space-y-8 text-center">
        <FadeIn className="space-y-2">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            GALLERY
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            우리의 순간
          </h2>
        </FadeIn>

        <FadeIn>
          <div className="relative w-full aspect-[4/5] overflow-hidden bg-sage-50 border border-wedding-gold/15">
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0"
              >
                {errored[index] ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-wedding-cream to-sage-100">
                    <Heart size={26} className="text-wedding-gold" strokeWidth={1.2} />
                    <p className="text-[11px] text-neutral-400 tracking-wide">
                      사진 준비 중
                    </p>
                  </div>
                ) : (
                  // 파일이 아직 없을 수 있어 next/image 대신 일반 img + onError 폴백
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.src}
                    alt={current.alt}
                    className="w-full h-full object-cover"
                    onError={() =>
                      setErrored((e) => ({ ...e, [index]: true }))
                    }
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {count > 1 && (
              <>
                <button
                  type="button"
                  aria-label="이전 사진"
                  onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/70 backdrop-blur-sm text-sage-700 rounded-full"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="다음 사진"
                  onClick={() => go(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/70 backdrop-blur-sm text-sage-700 rounded-full"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
        </FadeIn>

        {count > 1 && (
          <div className="flex justify-center gap-2">
            {galleryImages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}번째 사진 보기`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-wedding-gold" : "w-1.5 bg-sage-200"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
