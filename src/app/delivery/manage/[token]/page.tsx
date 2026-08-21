"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { groom, bride } from "@/lib/wedding";
import CancelChangeForm from "@/components/delivery/CancelChangeForm";
import BikeIcon from "@/components/delivery/BikeIcon";

/** 구 링크 형식(participant UUID) — 토큰 방식으로 바뀌어 안내 화면으로 유도 */
const LEGACY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ManagePage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const legacy = LEGACY_UUID_RE.test(token);

  return (
    <div>
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center shadow-sm">
        <span className="font-serif font-bold tracking-tight flex items-center gap-2">
          <BikeIcon className="w-6 h-6 text-white" />
          {groom.name}·{bride.name} 스토어
        </span>
      </header>
      {legacy ? (
        <div className="h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-8">
          <div className="text-5xl">🔐</div>
          <p className="font-bold text-neutral-700">관리 링크 방식이 바뀌었어요</p>
          <p className="text-xs text-neutral-400 leading-relaxed">
            더 안전한 링크로 바뀌어 예전 주소는 더 이상 쓸 수 없어요.
            <br />
            아래에서 <b>내 신청 찾기</b>로 새 관리 링크를 받아주세요.
          </p>
          <Link
            href="/delivery"
            className="mt-2 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold"
          >
            내 신청 찾기 🔍
          </Link>
        </div>
      ) : (
        <CancelChangeForm token={token} />
      )}
    </div>
  );
}
