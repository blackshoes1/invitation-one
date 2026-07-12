"use client";

import { useEffect, useRef, useState } from "react";
import { Music, VolumeX } from "lucide-react";
import { BGM_URL, BGM_TITLE } from "@/lib/wedding";

const KEY = "invitation-bgm";

/**
 * 배경음악 토글 (FD-5).
 * wedding.ts 의 BGM_URL 이 설정된 경우에만 좌상단에 재생/일시정지 버튼을 노출.
 * - 브라우저 자동재생 정책상 첫 재생은 사용자 탭으로 시작.
 * - 재생 여부를 localStorage 로 기억하고, 이전에 켰다면 첫 상호작용(탭/스크롤) 시 이어서 재생.
 * - 음원 로드 실패 시 버튼을 숨겨 깨진 컨트롤이 남지 않도록 함.
 */
export default function BgmToggle() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  // 음원 미설정 시 아무것도 렌더링하지 않음
  useEffect(() => {
    if (!BGM_URL) return;
    const audio = new Audio(BGM_URL);
    audio.loop = true;
    audio.volume = 0.4;
    audio.preload = "auto";
    audio.addEventListener("error", () => setFailed(true));
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audioRef.current = audio;

    // 이전에 켰던 하객이라면 첫 상호작용에서 재생을 이어감(자동재생 차단 우회)
    const wasOn = localStorage.getItem(KEY) === "1";
    let resumeBound = false;
    const resume = () => {
      audio.play().catch(() => {});
      detach();
    };
    const detach = () => {
      if (!resumeBound) return;
      resumeBound = false;
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("scroll", resume);
    };
    if (wasOn) {
      // 곧바로 시도하되, 차단되면 첫 상호작용을 기다림
      audio.play().catch(() => {
        resumeBound = true;
        window.addEventListener("pointerdown", resume, { once: true });
        window.addEventListener("keydown", resume, { once: true });
        window.addEventListener("scroll", resume, { once: true });
      });
    }

    return () => {
      detach();
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  if (!BGM_URL || failed) return null;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      localStorage.setItem(KEY, "0");
    } else {
      audio
        .play()
        .then(() => localStorage.setItem(KEY, "1"))
        .catch(() => setFailed(true));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      aria-label={playing ? `${BGM_TITLE} 끄기` : `${BGM_TITLE} 켜기`}
      title={BGM_TITLE}
      className={`fixed top-3 left-3 z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium shadow-sm backdrop-blur-sm border transition-colors ${
        playing
          ? "bg-sage-700 text-white border-sage-700"
          : "bg-white/85 text-sage-700 border-wedding-gold/30"
      }`}
    >
      {playing ? <Music size={12} /> : <VolumeX size={12} />}
      {playing ? "음악 끄기" : "음악"}
    </button>
  );
}
