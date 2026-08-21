"use client";

import type { SaveSetting } from "./types";

/** 영상 링크 섹션 — 배달 완료 화면 / 마음 배송 완료 감사 영상 */
export default function VideoSection({
  videoInput,
  setVideoInput,
  heartVideoInput,
  setHeartVideoInput,
  saveSetting,
}: {
  videoInput: string;
  setVideoInput: (v: string) => void;
  heartVideoInput: string;
  setHeartVideoInput: (v: string) => void;
  saveSetting: SaveSetting;
}) {
  return (
    <section className="bg-white border border-wedding-gold/15 p-4 space-y-3">
      <p className="text-sm font-medium text-sage-700">영상 링크</p>
      <div className="space-y-1">
        <p className="text-[11px] text-neutral-400">
          🛵 배달 완료 화면 — &quot;특별한 영상 메시지&quot; (유튜브 비공개 링크 등)
        </p>
        <div className="flex gap-2">
          <input
            value={videoInput}
            onChange={(e) => setVideoInput(e.target.value)}
            placeholder="https://youtu.be/…"
            className="flex-1 p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
          />
          <button
            onClick={() =>
              saveSetting("video_url", videoInput.trim() || null,
                videoInput.trim() ? "완료 화면 영상을 저장했어요 🎬" : "완료 화면 영상을 비웠어요")
            }
            className="px-3 bg-sage-600 text-white text-xs whitespace-nowrap"
          >
            저장
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] text-neutral-400">
          💌 마음 배송 완료 — &quot;두 사람의 짧은 감사 영상&quot;
        </p>
        <div className="flex gap-2">
          <input
            value={heartVideoInput}
            onChange={(e) => setHeartVideoInput(e.target.value)}
            placeholder="https://youtu.be/…"
            className="flex-1 p-2 text-base border border-wedding-gold/20 bg-white rounded-none focus:outline-none focus:border-sage-600"
          />
          <button
            onClick={() =>
              saveSetting("heart_video_url", heartVideoInput.trim() || null,
                heartVideoInput.trim() ? "감사 영상을 저장했어요 🎬" : "감사 영상을 비웠어요")
            }
            className="px-3 bg-sage-600 text-white text-xs whitespace-nowrap"
          >
            저장
          </button>
        </div>
      </div>
      <p className="text-[11px] text-neutral-400">
        비워두면 기존 환경변수(NEXT_PUBLIC_VIDEO_URL 등) 값이 대신 쓰여요.
      </p>
    </section>
  );
}
