import Link from "next/link";

export default function CheckinPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wedding-cream px-5 py-10 text-sage-800">
      <section className="w-full max-w-sm space-y-5 rounded-2xl border border-wedding-gold/20 bg-white px-6 py-8 text-center">
        <h1 className="font-serif text-2xl">예식 안내</h1>
        <p className="text-sm leading-7 text-neutral-600">예식 당일 별도의 온라인 체크인은 진행하지 않습니다.<br />예식 안내는 아래에서 확인해주세요.</p>
        <Link href="/" className="flex min-h-12 items-center justify-center rounded-xl bg-sage-700 px-4 py-3 text-sm text-white">예식 안내 보기</Link>
      </section>
    </main>
  );
}
