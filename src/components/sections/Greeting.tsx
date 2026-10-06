import { groom, bride, type Person } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

function ParentLine({ label, person }: { label: string; person: Person }) {
  const parents = [person.father, person.mother].filter(Boolean).join(" · ");
  return (
    <div className="flex justify-center items-center gap-2">
      <span className="text-xs text-neutral-500">{label}</span>
      {parents && (
        <>
          <span className="font-normal text-neutral-600">{parents}</span>
          <span className="text-xs text-neutral-500">의 {person.relation}</span>
        </>
      )}
      <span className="font-medium text-sage-700 ml-1">{person.name}</span>
    </div>
  );
}

export default function Greeting() {
  return (
    <section className="px-6 pt-24 pb-12 text-center max-w-sm mx-auto space-y-12">
      <FadeIn className="space-y-6 text-neutral-600 leading-loose tracking-wide text-sm font-light">
        <p>
          각자 재미있게 잘 살던 저희 두 사람이 만나
          <br />
          이제 매일을 복작복작 함께 지내보려 합니다.
        </p>
        <p>
          햇살 좋은 날, 저희의 새로운 출발을
          <br />
          가까이서 축하해 주시면 참 좋겠습니다.
        </p>
        <p>
          부담 없이 걸음 하셔서
          <br />
          그저 즐거운 하루를 함께 채워주세요.
        </p>
      </FadeIn>

      <FadeIn>
        <div className="w-12 border-t border-wedding-gold/40 mx-auto" />
      </FadeIn>

      <FadeIn className="space-y-3 text-sm font-light tracking-wide">
        <ParentLine label="" person={groom} />
        <ParentLine label="" person={bride} />
      </FadeIn>
    </section>
  );
}
