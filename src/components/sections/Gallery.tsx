"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heart, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { galleryImages, GALLERY_MAX } from "@/lib/wedding";
import { getSiteSettings } from "@/lib/settings";
import { useReducedMotion } from "@/lib/useReducedMotion";
import FadeIn from "@/components/FadeIn";

/** 슬라이드가 화면 폭(최대 max-w-sm = 384px)만큼만 필요하다는 힌트 */
const SIZES = "(max-width: 420px) 100vw, 384px";

export default function Gallery() {
  const [index, setIndex] = useState(0);
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  // Admin 에서 업로드한 갤러리 (없으면 정적 파일 폴백)
  const [images, setImages] = useState(galleryImages);
  const count = images.length;
  // 터치 스와이프 감지
  const touchX = useRef<number | null>(null);
  // 자동 넘김 정지 — 사용자가 직접 껐거나, OS 가 "동작 줄이기" 를 요청한 경우
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const autoPlaying = !paused && !reducedMotion && count > 1;

  useEffect(() => {
    getSiteSettings().then((s) => {
      if (s.gallery && s.gallery.length > 0) {
        setImages(
          s.gallery
            .slice(0, GALLERY_MAX)
            .map((g, i) => ({ src: g.src, alt: g.alt ?? `커플 사진 ${i + 1}` }))
        );
        setIndex(0);
        setErrored({});
      }
    });
  }, []);

  const go = (dir: number) =>
    setIndex((i) => (i + dir + count) % count);

  // 자동 슬라이드 — setTimeout + index 의존: 수동 스와이프/화살표/도트로 넘기면
  // 타이머가 리셋되어, 넘긴 직후 자동으로 또 넘어가는 문제를 방지
  useEffect(() => {
    if (!autoPlaying) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), 4500);
    return () => clearTimeout(t);
  }, [index, count, autoPlaying]);

  const current = images[index] ?? images[0];

  // 겹쳐 두고 교차 페이드 하려면 이전·다음 장이 미리 붙어 있어야 한다.
  // 10장을 전부 붙이면 한꺼번에 받아버리므로 앞뒤 한 장씩만 — 다음 장을
  // 미리 받아두는 프리로드 역할까지 겸한다.
  const mounted = new Set(
    count > 1 ? [(index - 1 + count) % count, index, (index + 1) % count] : [0]
  );

  return (
    <section className="px-6 pt-5 pb-10 bg-white">
      <div className="max-w-sm mx-auto space-y-8 text-center">
        <FadeIn className="space-y-2">
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            우리의 순간
          </h2>
        </FadeIn>

        <FadeIn>
          <div
            className="relative w-full aspect-[4/5] overflow-hidden bg-sage-50 border border-wedding-gold/15 touch-pan-y select-none"
            // 스크린리더에 "사진 슬라이드" 임을 알리고, 넘어간 사진을 읽어 주게 한다.
            role="group"
            aria-roledescription="사진 슬라이드"
            aria-label={`우리의 순간 사진 ${count}장`}
            onTouchStart={(e) => {
              touchX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touchX.current === null || count <= 1) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}
          >
            {images.map((img, i) =>
              !mounted.has(i) ? null : errored[i] ? (
                <div
                  key={i}
                  data-active={i === index}
                  className="crossfade absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-wedding-cream to-sage-100"
                >
                  <Heart size={26} className="text-wedding-gold" strokeWidth={1.2} />
                  <p className="text-[11px] text-neutral-400 tracking-wide">
                    사진 준비 중
                  </p>
                </div>
              ) : (
                <Image
                  key={i}
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes={SIZES}
                  quality={70}
                  // 갤러리는 첫 화면 아래에 있다 — 히어로(LCP)가 대역폭을 먼저
                  // 쓰도록 전부 지연 로드하고, 붙여 둔 앞뒤 한 장이 프리로드 역할을 한다
                  loading="lazy"
                  data-active={i === index}
                  className="crossfade object-cover"
                  // 관리자가 사진을 지웠거나 파일이 아직 없을 수 있다
                  onError={() => setErrored((e) => ({ ...e, [i]: true }))}
                />
              )
            )}

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
                {/* 자동으로 넘어가는 움직임은 멈출 수단이 있어야 한다 (WCAG 2.2.2).
                    "동작 줄이기" 를 켜 둔 기기에서는 애초에 자동 넘김을 하지 않는다. */}
                {!reducedMotion && (
                  <button
                    type="button"
                    aria-label={
                      paused ? "사진 자동 넘김 다시 시작" : "사진 자동 넘김 멈추기"
                    }
                    aria-pressed={paused}
                    onClick={() => setPaused((p) => !p)}
                    className="absolute right-2 bottom-2 w-8 h-8 flex items-center justify-center bg-white/70 backdrop-blur-sm text-sage-700 rounded-full"
                  >
                    {paused ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                )}
              </>
            )}
          </div>
        </FadeIn>

        {/* 어떤 사진이 보이는지 스크린리더에 전달. 자동 넘김 중에는 계속 읽어
            방해가 되므로, 사용자가 직접 넘겼을 때(= 자동 재생이 꺼진 상태)만 알린다. */}
        <p className="sr-only" aria-live={autoPlaying ? "off" : "polite"}>
          {count > 1 ? `${count}장 중 ${index + 1}번째 사진: ${current?.alt ?? ""}` : ""}
        </p>

        {count > 1 && (
          // 도트는 보기엔 6px 이지만 누르는 영역은 24px 이상이어야 한다 (WCAG 2.5.8).
          // 버튼에 세로 패딩을 주고 막대는 안쪽 span 으로 그려 모양은 그대로 둔다.
          <div className="flex justify-center -my-2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}번째 사진 보기`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className="px-1 py-2.5 flex items-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    i === index ? "w-5 bg-wedding-gold" : "w-1.5 bg-sage-200"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
