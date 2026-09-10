"use client";

import { useRef, useState, type FormEvent } from "react";
import RegionPicker from "@/components/delivery/RegionPicker";

export default function CelebrationForm({ onSent }: { onSent: () => void }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState("anon");
  const [addRegion, setAddRegion] = useState(false);
  const [region, setRegion] = useState({ sido: "", sub: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (name.trim().length < 2) return setError("이름을 2자 이상 입력해주세요.");
    if (!message.trim()) return setError("축하 한마디를 입력해주세요.");
    if (addRegion && (!region.sido || !region.sub.trim())) return setError("지도에 표시할 지역을 선택해주세요.");
    lock.current = true;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/celebrations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), message: message.trim(), visibility,
          ...(addRegion ? region : {}) }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? "잠시 후 다시 남겨주세요. 요청이 많아 잠깐 쉬고 있어요."
          : "메시지를 저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해주세요.");
        return;
      }
      setMessage("");
      setNotice(visibility === "private" ? "따뜻한 축하를 두 사람에게만 전했어요. 고맙습니다 💌" : "축하 한마디를 남겼어요. 따뜻한 마음 고맙습니다 💌");
      onSent();
    } catch {
      setError("연결이 끊겨 전송 결과를 확인하지 못했어요. 잠시 후 축하 목록을 확인해주세요.");
    } finally {
      lock.current = false;
      setSending(false);
    }
  };

  return (
    <form aria-label="축하 한마디 남기기" onSubmit={submit}
      className="rounded-2xl border border-wedding-gold/25 bg-white p-4 text-left space-y-3">
      <div>
        <h3 className="font-serif text-lg text-sage-700">축하 한마디 남기기</h3>
        <p className="mt-1 text-xs text-neutral-500">두 사람에게 따뜻한 한마디를 전해주세요.</p>
      </div>
      <fieldset disabled={sending} className="space-y-3 min-w-0">
        <label className="block text-xs text-neutral-600">이름
          <input required minLength={2} maxLength={40} autoComplete="name" value={name}
            onChange={(e) => setName(e.target.value)} placeholder="이름을 알려주세요"
            className="mt-1 w-full rounded-lg border border-neutral-200 p-3 text-base focus:outline-sage-600" />
        </label>
        <label className="block text-xs text-neutral-600">축하 한마디
          <textarea required maxLength={500} rows={3} value={message}
            onChange={(e) => setMessage(e.target.value)} placeholder="결혼을 진심으로 축하해! 오래오래 행복하길 💐"
            className="mt-1 w-full resize-y rounded-lg border border-neutral-200 p-3 text-base focus:outline-sage-600" />
        </label>
        <label className="block text-xs text-neutral-600">공개 방식
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 bg-white p-3 text-base">
            <option value="anon">익명 별명으로 공개</option>
            <option value="name">이름으로 공개</option>
            <option value="private">두 사람에게만 전달</option>
          </select>
        </label>
        <p className="text-[11px] text-neutral-500">이름은 신랑·신부가 확인할 수 있어요. 익명 공개 시에는 다른 분들에게 별명으로 보여요.</p>
        <label className="flex items-center gap-2 py-1 text-xs text-neutral-600">
          <input type="checkbox" checked={addRegion} onChange={(e) => setAddRegion(e.target.checked)} />
          축하 보내는 지역 추가 (선택)
        </label>
        {addRegion && <div className="space-y-2">
          <RegionPicker sido={region.sido} sub={region.sub} onChange={(sido, sub) => setRegion({ sido, sub })} />
          <p className="text-[11px] text-neutral-500">공개 메시지는 지역을 선택하면 축하 지도에도 표시돼요.</p>
        </div>}
        <button type="submit" disabled={sending || !name.trim() || !message.trim()}
          className="w-full rounded-lg bg-sage-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {sending ? "마음 전하는 중…" : "축하 남기기"}
        </button>
      </fieldset>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-sage-700">{notice}</p>}
    </form>
  );
}
