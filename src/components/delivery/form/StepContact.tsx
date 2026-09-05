"use client";

import type { RefObject } from "react";
import { formatPhone } from "@/lib/wedding";
import Q from "./Q";
import InvitePhoneBox from "@/components/delivery/InvitePhoneBox";

export default function StepContact({
  name,
  phone,
  phoneRef,
  onNameChange,
  onPhoneChange,
  phoneMasked = null,
  onUseOtherPhone,
  onNext,
}: {
  name: string;
  phone: string;
  phoneRef: RefObject<HTMLInputElement | null>;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  /** 개인 초대 링크로 확인된 번호(마스킹) — 있으면 입력 대신 확인 박스 표시 */
  phoneMasked?: string | null;
  onUseOtherPhone?: () => void;
  onNext: () => void;
}) {
  return (
    <Q title="받는 분 정보를 알려주세요 📋">
      <div className="space-y-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              phoneRef.current?.focus(); // 완료 → 연락처로 이동
            }
          }}
          enterKeyHint="next"
          autoComplete="name"
          placeholder="성함"
          aria-label="성함"
          className="dform-input"
        />
        {phoneMasked ? (
          <InvitePhoneBox phoneMasked={phoneMasked} onUseOther={onUseOtherPhone} />
        ) : (
          <input
            ref={phoneRef}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => onPhoneChange(formatPhone(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && onNext()}
            enterKeyHint="done"
            placeholder="배송 완료 후 연락드릴 번호 📞"
            aria-label="연락처"
            className="dform-input"
          />
        )}
      </div>
    </Q>
  );
}
