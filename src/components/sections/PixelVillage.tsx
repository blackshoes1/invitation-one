"use client";

import { useEffect, useRef, useState } from "react";
import type { Celebration } from "@/lib/supabase";
import { bride, groom } from "@/lib/wedding";
import {
  BRIDE_ROW,
  GROOM_ROW,
  SHEET_SRC,
  SPRITE_H,
  SPRITE_HEAD_H,
  SPRITE_W,
  frameRect,
  lookRowFromId,
} from "@/lib/pixelSprite";
import {
  WORLD_H,
  WORLD_W,
  makeRng,
  pickWalkerAt,
  spawnNpc,
  spawnWalker,
  spriteFor,
  stepWalker,
  type Rng,
  type Walker,
} from "@/lib/villageSim";
import { layoutTags, type TagBox } from "@/lib/villageTags";

const BUBBLE_MS = 4000;
/** 아무도 말풍선을 보고 있지 않은 채로 이만큼 지나면 하객 한 명의 말풍선이 저절로 뜬다(초) */
const AUTO_BUBBLE_S = 6;
/** 탭 복귀 직후 순간이동을 막는 프레임 시간 상한(초) */
const MAX_DT = 0.05;
const TAG_MAX_CHARS = 7;
/** 이름표·말풍선 글씨는 도트 배율이 아니라 화면 해상도로 그린다 — 기준 크기(css px) */
const FONT_CSS = 11;
const BUBBLE_MAX_CSS_W = 150;
const BUBBLE_MAX_LINES = 3;
/** 아치 아래 신랑·신부를 누르면 뜨는 안내 */
const COUPLE_TEXT = "저를 누르면 사진들 볼 수 있어요!";
/** 정원 예식장 배경 — @2x 그림(768×914)을 논리 384×457 로 그린다. 걷는 영역은 villageSim.ts 의 AREA */
const BG_SRC = "/pic/village-bg.webp";

interface Bubble {
  id: string;
  /** performance.now() 기준 만료 시각 */
  until: number;
}

interface Info {
  name: string;
  text: string;
  /** 신랑·신부 — 하객 수·자동 말풍선과 무관하고 두 번 누르면 갤러리로 간다 */
  npc?: boolean;
  /** 이름표 색(없으면 하객 기본색, 내 캐릭터는 금색) */
  tagColor?: string;
  /** 이름표를 붙일 기준 x(논리 좌표) — 없으면 캐릭터 x. 나란히 선 신랑·신부 이름표가 겹치지 않게 벌릴 때 쓴다 */
  tagX?: number;
  /** 기준 x 에 이름표의 어느 쪽을 맞출지 — 기본 center */
  tagAlign?: "left" | "right" | "center";
}

/** 단상 위 신랑·신부 — 발 위치는 아치 아래 단상 바닥, 아치 중심(논리 x 약 182) 좌우로 나란히 */
const NPCS: ReadonlyArray<{ id: string; x: number; y: number; row: number; info: Info }> = [
  {
    id: "npc-groom",
    x: 162,
    y: 222,
    row: GROOM_ROW,
    info: { name: groom.name, text: COUPLE_TEXT, npc: true, tagColor: "#a8864e", tagX: 180, tagAlign: "right" },
  },
  {
    id: "npc-bride",
    x: 202,
    y: 222,
    row: BRIDE_ROW,
    info: { name: bride.name, text: COUPLE_TEXT, npc: true, tagColor: "#cf7aa3", tagX: 184, tagAlign: "left" },
  },
];

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clipName(name: string): string {
  const chars = Array.from(name);
  return chars.length > TAG_MAX_CHARS ? chars.slice(0, TAG_MAX_CHARS).join("") + "…" : name;
}

/** 배경 이미지를 못 불러왔거나 아직 로드 전이면 단색 잔디로 대신 그린다 */
function drawBackground(ctx: CanvasRenderingContext2D, bg: HTMLImageElement | null): void {
  if (bg && bg.naturalWidth > 0) {
    ctx.drawImage(bg, 0, 0, WORLD_W, WORLD_H);
    return;
  }
  ctx.fillStyle = "#9fa33c"; // 배경 그림의 잔디색(중앙값 #aea036 은 단색으로 칠하면 누렇게 보여 조금 푸르게)
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

/** 캐릭터 시트에서 (줄, 프레임)을 잘라 논리 크기로 그린다 — 시트는 @2x 이고 왼쪽·오른쪽은 따로 그려져 있다 */
function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, sheet: HTMLImageElement, row: number): void {
  const { frame } = spriteFor(w);
  const { sx, sy, sw, sh } = frameRect(row, frame);
  const dx = Math.round(w.x - SPRITE_W / 2);
  const dy = Math.round(w.y - SPRITE_H);
  ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, SPRITE_W, SPRITE_H);
}

