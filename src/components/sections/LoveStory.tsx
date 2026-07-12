import { loveStory } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

/**
 * 러브스토리 타임라인 (LC-4)
 * wedding.ts 의 loveStory 가 비어 있으면 아무것도 렌더하지 않음 (opt-in).
 * 세로선 + 좌우 교차 카드로 두 사람의 이야기를 순서대로 보여줍니다.
 */
export default function LoveStory() {
  if (loveStory.length === 0) return null;

  return (
    <section className="px-6 py-12 bg-white border-t border-wedding-gold/10">
      <div className="max-w-sm mx-auto space-y-8">
        <FadeIn className="space-y-2 text-center">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            OUR STORY
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            두 사람의 이야기
          </h2>
        </FadeIn>

        <div className="relative">
          {/* 세로 타임라인 축 */}
          <div className="absolute left-[9px] top-1 bottom-1 w-px bg-wedding-gold/25" />
          <div className="space-y-6">
            {loveStory.map((m, i) => (
              <FadeIn key={`${m.when}-${i}`} className="relative pl-9">
                {/* 노드 */}
                <span className="absolute left-0 top-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full bg-wedding-cream border border-wedding-gold/40 text-[10px]">
                  {m.emoji ?? "💕"}
                </span>
                <p className="text-[11px] tracking-wide text-wedding-gold">
                  {m.when}
                </p>
                <p className="mt-0.5 font-serif text-base text-sage-700">
                  {m.title}
                </p>
                {m.desc && (
                  <p className="mt-1 text-sm font-light leading-relaxed text-neutral-500">
                    {m.desc}
                  </p>
                )}
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
