"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  STAMPS,
  INVITATION_KEY,
  HEART_VIDEO_URL,
  formatPhone,
  isValidPhone,
} from "@/lib/wedding";
import { OVERSEAS, joinRegion } from "@/lib/regions";
import StampPicker from "@/components/delivery/StampPicker";
import RegionPicker from "@/components/delivery/RegionPicker";
import { notifyAdmin } from "@/lib/notify";
import { getSiteSettings } from "@/lib/settings";

const invitationHref = INVITATION_KEY ? `/?key=${INVITATION_KEY}` : "/";

export default function HeartForm({
  group = null,
  inviteName = null,
  onSwitchToDelivery,
}: {
  group?: { id: string; name: string } | null;
  /** 개인 초대 링크로 들어온 경우 이름 프리필 */
  inviteName?: string | null;
  /** "역시 직접 만나고 싶어요" — 같은 페이지에서 직접 배달 폼으로 전환 */
  onSwitchToDelivery?: () => void;
}) {
  const [stamp, setStamp] = useState<string>(STAMPS[0]);
  const [name, setName] = useState(inviteName ?? "");
  const [sido, setSido] = useState("");
  const [sub, setSub] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  /** 공개 설정 (기본: 익명 · 모두에게 공개 · 지역 표시) + 참석 여부(선택) */
  const [displayMode, setDisplayMode] = useState<DisplayMode>("anon");
  const [isPrivate, setIsPrivate] = useState(false);
  const [showRegion, setShowRegion] = useState(true);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Admin 설정 영상 우선, 없으면 env(HEART_VIDEO_URL) 폴백
  const [heartVideoUrl, setHeartVideoUrl] = useState(HEART_VIDEO_URL);
  useEffect(() => {
    getSiteSettings().then((s) => {
      if (s.heart_video_url) setHeartVideoUrl(s.heart_video_url);
    });
  }, []);

  const submit = async () => {
    if (name.trim().length < 2) return setError("앗, 성함은 꼭 알려주셔야 해요! 🙏");
    if (!sido || !sub.trim())
      return setError(
        sido === OVERSEAS
          ? "어느 나라에서 보내시는지 알려주세요 🌍"
          : "어디서 마음을 보내시는지 알려주세요 📍"
      );
    if (phone.trim() && !isValidPhone(phone))
      return setError("연락처 형식을 확인해주세요 (010-0000-0000) 📞");
    setError(null);
    setSending(true);

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.rpc("send_heart_v2", {
        p_group_id: group?.id ?? null,
        p_name: name.trim(),
        p_region: joinRegion(sido, sub.trim()),
        p_stamp: stamp,
        p_message: message.trim() || null,
        p_phone: phone.trim() || null,
        p_display_mode: displayMode,
        p_is_private: isPrivate,
        p_show_region: showRegion,
        p_attendance: attendance,
      });
      if (error) {
        setSending(false);
        return setError("전송에 실패했어요. 잠시 후 다시 시도해주세요 🛠️");
      }
      notifyAdmin();
    } else {
      await new Promise((r) => setTimeout(r, 400));
    }
    setSending(false);
    setDone(true);
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm mx-auto px-6 py-10 text-center space-y-4"
      >
        <div className="text-5xl">{stamp}</div>
        <p className="text-lg font-extrabold text-neutral-800">
          따뜻한 마음 잘 받았어요 🥰
        </p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wedding-gold/10 text-wedding-gold text-xs font-bold">
          💌 마음으로 함께한 분
        </div>
        <p className="text-xs text-neutral-400">
          {joinRegion(sido, sub)}에서 보내주신 마음이
          <br />
          저희 청첩장 지도에 예쁘게 찍혔어요 📍
        </p>

        {heartVideoUrl && (
          <div className="bg-delivery/5 rounded-2xl p-5 space-y-2">
            <p className="text-xs text-neutral-500 leading-relaxed">
              직접 못 뵙는 게 아쉬워서
              <br />
              저희가 짧게 인사 남겼어요
            </p>
            <a
              href={heartVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-full bg-delivery-mint text-white font-bold text-sm"
            >
              두 사람의 짧은 감사 영상 ▶
            </a>
          </div>
        )}

        <p className="text-sm text-neutral-500">결혼식에서는 꼭 안아드릴게요!</p>
        <Link
          href={invitationHref}
          className="inline-block mt-1 px-6 py-3.5 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform"
        >
          💌 모바일 청첩장 보기
        </Link>

        {/* 마음 → 직접 배달 전환 (거절이 아니라 마음이 바뀔 여지) */}
        {onSwitchToDelivery && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onSwitchToDelivery}
              className="text-sm text-delivery underline underline-offset-2"
            >
              역시 직접 만나서 받고 싶어요 🛵
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-6 space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-extrabold text-neutral-800">💌 축하 한마디 남기기</h2>
        <p className="text-sm text-neutral-400">
          종이 청첩장은 안 받고, 축하 마음만 남겨요 (마음 배송)
        </p>
        <p className="text-[11px] text-neutral-400">결혼식 참석 여부와는 상관없어요 🙂</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-neutral-500 text-center">축하 스탬프</p>
        <StampPicker value={stamp} onChange={setStamp} />
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름"
        className="dform-input"
      />

      <div className="space-y-1.5">
        <p className="text-xs font-bold text-neutral-500">
          어디서 마음을 보내시나요? 📍
        </p>
        <RegionPicker
          sido={sido}
          sub={sub}
          onChange={(s, g) => {
            setSido(s);
            setSub(g);
          }}
        />
        <p className="text-[11px] text-neutral-400">
          보내주신 지역은 청첩장 지도에 💌 핀으로 찍혀요 (구 단위까지만)
        </p>
      </div>

      <textarea
        value={message}
        maxLength={500}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="한마디 (선택)"
        className="w-full p-4 rounded-2xl border-2 border-delivery/20 bg-white focus:outline-none focus:border-delivery resize-none h-24 text-base"
      />

      {/* 공개 범위 — 기본 익명. 관리자(신랑신부)는 항상 실명·원문을 봄 */}
      <div className="rounded-2xl border-2 border-delivery/15 bg-white p-4 space-y-3">
        <p className="text-xs font-bold text-neutral-500">청첩장 방명록에 이렇게 보여요 👀</p>
        <div className="rounded-xl bg-delivery/5 px-3 py-2.5 text-sm">
          {isPrivate ? (
            <p className="text-neutral-500 text-xs">
              🔒 신랑신부에게만 보여요 (방명록·지도에는 나오지 않아요)
            </p>
          ) : (
            <>
              <p className="font-bold text-neutral-700">
                {stamp} {publicName(name, displayMode)}
                {showRegion && sido && sub.trim() ? (
                  <span className="font-normal text-neutral-400"> · 📍 {joinRegion(sido, sub.trim())}</span>
                ) : null}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {message.trim() ? `“${message.trim()}”` : "(한마디 없음)"}
              </p>
            </>
          )}
        </div>

        <ChoiceRow
          label="이름 표시"
          value={displayMode}
          onChange={setDisplayMode}
          options={[
            ["anon", "익명"],
            ["initial", "한 글자 가리기"],
            ["name", "실명"],
          ]}
        />
        <ChoiceRow
          label="한마디"
          value={isPrivate ? "private" : "public"}
          onChange={(v) => setIsPrivate(v === "private")}
          options={[
            ["public", "모두에게 공개"],
            ["private", "신랑신부에게만 🔒"],
          ]}
        />
        <ChoiceRow
          label="지역"
          value={showRegion ? "show" : "hide"}
          onChange={(v) => setShowRegion(v === "show")}
          options={[
            ["show", "지도에 표시"],
            ["hide", "표시 안 함"],
          ]}
        />
        <p className="text-[11px] text-neutral-400">
          이름·연락처 원본은 신랑신부만 봐요
        </p>
      </div>

      {/* 참석 여부 (선택) — 공개되지 않고 신랑신부만 봄 */}
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-neutral-500">
          결혼식엔 오실 수 있나요? <span className="font-normal text-neutral-400">(선택)</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["yes", "참석해요 🙌"],
              ["maybe", "아직 미정 🤔"],
              ["no", "못 가요 🙏"],
            ] as [Attendance, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setAttendance(attendance === v ? null : v)}
              className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                attendance === v
                  ? "bg-delivery text-white border-delivery"
                  : "bg-white text-neutral-600 border-delivery/15"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400">신랑신부만 볼 수 있어요 · 나중에 바뀌어도 괜찮아요</p>
      </div>

      <div className="space-y-1.5">
        <input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          enterKeyHint="done"
          placeholder="연락처 (선택)"
          className="dform-input"
        />
        <p className="text-[11px] text-neutral-400">
          남겨주시면 다음에 청첩장에서 다시 오셨을 때 알아볼 수 있어요 💌
        </p>
      </div>

      {error && <p className="text-sm text-delivery-dark text-center">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="w-full py-4 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform disabled:opacity-60"
      >
        {sending ? "전하는 중…" : "마음 전하기 💌"}
      </button>
    </div>
  );
}

type DisplayMode = "anon" | "initial" | "name";
type Attendance = "yes" | "maybe" | "no";

/** 공개 피드 표시명 미리보기 — 서버(get_celebrations) 규칙과 동일 */
function publicName(name: string, mode: DisplayMode): string {
  const n = name.trim();
  if (mode === "name") return n || "이름";
  if (mode === "initial") {
    if (n.length <= 1) return "○";
    if (n.length === 2) return `${n[0]}○`;
    return `${n[0]}${"○".repeat(n.length - 2)}${n[n.length - 1]}`;
  }
  return "익명의 하객";
}

function ChoiceRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] font-bold text-neutral-500">{label}</span>
      <div className="flex-1 flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              value === v
                ? "bg-delivery text-white border-delivery"
                : "bg-white text-neutral-500 border-delivery/20"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
