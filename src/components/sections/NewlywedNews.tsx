import { newlywedNews } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

/**
 * 신혼 근황 (LC-5)
 * wedding.ts 의 newlywedNews 가 비어 있으면 렌더하지 않음 (opt-in).
 * 예식 후 같은 URL 로 방문한 하객에게 근황 소식을 피드로 보여줍니다.
 */
export default function NewlywedNews() {
  if (newlywedNews.length === 0) return null;

  return (
    <section className="px-6 py-12 bg-wedding-cream border-t border-wedding-gold/10">
      <div className="max-w-sm mx-auto space-y-8">
        <FadeIn className="space-y-2 text-center">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            NEWS
          </p>
          <h2 className="font-serif text-2xl font-light tracking-widest text-sage-700">
            신혼 근황
          </h2>
          <p className="text-xs text-neutral-400 pt-1">
            잊지 않고 찾아주셔서 감사해요 💌
          </p>
        </FadeIn>

        <div className="space-y-5">
          {newlywedNews.map((n, i) => (
            <FadeIn
              key={`${n.when}-${i}`}
              className="bg-white border border-wedding-gold/15 overflow-hidden rounded-sm"
            >
              {n.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={n.image}
                  alt={n.title}
                  loading="lazy"
                  className="w-full aspect-[4/3] object-cover"
                />
              )}
              <div className="p-4 space-y-1.5 text-left">
                <p className="text-[11px] tracking-wide text-wedding-gold">
                  {n.when}
                </p>
                <p className="font-serif text-base text-sage-700">{n.title}</p>
                <p className="text-sm font-light leading-relaxed text-neutral-500 whitespace-pre-line">
                  {n.body}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
