"use client";

import { useEffect, useRef, useState } from "react";
import type { Celebration } from "@/lib/supabase";
import {
  SPRITE_H,
  SPRITE_W,
  bakeSprites,
  lookFromId,
  type FrameName,
} from "@/lib/pixelSprite";
import {
  PLATFORMS,
  WORLD_H,
  WORLD_W,
  frameFor,
  makeRng,
  pickWalkerAt,
  spawnWalker,
  stepWalker,
  type Rng,
  type Walker,
} from "@/lib/villageSim";

const BUBBLE_MS = 4000;
/** 탭 복귀 직후 순간이동을 막는 프레임 시간 상한(초) */
const MAX_DT = 0.05;
const TAG_MAX_CHARS = 7;
const BUBBLE_MAX_W = 104;
const BUBBLE_MAX_LINES = 3;
const FONT = "7px sans-serif";
const CLOUDS: ReadonlyArray<readonly [number, number, number]> = [
  [18, 14, 24],
  [104, 26, 30],
  [150, 10, 20],
];

type Sprites = Record<FrameName, HTMLCanvasElement>;

interface Bubble {
  id: string;
  /** performance.now() 기준 만료 시각 */
  until: number;
}

interface Info {
  name: string;
  text: string;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clipName(name: string): string {
  const chars = Array.from(name);
  return chars.length > TAG_MAX_CHARS ? chars.slice(0, TAG_MAX_CHARS).join("") + "…" : name;
}

function drawScene(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#cfe9f5";
  ctx.fillRect(0, 0, WORLD_W, Math.round(WORLD_H * 0.55));
  ctx.fillStyle = "#e3f2ef";
  ctx.fillRect(0, Math.round(WORLD_H * 0.55), WORLD_W, WORLD_H);

  ctx.fillStyle = "#ffffff";
  for (const [x, y, w] of CLOUDS) {
    ctx.fillRect(x, y, w, 4);
    ctx.fillRect(x + 4, y - 3, w - 8, 4);
  }

  PLATFORMS.forEach((p, i) => {
    // 바닥은 화면 폭 전체, 위쪽 발판은 캐릭터 반폭만큼 양옆으로 넓게 그린다
    const x0 = i === 0 ? 0 : p.x0 - 6;
    const x1 = i === 0 ? WORLD_W : p.x1 + 6;
    const bottom = i === 0 ? WORLD_H : p.y + 5;
    ctx.fillStyle = "#a9855a";
    ctx.fillRect(x0, p.y, x1 - x0, bottom - p.y);
    ctx.fillStyle = "#788c63";
    ctx.fillRect(x0, p.y, x1 - x0, 3);
    ctx.fillStyle = "#94a67f";
    ctx.fillRect(x0, p.y, x1 - x0, 1);
  });
}

function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, sprite: HTMLCanvasElement): void {
  const dx = Math.round(w.x - SPRITE_W / 2);
  const dy = Math.round(w.y - SPRITE_H);
  if (w.facing === 1) {
    ctx.drawImage(sprite, dx, dy);
    return;
  }
  ctx.save();
  ctx.translate(dx + SPRITE_W, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, 0, 0);
  ctx.restore();
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  mine: boolean
): void {
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = Math.ceil(ctx.measureText(text).width) + 4;
  const x = Math.round(Math.min(WORLD_W - w - 1, Math.max(1, cx - w / 2)));
  ctx.fillStyle = mine ? "#b89b6e" : "rgba(43,33,24,0.62)";
  ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x + w / 2, y + 4.4);
}

/** 글자 단위 줄바꿈(한글 대응). maxLines 를 넘으면 마지막 줄을 말줄임표로 끝낸다. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number
): string[] {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  const lines: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < chars.length; i++) {
    const ch = chars[i];
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      lines.push(cur);
      cur = ch === " " ? "" : ch;
      if (lines.length === maxLines) break;
    } else {
      cur += ch;
    }
  }
  if (lines.length < maxLines) {
    if (cur) lines.push(cur);
    return lines;
  }
  const rest = (cur + chars.slice(i + 1).join("")).trim();
  if (!rest) return lines;
  let last = lines[maxLines - 1];
  while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
  lines[maxLines - 1] = last + "…";
  return lines;
}

function drawBubble(ctx: CanvasRenderingContext2D, w: Walker, info: Info): void {
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const padX = 4;
  const padY = 3;
  const lineH = 9;
  const title = clipName(info.name);
  const lines = wrapText(ctx, info.text, BUBBLE_MAX_W, BUBBLE_MAX_LINES);
  let textW = ctx.measureText(title).width;
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
  const bw = Math.ceil(textW) + padX * 2;
  const bh = (lines.length + 1) * lineH + padY * 2 - 1;
  const x = Math.round(Math.min(WORLD_W - bw - 2, Math.max(2, w.x - bw / 2)));
  const y = Math.max(2, Math.round(w.y - SPRITE_H - 5 - bh));
  const tailX = Math.round(Math.min(x + bw - 6, Math.max(x + 6, w.x)));

  ctx.fillStyle = "#b89b6e";
  ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, bw, bh);
  ctx.beginPath();
  ctx.moveTo(tailX - 3, y + bh);
  ctx.lineTo(tailX + 3, y + bh);
  ctx.lineTo(tailX, y + bh + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#b89b6e";
  ctx.font = `bold ${FONT}`;
  ctx.fillText(title, x + padX, y + padY);
  ctx.font = FONT;
  ctx.fillStyle = "#444444";
  lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + lineH * (i + 1)));
}

/**
 * 🏘️ 도트 마을 — 글을 남긴 하객 1명 = 도트 캐릭터 1명.
 * 캔버스 한 장에 모든 캐릭터를 그리고, 캐릭터를 누르면 그 하객의 메시지가 말풍선으로 뜬다.
 * 화면 밖·백그라운드 탭에서는 루프를 멈추고, 모션 줄이기 설정이면 정지 화면만 그린다.
 */
