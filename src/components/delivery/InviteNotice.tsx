"use client";

import { useState } from "react";
import Link from "next/link";
import { inviteUrl } from "@/lib/invite";
import type { InviteState } from "@/components/delivery/useInvite";

/**
 * 초대 링크를 못 쓴 이유 안내 (결함 ② 수정).
 *
 * 예전에는 다른 그룹의 토큰이나 만료된 토큰이 오면 **아무 말 없이 무시했다.**
 * 하객은 이름이 왜 안 채워졌는지, 자기가 링크를 잘못 눌렀는지 알 수 없었다.
 * 신청 자체는 그대로 진행할 수 있으므로 막지 않고, 닫을 수 있는 안내만 띄운다.
 */
export default function InviteNotice({
  state,
  /** 주소창의 원본 토큰 — 맞는 그룹 페이지 링크를 만들 때만 쓴다 */
  token,
}: {
  state: InviteState;
  token: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (state.status !== "other-group" && state.status !== "invalid") return null;

  const otherGroup =
    state.status === "other-group" && token ? state.otherGroupSlug : null;

  return (
    <div className="max-w-md mx-auto px-5 pb-2">
      <div
        role="status"
        className="rounded-2xl border-2 border-delivery/20 bg-white px-4 py-3 space-y-2"
      >
        <p className="text-sm font-bold text-neutral-800">
          {otherGroup
            ? "이 초대 링크는 다른 모임의 링크예요 🔗"
            : "초대 링크를 확인하지 못했어요 🔗"}
        </p>
        <p className="text-xs text-neutral-500 leading-relaxed">
          {otherGroup
            ? "여기서는 이름·연락처가 자동으로 채워지지 않아요. 원래 모임 페이지로 가시거나, 이 페이지에서 직접 입력해 신청하셔도 괜찮아요."
            : "링크가 만료됐거나 주소가 조금 달라진 것 같아요. 이름·연락처를 직접 입력해 신청하시면 됩니다."}
        </p>
        <div className="flex gap-2 pt-0.5">
          {otherGroup && token && (
            <Link
              href={inviteUrl("", otherGroup, token)}
              className="flex-1 text-center px-3 py-2.5 rounded-full bg-delivery text-white text-xs font-bold"
            >
              내 모임 페이지로 가기
            </Link>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex-1 px-3 py-2.5 rounded-full bg-white border-2 border-delivery/20 text-neutral-600 text-xs font-bold"
          >
            직접 입력하고 계속하기
          </button>
        </div>
      </div>
    </div>
  );
}
