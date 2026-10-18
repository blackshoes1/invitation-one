"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";

/** 원본은 보존하고 표시용 이미지만 축소한다. 저장소가 잠시 바쁘면 두 번 다시 불러온다. */
export default function GuestPhotoImage({ alt, ...props }: Omit<ImageProps, "onLoad" | "onError">) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (failed) {
    return (
      <span role="status" className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-sage-600 bg-sage-50">
        사진을 불러오지 못했어요
      </span>
    );
  }

  return (
    <Image
      {...props}
      alt={alt}
      key={attempt}
      onLoad={() => clearTimeout(timer.current)}
      onError={() => {
        clearTimeout(timer.current);
        if (attempt >= 2) setFailed(true);
        else timer.current = setTimeout(() => setAttempt(value => value + 1), 1000 * (attempt + 1));
      }}
    />
  );
}
