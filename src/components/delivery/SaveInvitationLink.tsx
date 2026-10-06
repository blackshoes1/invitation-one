"use client";

import { useState } from "react";
import { invitationHref } from "@/lib/inviteAccess";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 청첩장 다시 보기 링크 저장 안내 (완료 화면).
 * 이 기기에는 열람 기록이 남지만, 링크를 저장해두면 다른 기기·앱에서도 바로 열 수 있다.
 */
export default function SaveInvitationLink() {
  const [msg, setMsg] = useState<string | null>(null);

  const copy = async () => {
    const url = `${window.location.origin}${invitationHref}`;
    setMsg(
      (await copyText(url))
        ? "링크를 복사했어요! 나에게 보내두면 편해요 💌"
        : "복사가 안 됐어요 — 주소창의 링크를 저장해 주세요 🙏"
    );
    setTimeout(() => setMsg(null), 2600);
  };

  return (
    <div className="mt-4 w-full max-w-xs mx-auto text-center space-y-1.5">
      <button
        type="button"
        onClick={copy}
        className="text-xs text-neutral-500 underline underline-offset-2"
      >
        청첩장 링크 복사해두기 🔗
      </button>
      <p className="text-[11px] text-neutral-500 leading-relaxed">
        이 폰에서는 다음에 그냥 들어오셔도 열려요
        <br />
        홈 화면에 추가해두시면 더 편해요 📲
      </p>
      {msg && <p className="text-[11px] text-delivery">{msg}</p>}
    </div>
  );
}
