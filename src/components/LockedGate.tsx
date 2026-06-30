import Link from "next/link";
import { groom, bride } from "@/lib/wedding";

/** 접근 키가 없을 때 보여주는 잠금 안내 */
export default function LockedGate() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-8 bg-wedding-cream gap-4">
      <div className="text-5xl">💌</div>
      <h1 className="font-serif text-xl text-sage-700 tracking-wide">
        아직 공개 전이에요 😊
      </h1>
      <p className="text-sm text-neutral-500 leading-relaxed">
        {groom.name} · {bride.name}의 청첩장은
        <br />
        만남 이후에 열어보실 수 있어요.
      </p>
      <Link
        href="/delivery"
        className="mt-2 px-6 py-3.5 rounded-full bg-delivery text-white font-extrabold"
      >
        🛵 청첩장 받으러 가기
      </Link>
    </main>
  );
}
