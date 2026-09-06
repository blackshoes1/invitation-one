"use client";

import { useEffect, useState } from "react";
import type { InvitePrefill } from "@/lib/invite";

/**
 * 개인 초대 링크(`?i=<토큰>`) 해석 — 두 진입 페이지가 같은 규칙을 쓰도록 모아둔 훅.
 *
 * 예전에는 두 페이지가 각자 fetch 하고, 안 맞는 토큰을 **조용히 버렸다.**
 * 하객 입장에서는 이름이 안 채워진 이유를 알 길이 없었다. 이제 왜 못 썼는지를
 * 상태로 돌려주고, 화면이 안내한다 (`InviteNotice`).
 *
 * `expectedSlug`
 * - `null`  — 어느 그룹의 토큰이든 신원 확인용으로 쓴다 (개인 주문 `/delivery?i=`)
 * - 슬러그  — 그 그룹의 토큰만 쓴다. 다른 그룹이면 `other-group`
 */
export type InviteStatus =
  | "none" // 토큰 없음
  | "loading"
  | "ok" // 이 페이지에서 쓸 수 있는 토큰
  | "other-group" // 유효하지만 다른 그룹의 초대
  | "invalid"; // 만료·오타 등 해석 불가

export interface InviteState {
  status: InviteStatus;
  /** 화면·제출에 쓸 수 있는 초대 (status === "ok" 일 때만 채워진다) */
  prefill: InvitePrefill | null;
  /** 제출 시 보낼 토큰 (status === "ok" 일 때만) */
  token: string | null;
  /** other-group 안내용 — 이 토큰이 속한 그룹 */
  otherGroupSlug: string | null;
  /** 첫 조회가 끝났는가 — 끝나기 전에 폼을 그리면 이름이 뒤늦게 채워진다 */
  ready: boolean;
}

/** 조회 결과 — 어떤 입력으로 얻은 값인지 함께 들고 있는다 (아래 파생 참고) */
interface Fetched {
  token: string;
  expectedSlug: string | null;
  status: "ok" | "other-group" | "invalid";
  prefill: InvitePrefill | null;
  otherGroupSlug: string | null;
}

export function useInvite(
  token: string | null,
  expectedSlug: string | null
): InviteState {
  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const base = { token, expectedSlug };
    fetch(`/api/delivery/invite?i=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { invite?: InvitePrefill } | null) => {
        if (!alive) return;
        const invite = j?.invite ?? null;
        if (!invite)
          return setFetched({ ...base, status: "invalid", prefill: null, otherGroupSlug: null });
        if (expectedSlug !== null && invite.groupSlug !== expectedSlug)
          return setFetched({
            ...base,
            status: "other-group",
            prefill: null,
            otherGroupSlug: invite.groupSlug,
          });
        setFetched({ ...base, status: "ok", prefill: invite, otherGroupSlug: null });
      })
      .catch(() => {
        if (alive)
          setFetched({ ...base, status: "invalid", prefill: null, otherGroupSlug: null });
      });
    return () => {
      alive = false;
    };
  }, [token, expectedSlug]);

  // 상태는 렌더 시점에 파생한다 — 토큰이 바뀌면 이전 조회 결과는 버린다.
  // (그러지 않으면 링크를 갈아탄 직후 옛 사람의 이름이 잠깐 보인다)
  const current =
    fetched && fetched.token === token && fetched.expectedSlug === expectedSlug
      ? fetched
      : null;
  const status: InviteStatus = !token ? "none" : current ? current.status : "loading";

  return {
    status,
    prefill: current?.prefill ?? null,
    token: current?.status === "ok" ? token : null,
    otherGroupSlug: current?.otherGroupSlug ?? null,
    ready: status !== "loading",
  };
}
