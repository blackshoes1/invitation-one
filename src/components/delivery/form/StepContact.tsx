"use client";

import { useState, type RefObject } from "react";
import { formatPhone } from "@/lib/wedding";
import Q from "./Q";
import InvitePhoneBox from "@/components/delivery/InvitePhoneBox";
import RosterPicker from "@/components/delivery/RosterPicker";
import RosterPhoneBox from "@/components/delivery/RosterPhoneBox";
import type { PickedName } from "@/lib/roster";

/**
 * 첫 단계 — 받는 분 확인.
 *
 * 개인 초대 링크로 들어온 하객은 이름·연락처를 **이미 서버가 알고 있다.**
 * 그래서 "알려주세요"라고 묻지 않고 이름을 부르며 확인만 받는다.
 * (`inviteName` 이 있을 때만. 없으면 예전 그대로 입력 폼)
 *
 * 확인 화면에서 "정보 수정"을 누르면 입력 폼으로 바뀐다. 명단의 이름은 관리자가
 * 넣은 값이라 틀릴 수 있으므로 이 경로가 눈에 띄어야 한다.
 */
export default function StepContact({
  name,
  phone,
  phoneRef,
  onNameChange,
  onPhoneChange,
  phoneMasked = null,
  inviteName = null,
  groupSlug = null,
  rosterPhoneFor = null,
  onPickFromRoster,
  onUseOtherPhone,
  onNext,
}: {
  name: string;
  phone: string;
  phoneRef: RefObject<HTMLInputElement | null>;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  /** 그룹 페이지에서 왔으면 명단에서 이름을 고를 수 있게 한다 (타이핑 절약) */
  groupSlug?: string | null;
  /**
   * 명단에서 고른 이름의 번호를 쓰는 중이면 그 이름 — 번호 입력칸 대신 안내를 띄운다.
   * **번호 자체는 여기로 내려오지 않는다** (서버가 제출 시 붙인다).
   */
  rosterPhoneFor?: string | null;
  onPickFromRoster?: (picked: PickedName) => void;
  /** 개인 초대 링크로 확인된 번호(마스킹) — 있으면 입력 대신 확인 박스 표시 */
  phoneMasked?: string | null;
  /** 초대 링크로 확인된 이름 — 있으면 확인 화면(인사)으로 시작한다 */
  inviteName?: string | null;
  onUseOtherPhone?: () => void;
  onNext: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const confirmMode = Boolean(inviteName) && !editing;

  if (confirmMode) {
    return (
      <Q
        title={`${inviteName}님, 반가워요 👋`}
        sub="청첩장을 직접 전해드릴게요. 아래 정보가 맞는지만 확인해 주세요."
      >
        <div className="space-y-3">
          <dl className="dform-input flex flex-col gap-2 bg-delivery/5 border-delivery/30">
            <div className="flex items-baseline gap-3">
              <dt className="shrink-0 w-14 text-xs text-neutral-500">성함</dt>
              <dd className="font-bold text-neutral-800">{inviteName}</dd>
            </div>
            {phoneMasked && (
              <div className="flex items-baseline gap-3">
                <dt className="shrink-0 w-14 text-xs text-neutral-500">연락처</dt>
                <dd className="text-neutral-700">
                  {phoneMasked}
                  <span className="ml-2 text-[11px] text-delivery font-bold">
                    초대 링크로 확인됨 ✓
                  </span>
                </dd>
              </div>
            )}
          </dl>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full py-3 rounded-full bg-white border-2 border-delivery/20 text-neutral-600 text-sm font-bold"
          >
            정보 수정
          </button>
        </div>
      </Q>
    );
  }

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
        <RosterPicker
          slug={groupSlug}
          onPick={(p) => (onPickFromRoster ? onPickFromRoster(p) : onNameChange(p.name))}
        />
        {phoneMasked ? (
          <InvitePhoneBox phoneMasked={phoneMasked} onUseOther={onUseOtherPhone} />
        ) : rosterPhoneFor ? (
          <RosterPhoneBox name={rosterPhoneFor} onUseOther={onUseOtherPhone} />
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
