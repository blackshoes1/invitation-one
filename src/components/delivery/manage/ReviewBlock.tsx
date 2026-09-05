"use client";

export default function ReviewBlock({
  already,
  alreadyText,
  rating,
  setRating,
  reviewText,
  setReviewText,
  busy,
  done,
  onSubmit,
}: {
  already: number | null;
  alreadyText: string | null;
  rating: number;
  setRating: (n: number) => void;
  reviewText: string;
  setReviewText: (s: string) => void;
  busy: boolean;
  done: boolean;
  onSubmit: () => void;
}) {
  // 이미 등록된 리뷰가 있거나 방금 등록 완료한 경우
  if (done || already) {
    const stars = "⭐".repeat(done ? rating : already ?? 0);
    return (
      <div className="bg-white border-2 border-delivery/15 rounded-2xl p-5 text-center space-y-2">
        <p className="text-sm font-extrabold text-delivery">리뷰 감사합니다! 🙏</p>
        <p className="text-lg tracking-wide">{stars}</p>
        {(done ? reviewText : alreadyText) && (
          <p className="text-xs text-neutral-500 leading-relaxed">
            “{done ? reviewText : alreadyText}”
          </p>
        )}
        <p className="text-[11px] text-neutral-500">
          남겨주신 후기는 청첩장에 소개돼요 💝
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-delivery/15 rounded-2xl p-5 space-y-4">
      <div className="text-center space-y-1">
        <p className="text-sm font-extrabold text-neutral-800">
          청첩장은 만족스러우셨나요?
        </p>
        <p className="text-[11px] text-neutral-500">별점을 남겨주시면 큰 힘이 돼요</p>
      </div>

      <div className="flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n}점`}
            className={`text-3xl transition-transform active:scale-90 ${
              n <= rating ? "grayscale-0 scale-110" : "grayscale opacity-40"
            }`}
          >
            ⭐
          </button>
        ))}
      </div>

      <div>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value.slice(0, 100))}
          placeholder="한줄 후기 (선택) 예) 신랑 친절해요 / 청첩장 예뻐요"
          rows={2}
          className="w-full rounded-xl border border-delivery/20 px-3 py-2.5 text-base resize-none focus:outline-none focus:border-delivery"
        />
        <p className="text-right text-[10px] text-neutral-500">
          {reviewText.length}/100
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="w-full py-3.5 rounded-full bg-delivery text-white font-bold active:scale-95 transition-transform disabled:opacity-60"
      >
        {busy ? "등록 중…" : "리뷰 등록하기"}
      </button>
    </div>
  );
}
