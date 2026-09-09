"use client";

import { useState } from "react";
import { DRAFT_KEY } from "./form/types";
import Link from "next/link";
import { inviteUrl, personalInviteUrl } from "@/lib/invite";
import type { InviteState } from "@/components/delivery/useInvite";

/**
 * 초대 링크를 못 쓴 이유 안내 (결함 ② 수정).
 *
 * 예전에는 다른 그룹의 토큰이나 만료된 토큰이 오면 **아무 말 없이 무시했다.**
 * 하객은 이름이 왜 안 채워졌는지, 자기가 링크를 잘못 눌렀는지 알 수 없었다.
 * 신청 자체는 그대로 진행할 수 있으므로 막지 않고, 닫을 수 있는 안내만 띄운다.
 *
 * 세 가지 경우
 *  - 다른 모임의 초대 → 맞는 모임 페이지로 가는 링크를 준다
 *  - 그룹 없는 개별 초대인데 모임 페이지에 들어옴 → 개인 신청 페이지 링크를 준다
 *  - 해석 불가 → 재시도 또는 본인 링크 요청을 먼저 안내한다
 */
export default function InviteNotice({
  state,
  /** 주소창의 원본 토큰 — 맞는 페이지로 보내는 링크를 만들 때만 쓴다 */
  token,
}: {
  state: InviteState;
  token: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (state.status === "ok" && state.prefill) {
    return (
      <section aria-label="초대받은 분 확인" className="max-w-md mx-auto px-5 pb-3">
        <div className="rounded-2xl border border-delivery/20 bg-white px-4 py-3 text-sm space-y-2">
          <p><strong>{state.prefill.name}님 전용 링크</strong>
            {state.prefill.phoneMasked && <span className="ml-2 text-neutral-600">{state.prefill.phoneMasked}</span>}
          </p>
          {state.prefill.groupName && <p className="text-xs text-neutral-600">함께 초대받은 모임: {state.prefill.groupName}</p>}
          <button type="button" className="text-xs underline text-neutral-600"
            onClick={() => {
              // Full navigation discards every form and group-response state, not just the token.
              // Do not carry a conversion credential to a different guest either.
              try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
              const url = new URL(window.location.href);
              url.searchParams.delete("i");
              url.searchParams.delete("convert");
              window.location.replace(url.pathname + url.search);
            }}>
            본인이 아닌가요? 내 정보로 새로 시작
          </button>
        </div>
      </section>
    );
  }
  if (dismissed) return null;
  if (state.status !== "other-group" && state.status !== "invalid") return null;

  // other-group 인데 슬러그가 없다 = 그룹에 속하지 않은 개별 초대 링크
  const solo = state.status === "other-group" && !state.otherGroupSlug;
  const otherGroup = state.status === "other-group" ? state.otherGroupSlug : null;

  const title = otherGroup
    ? "이 초대 링크는 다른 모임의 링크예요 🔗"
    : solo
      ? "이 초대 링크는 개인 신청용이에요 🔗"
      : "초대 링크를 확인하지 못했어요 🔗";

  const body = otherGroup
    ? "여기서는 이름·연락처가 자동으로 채워지지 않아요. 원래 모임 페이지로 가시거나, 이 페이지에서 직접 입력해 신청하셔도 괜찮아요."
    : solo
      ? "모임 페이지에서는 자동으로 채워지지 않아요. 개인 신청 페이지로 가시면 이름·연락처가 채워진 채로 진행돼요."
      : "먼저 다시 확인해 주세요. 계속 열리지 않으면 링크를 보내준 신랑·신부에게 본인 전용 링크를 다시 요청해주세요. 올바른 링크로 들어오면 이름·등록된 연락처를 입력하지 않아도 됩니다.";

  const href =
    token && otherGroup
      ? inviteUrl("", otherGroup, token)
      : token && solo
        ? personalInviteUrl("", token)
        : null;

  return (
    <div className="max-w-md mx-auto px-5 pb-2">
      <div
        role="status"
        className="rounded-2xl border-2 border-delivery/20 bg-white px-4 py-3 space-y-2"
      >
        <p className="text-sm font-bold text-neutral-800">{title}</p>
        <p className="text-xs text-neutral-500 leading-relaxed">{body}</p>
        <div className="flex gap-2 pt-0.5">
          {state.status === "invalid" && (
            <button type="button" onClick={() => window.location.reload()}
              className="flex-1 text-center px-3 py-2.5 rounded-full bg-delivery text-white text-xs font-bold">
              링크 다시 확인
            </button>
          )}
          {href && (
            <Link
              href={href}
              className="flex-1 text-center px-3 py-2.5 rounded-full bg-delivery text-white text-xs font-bold"
            >
              {otherGroup ? "내 모임 페이지로 가기" : "개인 신청 페이지로 가기"}
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
