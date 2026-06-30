"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { groomAccounts, brideAccounts, type Account as Acct } from "@/lib/wedding";
import FadeIn from "@/components/FadeIn";

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

function AccountRow({ acc }: { acc: Acct }) {
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleCopy = async () => {
    if (await copyText(acc.number)) flash("복사됐어요!");
  };

  const handlePay = async (kind: "kakao" | "toss") => {
    const url = kind === "kakao" ? acc.kakaoPayUrl : acc.tossUrl;
    if (url) {
      window.location.href = url;
      return;
    }
    if (await copyText(acc.number))
      flash(`복사됐어요! ${kind === "kakao" ? "카카오페이" : "토스"}에서 붙여넣어 주세요`);
  };

  return (
    <div className="text-left py-1 space-y-2.5">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <p className="text-[11px] text-wedding-gold font-medium tracking-wider">
            {acc.role}
            <span className="text-sage-700 font-light ml-1">{acc.name}</span>
          </p>
          <p className="text-sm font-light tracking-wide text-sage-700">
            {acc.bank}
            <span className="text-xs font-mono tracking-tighter text-neutral-500 ml-1">
              {acc.number}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`${acc.name} 계좌번호 복사`}
          className="min-w-[64px] px-3 py-1.5 border border-wedding-gold/25 text-[11px] text-neutral-500 hover:text-wedding-gold hover:border-wedding-gold transition-all tracking-wide bg-white"
        >
          복사
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => handlePay("kakao")}
          className="py-2 text-[11px] bg-[#FEE500] text-[#3C1E1E] font-medium tracking-wide rounded-sm"
        >
          카카오페이로 보내기
        </button>
        <button
          type="button"
          onClick={() => handlePay("toss")}
          className="py-2 text-[11px] bg-[#3182F6] text-white font-medium tracking-wide rounded-sm"
        >
          토스로 보내기
        </button>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[11px] text-sage-600 text-center"
          >
            {toast}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountAccordion({ title, accounts }: { title: string; accounts: Acct[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-wedding-gold/15">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-6 py-4 flex justify-between items-center hover:bg-sage-50 transition-colors text-sm text-sage-700 font-light tracking-widest"
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          className={`text-wedding-gold/70 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="border-t border-wedding-gold/10 bg-sage-50/40 overflow-hidden"
          >
            <div className="px-6 py-5 space-y-4 divide-y divide-wedding-gold/10">
              {accounts.map((acc, i) => (
                <AccountRow key={i} acc={acc} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Account() {
  return (
    <section className="px-6 py-24 bg-wedding-cream border-t border-wedding-gold/10">
      <div className="max-w-sm mx-auto space-y-10 text-center">
        <FadeIn className="space-y-3">
          <p className="font-serif tracking-[0.3em] text-[11px] text-wedding-gold">
            마음 전하기
          </p>
          <div className="text-xs text-neutral-500 max-w-[300px] mx-auto leading-loose font-light pt-2 space-y-3">
            <p className="tracking-wide">
              저희의 예식은 하객 여러분과 더 깊게 눈을 맞추고
              <br />
              축하를 나누고자{" "}
              <span className="font-normal text-sage-700 border-b border-wedding-gold/40 pb-0.5">
                현장 축의대를 운영하지 않습니다.
              </span>
            </p>
            <p className="text-[11px] text-neutral-400 pt-1 tracking-wider">
              마음을 전하고자 하시는 분들을 위해
              <br />
              아래에 계좌를 안내드립니다. 너른 양해 부탁드립니다.
            </p>
          </div>
        </FadeIn>

        <FadeIn className="space-y-3">
          <AccountAccordion title="신랑측 마음 전하기" accounts={groomAccounts} />
          <AccountAccordion title="신부측 마음 전하기" accounts={brideAccounts} />
        </FadeIn>
      </div>
    </section>
  );
}