/** 화면 해상도(캔버스 픽셀) 좌표계에서 그리는 글씨 설정 — s: 도트 배율, fp: 글자 크기(px) */
interface TextMetrics {
  s: number;
  fp: number;
  /** 캔버스 픽셀 / css 픽셀 */
  ratio: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 이름표 사각형(캔버스 픽셀) — 겹침 판정과 그리기가 같은 위치를 쓰도록 계산만 따로 한다 */
function tagRect(
  ctx: CanvasRenderingContext2D,
  t: TextMetrics,
  text: string,
  cx: number,
  footY: number,
  tagX?: number,
  align: "left" | "right" | "center" = "center"
): Rect {
  ctx.font = `${t.fp}px sans-serif`;
  const padX = Math.round(t.fp * 0.25);
  const h = Math.round(t.fp * 1.25);
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const anchor = tagX ?? cx;
  const left = align === "right" ? anchor * t.s - w : align === "left" ? anchor * t.s : anchor * t.s - w / 2;
  const x = Math.round(Math.min(WORLD_W * t.s - w - 2, Math.max(2, left)));
  const y = Math.round(Math.min(WORLD_H * t.s - h - 2, (footY + 2) * t.s));
  return { x, y, w, h };
}

/** 이름표 — 상자 없이 글씨에 흰 테두리를 둘러 어떤 배경에서도 읽히게 한다 */
function drawTag(ctx: CanvasRenderingContext2D, t: TextMetrics, text: string, r: Rect, color: string): void {
  ctx.font = `${t.fp}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, Math.round(t.fp * 0.3));
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.strokeText(text, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 1);
}

/** 둥근 사각형 경로 — ctx.roundRect 를 쓰지 않는다(구형 Safari) */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
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
  while (last && ctx.measureText(last + "…").width > maxW) last = Array.from(last).slice(0, -1).join("");
  lines[maxLines - 1] = last + "…";
  return lines;
}

function drawBubble(ctx: CanvasRenderingContext2D, t: TextMetrics, w: Walker, info: Info): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const padX = Math.round(t.fp * 0.7);
  const padY = Math.round(t.fp * 0.5);
  const lineH = Math.round(t.fp * 1.45);
  const title = clipName(info.name);
  ctx.font = `${t.fp}px sans-serif`;
  const lines = wrapText(ctx, info.text, BUBBLE_MAX_CSS_W * t.ratio, BUBBLE_MAX_LINES);
  ctx.font = `bold ${t.fp}px sans-serif`;
  let textW = ctx.measureText(title).width;
  ctx.font = `${t.fp}px sans-serif`;
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width);
  const bw = Math.ceil(textW) + padX * 2;
  const bh = (lines.length + 1) * lineH + padY * 2;
  const cw = WORLD_W * t.s;
  const x = Math.round(Math.min(cw - bw - 3, Math.max(3, w.x * t.s - bw / 2)));
  // 꼬리 끝이 머리 바로 위에 닿게 한다(시트 위쪽 투명 여백 때문에 SPRITE_H 가 아니라 실측 머리 높이를 쓴다)
  const y = Math.max(3, Math.round((w.y - SPRITE_HEAD_H - 4) * t.s - bh - t.fp * 0.6));
  const tail = Math.round(t.fp * 0.6);
  const radius = Math.round(t.fp * 0.9);
  const border = Math.max(1, Math.round(t.ratio));
  // 꼬리 밑변이 둥근 모서리 위에 얹히지 않게 모서리 안쪽으로만 움직인다(너무 좁으면 가운데)
  const tailLo = x + radius + tail;
  const tailHi = x + bw - radius - tail;
  const tailX = Math.round(tailLo > tailHi ? x + bw / 2 : Math.min(tailHi, Math.max(tailLo, w.x * t.s)));
  ctx.save();
  ctx.shadowColor = "rgba(40,30,20,0.28)";
  ctx.shadowBlur = Math.round(t.fp * 0.6);
  ctx.shadowOffsetY = Math.round(t.fp * 0.15);
  ctx.fillStyle = "#ffffff";
  roundedRectPath(ctx, x, y, bw, bh, radius);
  ctx.fill();
  ctx.restore();
  // 꼬리 — 상자와 같은 흰색으로 이어 붙인다
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(tailX - tail, y + bh - 1);
  ctx.lineTo(tailX + tail, y + bh - 1);
  ctx.lineTo(tailX, y + bh + tail);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(184,155,110,0.55)";
  ctx.lineWidth = border;
  roundedRectPath(ctx, x, y, bw, bh, radius);
  ctx.stroke();

  ctx.fillStyle = "#b89b6e";
  ctx.font = `bold ${t.fp}px sans-serif`;
  ctx.fillText(title, x + padX, y + padY);
  ctx.font = `${t.fp}px sans-serif`;
  ctx.fillStyle = "#444444";
  lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + lineH * (i + 1)));
}

/** 신랑·신부를 두 번째 눌렀을 때 — 갤러리 섹션으로 스크롤(없으면 아무 일도 하지 않는다) */
function scrollToGallery(reduced: boolean): void {
  document.getElementById("gallery")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

/**
 * 🏘️ 도트 마당 — 글을 남긴 하객 1명 = 도트 캐릭터 1명이 위에서 내려다본 정원 예식장을 앞뒤좌우로 걷는다(바람의 나라식).
 * 그림은 두 장(@2x 배경 village-bg.webp, @2x 캐릭터 시트 village-sprites.webp)이고, 하객은 id 해시로 시트의 한 줄을 고른다.
 * 단상 위에는 신랑·신부가 서 있고(누르면 안내 → 한 번 더 누르면 갤러리), 하객은 누르면 메시지 말풍선이 뜨며
 * 아무도 안 눌러도 약 6초마다 한 명의 말풍선이 저절로 뜬다.
 * 캔버스 한 장에 모두 그리고, 화면 밖·백그라운드 탭에서는 루프를 멈추며, 모션 줄이기 설정이면 정지 화면만 그린다.
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
  /** 하객·신랑·신부 id → 캐릭터 시트의 줄 */
  const rowsRef = useRef<Map<string, number>>(new Map());
  const infoRef = useRef<Map<string, Info>>(new Map());
  const mineRef = useRef<string | null>(null);
  const bubbleRef = useRef<Bubble | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const drawRef = useRef<() => void>(() => {});
  /** 첫 목록을 받은 뒤부터 새로 들어온 하객은 화면 아래에서 걸어 들어오며 등장한다 */
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
    let ratio = 3;
    let raf = 0;
    let last = 0;
    let visible = true;
    let autoClock = 0;
    let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
    let bg: HTMLImageElement | null = null;
    let sheet: HTMLImageElement | null = null;

    const draw = () => {
      // 1) 도트 세계 — 배경과 캐릭터(아래쪽 캐릭터가 위쪽을 가린다)
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      // 배경·캐릭터 모두 @2x 그림을 줄이거나 늘려 그리므로 보간한다
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawBackground(ctx, bg);
      const list = [...walkersRef.current.values()].sort((a, b) => a.y - b.y);
      if (!sheet) return; // 시트가 오기 전에는 이름표만 허공에 뜨지 않게 글씨도 그리지 않는다
      for (const w of list) {
        const row = rowsRef.current.get(w.id);
        if (row !== undefined) drawWalker(ctx, w, sheet, row);
      }
      // 2) 글씨 — 화면 해상도로 그려 또렷하게
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const t: TextMetrics = { s: scale, fp: Math.round(FONT_CSS * ratio), ratio };
      // 이름표끼리 겹치면 앞사람 것만 남기고 나머지는 숨긴다(눌러서 말풍선 제목으로 볼 수 있다)
      const boxes: TagBox[] = [];
      const meta = new Map<string, { text: string; color: string; rect: Rect }>();
      for (const w of list) {
        const info = infoRef.current.get(w.id);
        if (!info || w.y > WORLD_H) continue; // 아직 화면 아래 바깥에서 올라오는 중이면 이름표도 숨긴다
        const text = clipName(info.name);
        const color = info.tagColor ?? (w.id === mineRef.current ? "#a8864e" : "#3b2d22");
        const rect = tagRect(ctx, t, text, w.x, w.y, info.tagX, info.tagAlign);
        const priority = info.npc ? 1e9 : w.id === mineRef.current ? 1e8 : w.y;
        boxes.push({ id: w.id, ...rect, priority });
        meta.set(w.id, { text, color, rect });
      }
      // 붙어 있으면 흰 테두리가 맞닿아 뭉쳐 보이므로 1css px 만 띄운다
      const shown = layoutTags(boxes, Math.round(ratio));
      for (const w of list) {
        const m = meta.get(w.id);
        if (m && shown.has(w.id)) drawTag(ctx, t, m.text, m.rect, m.color);
      }
      const b = bubbleRef.current;
      if (b) {
        const w = walkersRef.current.get(b.id);
        const info = infoRef.current.get(b.id);
        if (w && info) drawBubble(ctx, t, w, info);
      }
    };
    drawRef.current = draw;

    const img = new Image();
    img.onload = () => {
      bg = img;
      draw();
    };
    img.src = BG_SRC;
    const sheetImg = new Image();
    sheetImg.onload = () => {
      sheet = sheetImg;
      draw();
    };
    // 캐릭터 시트가 없으면 마을이 의미가 없다 — 폴백 문구를 보여 준다(배경만 없을 때는 단색 잔디로 계속 그린다)
    sheetImg.onerror = () => setFailed(true);
    sheetImg.src = SHEET_SRC;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth || WORLD_W;
      scale = Math.max(1, Math.ceil((cssW * dpr) / WORLD_W));
      canvas.width = WORLD_W * scale;
      canvas.height = WORLD_H * scale;
      ratio = canvas.width / cssW;
      draw();
    };

    /** 말풍선이 없을 때 메시지가 있는 하객 한 명을 무작위로 골라 띄운다 */
    const showAutoBubble = (now: number) => {
      const candidates = [...infoRef.current.entries()].filter(([id, info]) => {
        const w = walkersRef.current.get(id);
        return !info.npc && !!info.text && !!w && !w.entering;
      });
      if (candidates.length === 0) return;
      const [id] = candidates[Math.floor(rng() * candidates.length)];
      bubbleRef.current = { id, until: now + BUBBLE_MS };
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(Math.max(0, (t - last) / 1000), MAX_DT);
      last = t;
      if (bubbleRef.current && t > bubbleRef.current.until) bubbleRef.current = null;
      if (!bubbleRef.current) {
        autoClock += dt;
        if (autoClock >= AUTO_BUBBLE_S) {
          autoClock = 0;
          showAutoBubble(t);
        }
      }
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
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * WORLD_W;
      const py = ((e.clientY - r.top) / r.height) * WORLD_H;
      const hit = pickWalkerAt(walkersRef.current.values(), px, py);
      const current = bubbleRef.current;
      // 신랑·신부의 안내 말풍선이 떠 있을 때 다시 누르면 갤러리로 간다
      if (hit && current && current.id === hit.id && infoRef.current.get(hit.id)?.npc) {
        clearTimeout(bubbleTimer);
        bubbleRef.current = null;
        draw();
        scrollToGallery(reduced);
        return;
      }
      autoClock = 0;
      const bubble: Bubble | null = hit ? { id: hit.id, until: performance.now() + BUBBLE_MS } : null;
      bubbleRef.current = bubble;
      // 루프가 멈춘 상태(모션 줄이기)에서도 말풍선이 닫히도록 별도 타이머를 둔다
      clearTimeout(bubbleTimer);
      if (bubble) {
        bubbleTimer = setTimeout(() => {
          if (bubbleRef.current !== bubble) return;
          bubbleRef.current = null;
          draw();
        }, BUBBLE_MS);
      }
      draw();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
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
      clearTimeout(bubbleTimer);
      img.onload = null;
      sheetImg.onload = null;
      sheetImg.onerror = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("pointerdown", onPointer);
      drawRef.current = () => {};
    };
  }, []);

  // 하객 목록 동기화 — 기존 캐릭터는 그대로 두고 새 하객만 추가, 사라진 하객은 제거. 신랑·신부는 항상 단상에 둔다.
  useEffect(() => {
    const rng = (rngRef.current ??= makeRng(Date.now()));
    const entering = seededRef.current && !prefersReducedMotion();
    const prev = walkersRef.current;
    const next = new Map<string, Walker>();
    const ids = new Set<string>(NPCS.map((n) => n.id));
    for (const n of NPCS) {
      infoRef.current.set(n.id, n.info);
      rowsRef.current.set(n.id, n.row);
      next.set(n.id, prev.get(n.id) ?? spawnNpc(n.id, n.x, n.y));
    }
    for (const it of items) {
      ids.add(it.id);
      infoRef.current.set(it.id, {
        name: it.name,
        text: ((it.kind === "직접배달" ? it.review : it.message) ?? "").trim(),
      });
      rowsRef.current.set(it.id, lookRowFromId(it.id));
      next.set(it.id, prev.get(it.id) ?? spawnWalker(it.id, rng, entering));
    }
    for (const id of [...infoRef.current.keys()]) {
      if (ids.has(id)) continue;
      infoRef.current.delete(id);
      rowsRef.current.delete(id);
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
      {/* 384px 그림을 줄여 보이므로 image-rendering: pixelated 를 쓰지 않는다 — 줄일 때 도트가 불규칙하게 빠져 들쭉날쭉해진다 */}
      <canvas
        ref={canvasRef}
        width={WORLD_W * 2}
        height={WORLD_H * 2}
        role="img"
        aria-label={`축하해 주신 ${items.length}명의 도트 마을. 신랑·신부와 하객 캐릭터를 누르면 말풍선이 보여요.`}
        className={failed ? "hidden" : "block w-full h-auto rounded-sm border border-wedding-gold/20 touch-manipulation"}
      />
      {!failed && (
        <p className="text-[11px] text-neutral-400">
          {items.length === 0
            ? "아직 마당에 놀러 온 하객이 없어요 🛵"
            : "하객을 눌러 축하 메시지를 읽어보세요 👆 신랑·신부를 두 번 누르면 사진으로 가요"}
        </p>
      )}
    </div>
  );
}
