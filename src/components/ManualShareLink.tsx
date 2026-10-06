"use client";

export default function ManualShareLink({ url }: { url: string }) {
  return (
    <div className="w-full max-w-sm space-y-2 rounded-lg border border-neutral-200 bg-white p-3 text-left">
      <p role="status" className="text-xs text-neutral-600">자동 복사가 막혀 있어요. 아래 주소를 선택해 복사한 뒤 단톡방에 붙여넣어 주세요.</p>
      <input aria-label="직접 복사할 공유 링크" readOnly value={url}
        onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.currentTarget.select()}
        className="w-full min-w-0 rounded border border-neutral-300 px-2 py-3 text-base text-neutral-700" />
    </div>
  );
}
