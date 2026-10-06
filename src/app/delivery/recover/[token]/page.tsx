"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { groom, bride } from "@/lib/wedding";
import BikeIcon from "@/components/delivery/BikeIcon";

/**
 * 복구 링크 착지 페이지 (문제 4).
 *
 * 문자로 받은 단기 토큰을 관리 링크로 교환하고 바로 이동한다. 토큰이 화면·주소창에
 * 오래 남지 않도록 `router.replace` 로 갈아탄다(뒤로 가기로 돌아오지 않게 하려는
 * 목적도 있다 — 토큰은 1회용이라 돌아와도 이미 쓸모없다).
 *
 * 외부 리소스를 쓰지 않는다. referrer 는 layout 의 메타 태그로 막는다 —
 * 이 URL 자체가 토큰이라 다른 사이트로 새어 나가면 안 된다.
 */
export default function RecoverPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    // 1회용 토큰이라 StrictMode 의 이중 실행으로 두 번 교환하면 안 된다
    if (ran.current) return;
    ran.current = true;

    const token = params.token ?? "";
    (async () => {
      try {
        const res = await fetch("/api/delivery/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) return setFailed(true);
        const j = (await res.json()) as { manage_url?: string };
        if (!j.manage_url) return setFailed(true);
        router.replace(j.manage_url);
      } catch {
        setFailed(true);
      }
    })();
  }, [params.token, router]);

  return (
    <div>
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center shadow-sm">
        <span className="font-serif font-bold tracking-tight flex items-center gap-2">
          <BikeIcon className="w-6 h-6 text-white" />
          {groom.name}·{bride.name} 스토어
        </span>
      </header>
      <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
        {failed ? (
          <>
            <div className="text-5xl">⏰</div>
            <p className="font-bold text-neutral-700">링크가 만료됐어요</p>
            <p className="text-xs text-neutral-500 leading-relaxed">
              복구 링크는 30분간, 한 번만 쓸 수 있어요.
              <br />
              아래에서 다시 요청해주세요.
            </p>
            <Link
              href="/delivery?find=1"
              className="mt-2 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold"
            >
              내 신청 찾기 🔍
            </Link>
          </>
        ) : (
          <p className="text-neutral-500 text-sm">관리 링크를 여는 중…</p>
        )}
      </div>
    </div>
  );
}
