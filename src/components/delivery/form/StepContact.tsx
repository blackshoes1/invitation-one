"use client";

import type { RefObject } from "react";
import { formatPhone } from "@/lib/wedding";
import Q from "./Q";

export default function StepContact({
  name,
  phone,
  phoneRef,
  onNameChange,
  onPhoneChange,
  onNext,
}: {
  name: string;
  phone: string;
  phoneRef: RefObject<HTMLInputElement | null>;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
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
          placeholder="성함"
          className="dform-input"
        />
        <input
          ref={phoneRef}
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(formatPhone(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && onNext()}
          enterKeyHint="done"
          placeholder="배송 완료 후 연락드릴 번호 📞"
          className="dform-input"
        />
      </div>
    </Q>
  );
}