export default function PixelVillage({
  items,
  highlightId,
}: {
  /** buildFeed() 결과 — 메시지 탭과 같은 목록 */
  items: Celebration[];
  highlightId?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const walkersRef = useRef<Map<string, Walker>>(new Map());
  const spritesRef = useRef<Map<string, Sprites>>(new Map());
  const infoRef = useRef<Map<string, Info>>(new Map());
  const mineRef = useRef<string | null>(null);
  const bubbleRef = useRef<Bubble | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const drawRef = useRef<() => void>(() => {});
  /** 첫 목록을 받은 뒤부터 새로 들어온 하객은 하늘에서 떨어지며 등장한다 */
  const seededRef = useRef(false);
  const [failed, setFailed] = useState(false);

  // 캔버스 준비 + 렌더 루프 + 터치
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) {
      setFailed(true);
      return;
    }
    const rng = (rngRef.current ??= makeRng(Date.now()));
    const reduced = prefersReducedMotion();
    let scale = 3;
    let raf = 0;
    let last = 0;
    let visible = true;

    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawScene(ctx);
      const list = [...walkersRef.current.values()].sort((a, b) => a.y - b.y);
      for (const w of list) {
        const sp = spritesRef.current.get(w.id);
        if (sp) drawWalker(ctx, w, sp[frameFor(w)]);
      }
      for (const w of list) {
        const info = infoRef.current.get(w.id);
        if (info) drawTag(ctx, clipName(info.name), w.x, Math.round(w.y) + 1, w.id === mineRef.current);
      }
      const b = bubbleRef.current;
      if (b) {
        const w = walkersRef.current.get(b.id);
        const info = infoRef.current.get(b.id);
        if (w && info) drawBubble(ctx, w, info);
      }
    };
    drawRef.current = draw;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth || WORLD_W;
      scale = Math.max(2, Math.ceil((cssW * dpr) / WORLD_W));
      canvas.width = WORLD_W * scale;
      canvas.height = WORLD_H * scale;
      draw();
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(Math.max(0, (t - last) / 1000), MAX_DT);
      last = t;
      if (bubbleRef.current && t > bubbleRef.current.until) bubbleRef.current = null;
      const frozenId = bubbleRef.current?.id;
      const next = new Map<string, Walker>();
      for (const [id, w] of walkersRef.current) {
        next.set(id, stepWalker(w, dt, rng, id === frozenId));
      }
      walkersRef.current = next;
      draw();
    };

    const sync = () => {
      const shouldRun = visible && !document.hidden && !reduced;
      if (shouldRun && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * WORLD_W;
      const py = ((e.clientY - r.top) / r.height) * WORLD_H;
      const hit = pickWalkerAt(walkersRef.current.values(), px, py);
      bubbleRef.current = hit ? { id: hit.id, until: performance.now() + BUBBLE_MS } : null;
      draw();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0 }
    );
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    canvas.addEventListener("pointerdown", onPointer);
    resize();
    sync();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("pointerdown", onPointer);
      drawRef.current = () => {};
    };
  }, []);

  // 하객 목록 동기화 — 기존 캐릭터는 그대로 두고 새 하객만 추가, 사라진 하객은 제거
  useEffect(() => {
    const rng = (rngRef.current ??= makeRng(Date.now()));
    const dropFromSky = seededRef.current && !prefersReducedMotion();
    const prev = walkersRef.current;
    const next = new Map<string, Walker>();
    const ids = new Set<string>();
    for (const it of items) {
      ids.add(it.id);
      infoRef.current.set(it.id, {
        name: it.name,
        text: ((it.kind === "직접배달" ? it.review : it.message) ?? "").trim(),
      });
      if (!spritesRef.current.has(it.id)) spritesRef.current.set(it.id, bakeSprites(lookFromId(it.id)));
      next.set(it.id, prev.get(it.id) ?? spawnWalker(it.id, rng, dropFromSky));
    }
    for (const id of [...infoRef.current.keys()]) {
      if (ids.has(id)) continue;
      infoRef.current.delete(id);
      spritesRef.current.delete(id);
      if (bubbleRef.current?.id === id) bubbleRef.current = null;
    }
    walkersRef.current = next;
    mineRef.current = highlightId ?? null;
    if (items.length > 0) seededRef.current = true;
    drawRef.current();
  }, [items, highlightId]);

  return (
    <div ref={wrapRef} className="space-y-2">
      {failed && <p className="text-sm text-neutral-400 py-8">마을을 불러오지 못했어요</p>}
      <canvas
        ref={canvasRef}
        width={WORLD_W * 2}
        height={WORLD_H * 2}
        role="img"
        aria-label={`축하해 주신 ${items.length}명의 도트 마을. 캐릭터를 누르면 축하 메시지가 보여요.`}
        className={failed ? "hidden" : "block w-full h-auto rounded-sm border border-wedding-gold/20"}
        style={{ imageRendering: "pixelated" }}
      />
      {!failed && (
        <p className="text-[11px] text-neutral-400">
          {items.length === 0
            ? "아직 마을에 놀러 온 친구가 없어요 🛵"
            : "캐릭터를 눌러 축하 메시지를 읽어보세요 👆"}
        </p>
      )}
    </div>
  );
}
