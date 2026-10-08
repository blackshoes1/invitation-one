// ChatGPT 가 그린 캐릭터 시트를 12열 @2x 시트(public/pic/village-sprites.webp)로 바꾼다.
// 원본은 저장소에 넣지 않는다(village-src/ 는 .gitignore). sharp 는 Next 가 깔아 둔 것을 쓴다.
// 배경 그림은 따로 만든다: npm run village:bg (ingest-bg.mjs)
//
// 원본 두 종류 (배치는 LAYOUTS, 한 사람 = 블록 하나 = 프레임 3열 × 4줄):
//  - 하객: village-src/dot_img1.png, dot_img2.png … (이름 순, 1장에 4×2 블록 = 8명, 모두 하객)
//  - 신랑·신부: village-src/couple.png (2×1 블록: 왼쪽 신랑, 오른쪽 신부) — 꼭 있어야 한다
//
// 다시 만들 때 (순서대로):
//  (a) 원본을 위 이름으로 village-src/ 에 둔다. 배치가 LAYOUTS 와 다르면 sliceSource 가 `프레임 열이 N개가 아니다` 로 멈춘다.
//  (b) npm run village:ingest 를 돌리고 찍히는 `guests N` 을 src/lib/pixelSprite.ts 의 GUEST_LOOKS 에 손으로 맞춘다
//      (안 맞추면 시트 줄 수와 어긋나 tests/unit/pixelSprite.test.ts 가 깨진다).
//  (c) 출력의 `scale guests` 는 하객 배율, `couple` 은 신랑·신부 배율(머리 폭을 하객에 맞춤)이다. `fit` 이 1 보다 작으면
//      프레임에 들어가게 그만큼 더 줄였다는 뜻이니 연락표로 크기를 확인한다.
//  (d) 용량 예산 1.2MB — 줄이 늘면 손실 압축 품질을 q90 → q85 → q80 → q75 로 내린다(출력의 webp 모드 확인).
//  MIRROR_RIGHT·FRAME_OVERRIDES 는 원본 파일·블록 번호가 바뀌면 다시 눈으로 확인해 고친다(안 맞는 항목은 오류로 알려 준다).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodePng } from "./png.mjs";

export const SHEET_SCALE = 2;
export const FRAME_W = 40 * SHEET_SCALE;
export const FRAME_H = 64 * SHEET_SCALE;
export const COLUMNS = [
  "down_idle", "down_walk1", "down_walk2",
  "up_idle", "up_walk1", "up_walk2",
  "left_idle", "left_walk1", "left_walk2",
  "right_idle", "right_walk1", "right_walk2",
];

// 원본 종류별 배치. blocksX × blocksY 블록, 블록 하나 = 프레임 3열 × 4줄. roles 가 있으면 블록 번호 순서대로 그 역할이다.
// frames = 한 줄의 원본 프레임(왼→오)이 무슨 동작인지(다리를 보고 정함). 블록 번호 = 읽기 순서(왼→오, 위→아래).
// 사람(블록) 키는 `${source}:${block}`, source = 하객 시트 이름순 번호(0~) 또는 "couple".
export const LAYOUTS = {
  guests: { blocksX: 4, blocksY: 2, frames: ["walk1", "idle", "walk2"] }, // 가운데가 서 있는 모습
  couple: { blocksX: 2, blocksY: 1, frames: ["idle", "walk1", "walk2"], roles: ["groom", "bride"] }, // 첫 프레임이 서 있는 모습(옆·뒤 줄이 뚜렷)
};

// 오른쪽 줄(3줄)이 옆모습이 아니게 그려진 블록 — 그 사람만 왼쪽 줄을 좌우 반전해 오른쪽으로 쓴다(눈으로 확인한 목록).
// 그 밖의 사람은 원본대로(반전하지 않음). 원본 그대로 쓰려면 여기서 빼면 된다.
export const MIRROR_RIGHT = [
  { source: 1, block: 5 }, // dot_img2 라벤더 드레스 — 뒷모습
  { source: 2, block: 5 }, // dot_img3 안경 쓴 검은 정장 — 뒷모습
  { source: 0, block: 7 }, // dot_img1 은발 할아버지 — 서 있는 3/4 뒷모습
  { source: 1, block: 6 }, // dot_img2 은발 할아버지 — 서 있는 3/4 뒷모습
  { source: 2, block: 7 }, // dot_img3 은발 할아버지 — 서 있는 3/4 뒷모습
  { source: 3, block: 4 }, // dot_img4 은발 할아버지 — 서 있는 3/4 앞모습
];

// 한 프레임만 반대쪽을 보게 그려진 경우 — 그 프레임을 다른 프레임의 반전으로 바꾼다(눈으로 확인한 목록).
// frame·from 은 시트 열 이름(`${view}_${anim}`). MIRROR_RIGHT 적용 뒤의 프레임을 기준으로 한다.
export const FRAME_OVERRIDES = [
  // dot_img4 조끼 소년: 왼쪽 줄 걷기1 은 오른쪽을, 오른쪽 줄 걷기2 는 왼쪽을 본다
  { source: 3, block: 6, frame: "left_walk1", from: "right_walk1", mirror: true },
  { source: 3, block: 6, frame: "right_walk2", from: "left_walk2", mirror: true },
];

// 원본 한 블록 안 줄 순서(1줄 앞, 2줄 왼쪽, 3줄 오른쪽, 4줄 뒤) → 시트 방향
const SOURCE_VIEWS = ["down", "left", "right", "up"];
// 사람마다 방향별 프레임 3개를 이 순서(걷기1·정지·걷기2)로 들고 다닌다 — 하객 원본 순서와 같다. 시트 열은 idle·walk1·walk2 순
const SOURCE_FRAME_OF = { idle: 1, walk1: 0, walk2: 2 };

const ALPHA_BODY = 160; // 덩어리 찾기: 옅은 번짐이 이웃을 이어 붙이지 않게 높게
const ALPHA_KEEP = 48; // 이보다 옅은 픽셀은 번짐으로 보고 지운다
const ALPHA_SOLID = 128; // 발끝·폭을 잴 때 쓰는 "몸" 기준
const FOOT_GAP = 4; // 발끝을 프레임 아래에서 이만큼 띄운다
const MAX_FRONT_H = 120; // 가장 큰 앞모습이 들어갈 높이
const SIDE_MARGIN = 2; // 좌우 1px 이상 비워 둔다(이웃 프레임 번짐 방지)
const CORR_LIMIT = 0.15; // 방향별 배율 보정 한도 ±15%

/** 알파 >= alphaMin 픽셀의 4방향 연결 성분. 재귀 대신 스택(큰 이미지에서 호출 깊이 초과 방지). */
function labelComponents(rgba, width, height, alphaMin) {
  const labels = new Int32Array(width * height).fill(-1);
  const comps = [];
  const stack = [];
  for (let s = 0; s < width * height; s++) {
    if (labels[s] >= 0 || rgba[s * 4 + 3] < alphaMin) continue;
    const c = { x0: width, y0: height, x1: -1, y1: -1, area: 0, maxAlpha: 0 };
    labels[s] = comps.length;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      const x = p % width, y = (p - x) / width;
      c.area++;
      c.maxAlpha = Math.max(c.maxAlpha, rgba[p * 4 + 3]);
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of next) {
        if (q >= 0 && labels[q] < 0 && rgba[q * 4 + 3] >= alphaMin) { labels[q] = comps.length; stack.push(q); }
      }
    }
    comps.push(c);
  }
  return { labels, comps };
}

export function findComponents(rgba, width, height, { alphaMin }) {
  return labelComponents(rgba, width, height, alphaMin).comps.map(({ x0, y0, x1, y1, area }) => ({ x0, y0, x1, y1, area }));
}

/** 겹치는 [a,b] 구간을 합친다 */
function mergeRuns(intervals) {
  const out = [];
  for (const [a, b] of [...intervals].sort((p, q) => p[0] - q[0])) {
    if (out.length && a <= out[out.length - 1][1] + 1) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

/** 한 프레임 열에서 위아래 프레임 n개(블록 줄 수 × 4줄)를 가르는 컷 n-1개 — 불투명 픽셀이 가장 적은 높이를 고른다.
 *  위아래 프레임이 발끝·머리로 맞닿는 곳이 있어 성분만으로는 못 가른다. */
function rowCuts(rgba, W, H, a, b, n) {
  const prof = new Int32Array(H);
  for (let y = 0; y < H; y++) for (let x = a; x <= b; x++) if (rgba[(y * W + x) * 4 + 3] >= ALPHA_BODY) prof[y]++;
  const pitch = H / n, minH = Math.round(pitch * 0.74), maxH = Math.round(pitch * 1.37);
  const K = n - 1, INF = Infinity;
  const dp = Array.from({ length: K }, () => new Float64Array(H).fill(INF));
  const from = Array.from({ length: K }, () => new Int32Array(H).fill(-1));
  for (let c = minH; c <= maxH && c < H; c++) dp[0][c] = prof[c];
  for (let k = 1; k < K; k++) {
    for (let c = 0; c < H; c++) {
      for (let p = Math.max(0, c - maxH); p <= c - minH; p++) {
        const v = dp[k - 1][p] + prof[c];
        if (v < dp[k][c]) { dp[k][c] = v; from[k][c] = p; }
      }
    }
  }
  let last = -1;
  for (let c = H - maxH; c <= H - minH; c++) if (last < 0 || dp[K - 1][c] < dp[K - 1][last]) last = c;
  if (last < 0 || dp[K - 1][last] === INF) throw new Error(`프레임 줄을 가를 수 없다 (x ${a}-${b})`);
  const cuts = [last];
  for (let k = K - 1; k > 0; k--) cuts.unshift(from[k][cuts[0]]);
  // 빈 줄 위의 컷은 빈 구간 가운데로 옮긴다
  return cuts.map((c) => {
    if (prof[c] > 0) return c;
    let lo = c, hi = c;
    while (lo > 0 && prof[lo - 1] === 0) lo--;
    while (hi < H - 1 && prof[hi + 1] === 0) hi++;
    return (lo + hi) >> 1;
  });
}

/** 컷 근처 띠에서 불투명 픽셀을 가장 적게 지나는 가로 이음선(x 마다 y). 맞닿은 발끝·머리를 직선보다 덜 자른다. */
function seamAround(rgba, W, a, b, cut, band = 18) {
  const n = b - a + 1, h = band * 2 + 1;
  const cost = (x, i) => (rgba[((cut + i - band) * W + x) * 4 + 3] >= ALPHA_BODY ? 1 : 0) + Math.abs(i - band) * 0.001;
  let prev = Float64Array.from({ length: h }, (_, i) => cost(a, i));
  const back = [];
  for (let k = 1; k < n; k++) {
    const cur = new Float64Array(h), bk = new Int8Array(h);
    for (let i = 0; i < h; i++) {
      let best = prev[i], step = 0;
      if (i > 0 && prev[i - 1] < best) { best = prev[i - 1]; step = -1; }
      if (i < h - 1 && prev[i + 1] < best) { best = prev[i + 1]; step = 1; }
      cur[i] = best + cost(a + k, i);
      bk[i] = step;
    }
    back.push(bk);
    prev = cur;
  }
  let i = 0;
  for (let j = 1; j < h; j++) if (prev[j] < prev[i]) i = j;
  const ys = new Int32Array(n);
  ys[n - 1] = cut + i - band;
  for (let k = n - 1; k > 0; k--) { i += back[k - 1][i]; ys[k - 1] = cut + i - band; }
  return ys;
}

/** 원본 한 장 → blocks[블록][4줄][3프레임] 크롭 { w, h, rgba, colX(원본 열 중심의 크롭 안 x) }. 배치는 layout(LAYOUTS 의 하나) */
export function sliceSource(src, layout) {
  const { width: W, height: H } = src;
  const nCols = layout.blocksX * 3, nRows = layout.blocksY * 4;
  const rgba = Uint8Array.from(src.rgba);
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < ALPHA_KEEP) rgba[i - 3] = rgba[i - 2] = rgba[i - 1] = rgba[i] = 0;

  const big = findComponents(rgba, W, H, { alphaMin: ALPHA_BODY }).filter((c) => c.area >= 1500);
  const cols = mergeRuns(big.map((c) => [c.x0, c.x1]));
  if (cols.length !== nCols) throw new Error(`프레임 열이 ${nCols}개가 아니다: ${cols.length}`);

  const blocks = Array.from({ length: layout.blocksX * layout.blocksY }, () => Array.from({ length: 4 }, () => new Array(3)));
  cols.forEach(([a, b], ci) => {
    const xa = ci === 0 ? 0 : ((cols[ci - 1][1] + a) >> 1) + 1;
    const xb = ci === nCols - 1 ? W - 1 : (b + cols[ci + 1][0]) >> 1;
    const seams = rowCuts(rgba, W, H, a, b, nRows).map((cut) => seamAround(rgba, W, a, b, cut));
    const seamY = (s, x) => s[Math.min(Math.max(x - a, 0), b - a)];
    for (let seg = 0; seg < nRows; seg++) {
      const top = (x) => (seg === 0 ? 0 : seamY(seams[seg - 1], x) + 1);
      const bot = (x) => (seg === nRows - 1 ? H - 1 : seamY(seams[seg], x));
      let y0 = H, y1 = 0;
      for (let x = xa; x <= xb; x++) { y0 = Math.min(y0, top(x)); y1 = Math.max(y1, bot(x)); }
      // 칸(이음선 사이)만 남긴 지역 버퍼
      const cw = xb - xa + 1, ch = y1 - y0 + 1, cell = new Uint8Array(cw * ch * 4);
      for (let x = xa; x <= xb; x++) {
        for (let y = top(x); y <= bot(x); y++) {
          const s = (y * W + x) * 4, d = ((y - y0) * cw + (x - xa)) * 4;
          cell[d] = rgba[s]; cell[d + 1] = rgba[s + 1]; cell[d + 2] = rgba[s + 2]; cell[d + 3] = rgba[s + 3];
        }
      }
      const crop = cleanCrop(cell, cw, ch, (a + b + 1) / 2 - xa);
      // 원본 가장자리에 닿은 프레임은 원본에서 이미 잘렸을 수 있다 — 보고만 한다
      crop.touchesEdge = xa + crop.ox === 0 || xa + crop.ox + crop.w === W || y0 + crop.oy === 0 || y0 + crop.oy + crop.h === H;
      blocks[(seg >> 2) * layout.blocksX + Math.floor(ci / 3)][seg & 3][ci % 3] = crop;
    }
  });
  return blocks;
}

/** 칸 안의 먼지(작거나 옅기만 한 조각)를 지우고 남은 픽셀의 경계 상자로 자른다. 꽃 장식처럼 떨어진 조각은 남긴다. */
function cleanCrop(cell, cw, ch, colX) {
  const { labels, comps } = labelComponents(cell, cw, ch, ALPHA_KEEP);
  const keep = comps.map((c) => c.area >= 12 && c.maxAlpha >= ALPHA_BODY);
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  comps.forEach((c, i) => {
    if (!keep[i]) return;
    x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1);
  });
  if (x1 < 0) throw new Error("빈 프레임");
  const w = x1 - x0 + 1, h = y1 - y0 + 1, rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y + y0) * cw + (x + x0), l = labels[p];
      if (l < 0 || !keep[l]) continue;
      rgba.set(cell.subarray(p * 4, p * 4 + 4), (y * w + x) * 4);
    }
  }
  return { w, h, rgba, colX: colX - x0, ox: x0, oy: y0 };
}

function mirror(crop) {
  const { w, h } = crop, rgba = new Uint8Array(crop.rgba.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(crop.rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (y * w + (w - 1 - x)) * 4);
  return { w, h, rgba, colX: w - crop.colX };
}

/** 몸(알파 >= 128) 경계 상자와 머리 폭(위 40% 구간의 가장 넓은 가로폭) */
function measure({ w, h, rgba }) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  const rowMin = new Int32Array(h).fill(w), rowMax = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] < ALPHA_SOLID) continue;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  let head = 0;
  for (let y = y0; y < y0 + (y1 - y0 + 1) * 0.4; y++) if (rowMax[y] >= 0) head = Math.max(head, rowMax[y] - rowMin[y] + 1);
  return { x0, x1, y0, y1, bw: x1 - x0 + 1, bh: y1 - y0 + 1, head, cx: (x0 + x1 + 1) / 2 };
}

/** 넓이 평균 리샘플(알파 곱한 색으로 섞어 가장자리에 검은 테가 생기지 않게) */
function resample(crop, s) {
  const { w: sw, h: sh, rgba } = crop;
  const dw = Math.max(1, Math.round(sw * s)), dh = Math.max(1, Math.round(sh * s));
  const weights = (sn, dn) => {
    const r = sn / dn, out = [];
    for (let d = 0; d < dn; d++) {
      const lo = d * r, hi = (d + 1) * r, taps = [];
      for (let i = Math.floor(lo); i < Math.min(sn, Math.ceil(hi)); i++) taps.push([i, (Math.min(hi, i + 1) - Math.max(lo, i)) / r]);
      out.push(taps);
    }
    return out;
  };
  const wx = weights(sw, dw), wy = weights(sh, dh);
  const tmp = new Float64Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let d = 0; d < dw; d++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [i, k] of wx[d]) {
        const o = (y * sw + i) * 4, al = rgba[o + 3] * k;
        r += rgba[o] * al; g += rgba[o + 1] * al; b += rgba[o + 2] * al; a += al;
      }
      const t = (y * dw + d) * 4;
      tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b; tmp[t + 3] = a;
    }
  }
  const out = new Uint8Array(dw * dh * 4);
  for (let d = 0; d < dh; d++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [i, k] of wy[d]) {
        const t = (i * dw + x) * 4;
        r += tmp[t] * k; g += tmp[t + 1] * k; b += tmp[t + 2] * k; a += tmp[t + 3] * k;
      }
      const o = (d * dw + x) * 4;
      if (a < ALPHA_KEEP) continue; // 리샘플로 새로 생긴 옅은 가장자리도 번짐 규칙대로 지운다
      out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round(a);
    }
  }
  return { w: dw, h: dh, rgba: out, colX: crop.colX * (dw / sw) };
}

/**
 * views({ down|up|left|right: 원본 순서 프레임 3개 })에 그 사람의 프레임 덮어쓰기를 적용한 새 객체.
 * 원본 프레임은 바꾸지 않고, 목록에 없는 프레임은 같은 객체를 그대로 둔다. 바꿀 원본은 덮어쓰기 전 상태에서 가져온다.
 */
export function applyFrameOverrides(views, overrides) {
  const pick = (name) => {
    const [view, anim] = name.split("_");
    if (!views[view] || !(anim in SOURCE_FRAME_OF)) throw new Error(`알 수 없는 프레임: ${name}`);
    return [view, SOURCE_FRAME_OF[anim]];
  };
  const out = Object.fromEntries(Object.entries(views).map(([v, frames]) => [v, [...frames]]));
  for (const o of overrides) {
    const [tv, ti] = pick(o.frame), [fv, fi] = pick(o.from);
    const src = views[fv][fi];
    out[tv][ti] = o.mirror ? mirror(src) : src;
  }
  return out;
}

const median = (xs) => [...xs].sort((p, q) => p - q)[xs.length >> 1];
const key = ({ source, block }) => `${source}:${block}`;

/**
 * 원본들 → 12열 시트. sources = [{ id, layout, image }] (id 는 사람 키의 source).
 * 줄 순서: 하객(원본 순서 → 블록 읽기 순서) → 신랑 → 신부. 같은 사람의 4방향은 머리 폭으로 크기를 맞춘다(앞모습 기준, ±15%).
 * 하객은 공통 배율 하나(아이는 작게 남는다). 신랑·신부는 따로 그린 시트라 그림 크기가 달라 둘이 함께 쓰는 배율을 따로 둔다:
 * 앞모습 머리 폭(둘의 평균)이 하객 머리 폭 중앙값과 같게, 프레임에 안 들어가면 더 줄인다. 하객 배율은 신랑·신부와 무관하다.
 */
export function buildSheet(sources, { mirrorRight = MIRROR_RIGHT, frameOverrides = FRAME_OVERRIDES, slice = sliceSource } = {}) {
  const mirrorKeys = new Set(mirrorRight.map(key));
  const people = [];
  for (const { id: source, layout, image } of sources) {
    slice(image, layout).forEach((rows, block) => {
      // 원본 프레임 순서(layout.frames)를 공통 순서(SOURCE_FRAME_OF)로 바꿔 둔다 — 덮어쓰기·배치는 이 순서만 안다
      const views = {};
      rows.forEach((frames, r) => {
        const out = new Array(3);
        layout.frames.forEach((anim, i) => { out[SOURCE_FRAME_OF[anim]] = frames[i]; });
        views[SOURCE_VIEWS[r]] = out;
      });
      if (mirrorKeys.has(key({ source, block }))) views.right = views.left.map(mirror);
      const mine = frameOverrides.filter((o) => key(o) === key({ source, block }));
      people.push({ source, block, role: layout.roles?.[block] ?? "guest", views: mine.length ? applyFrameOverrides(views, mine) : views });
    });
  }
  // 원본이 바뀌어 어느 블록에도 안 맞는 항목은 조용히 무시되면 그림이 어긋난 채로 굳으므로 바로 멈춘다
  const known = new Set(people.map(key));
  for (const [label, list] of [["MIRROR_RIGHT", mirrorRight], ["FRAME_OVERRIDES", frameOverrides]]) {
    const bad = list.find((e) => !known.has(key(e)));
    if (bad) throw new Error(`${label} 항목이 어느 블록에도 맞지 않는다: ${key(bad)} (원본 ${sources.map((s) => s.id).join(", ")})`);
  }
  const guests = people.filter((p) => p.role === "guest");
  const couple = ["groom", "bride"].map((role) => {
    const found = people.filter((p) => p.role === role);
    if (found.length !== 1) throw new Error(`신랑·신부 블록이 맞지 않는다: ${role} ${found.length}개 (village-src/couple.png 를 확인)`);
    return found[0];
  });
  const ordered = [...guests, ...couple];

  // 방향별 보정: 앞모습 머리 폭 / 그 방향 머리 폭 (3프레임 중앙값)
  const report = { capped: [], clamped: [], edge: [], limitBy: "", targetHead: 0, coupleFit: 1, coupleLimitBy: "" };
  for (const p of ordered) {
    for (const [v, frames] of Object.entries(p.views)) if (frames.some((f) => f.touchesEdge)) report.edge.push(`${key(p)} ${v}`);
  }
  for (const p of ordered) {
    const headOf = (v) => median(p.views[v].map((f) => measure(f).head));
    const front = headOf("down");
    p.corr = {};
    for (const v of ["down", "up", "left", "right"]) {
      const raw = front / headOf(v);
      const c = Math.min(1 + CORR_LIMIT, Math.max(1 - CORR_LIMIT, raw));
      if (c !== raw) report.capped.push(`${key(p)} ${v} ${raw.toFixed(3)}→${c.toFixed(2)}`);
      p.corr[v] = c;
    }
  }

  // 모든 프레임이 폭·높이 안에 들어가는 가장 큰 배율 [값, 기준]. frontH 면 가장 큰 앞모습도 120px 로 묶는다(하객 크기 기준)
  const fitScale = (list, frontH) => {
    const limits = [];
    for (const p of list) {
      for (const [v, frames] of Object.entries(p.views)) {
        for (const f of frames) {
          const m = measure(f);
          const who = `${key(p)} ${v}`;
          if (frontH && v === "down") limits.push([MAX_FRONT_H / m.bh, `앞모습 높이 ${who}`]);
          limits.push([(FRAME_W - 2 * SIDE_MARGIN) / (m.bw * p.corr[v]), `폭 ${who}`]);
          limits.push([(FRAME_H - FOOT_GAP - 2) / (m.bh * p.corr[v]), `높이 ${who}`]);
        }
      }
    }
    return limits.reduce((p, q) => (q[0] < p[0] ? q : p));
  };
  const [scale, limitBy] = fitScale(guests, true);
  report.limitBy = limitBy;

  // 신랑·신부 배율: 앞모습 머리 폭을 하객(배율 적용 뒤) 중앙값에 맞추고, 프레임에 안 들어가면 그 한도로 줄인다
  const frontHead = (p) => median(p.views.down.map((f) => measure(f).head));
  const targetHead = median(guests.map((p) => frontHead(p) * scale));
  const headScale = targetHead / (couple.reduce((s, p) => s + frontHead(p), 0) / couple.length);
  const [coupleFitScale, coupleFitBy] = fitScale(couple, false);
  const coupleScale = Math.min(headScale, coupleFitScale);
  report.targetHead = targetHead;
  report.coupleFit = Math.min(1, coupleFitScale / headScale);
  report.coupleLimitBy = coupleFitScale < headScale ? coupleFitBy : "머리 폭";

  const width = FRAME_W * COLUMNS.length, height = FRAME_H * ordered.length;
  const rgba = new Uint8Array(width * height * 4);
  ordered.forEach((p, row) => {
    const s = p.role === "guest" ? scale : coupleScale;
    for (const v of ["down", "up", "left", "right"]) {
      const frames = p.views[v].map((f) => resample(f, s * p.corr[v]));
      const ms = frames.map(measure);
      // 원본 열 중심을 공통 기준으로 삼아 3프레임의 흔들림은 그대로 두고, 몸 중심 중앙값을 프레임 가운데로
      const m = median(ms.map((mm, i) => mm.cx - frames[i].colX));
      for (const anim of ["idle", "walk1", "walk2"]) {
        const i = SOURCE_FRAME_OF[anim], f = frames[i], mm = ms[i];
        let dx = Math.round(FRAME_W / 2 - m - f.colX);
        const lo = 1 - mm.x0, hi = FRAME_W - 2 - mm.x1;
        if (dx < lo || dx > hi) { report.clamped.push(`${key(p)} ${v}_${anim}`); dx = Math.min(hi, Math.max(lo, dx)); }
        const dy = FRAME_H - 1 - FOOT_GAP - mm.y1;
        const col = COLUMNS.indexOf(`${v}_${anim}`);
        for (let y = 0; y < f.h; y++) {
          const ty = dy + y;
          if (ty < 0 || ty >= FRAME_H) continue;
          for (let x = 0; x < f.w; x++) {
            const tx = dx + x, s = (y * f.w + x) * 4;
            if (tx < 0 || tx >= FRAME_W || f.rgba[s + 3] === 0) continue;
            rgba.set(f.rgba.subarray(s, s + 4), ((row * FRAME_H + ty) * width + col * FRAME_W + tx) * 4);
          }
        }
      }
    }
  });

  return {
    width, height, rgba,
    rows: ordered.map(({ source, block, role }) => ({ source, block, role })),
    guests: guests.length,
    scale, coupleScale, report,
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const srcDir = path.join(root, "village-src");
  const noSource = () => new Error(`원본이 없다: ${srcDir}/dot_img*.png`);
  let names;
  try { names = readdirSync(srcDir); } catch { throw noSource(); } // 폴더 자체가 없어도 같은 안내로
  const files = names.filter((f) => /^dot_img\d+\.png$/.test(f)).sort((p, q) => p.localeCompare(q, "en", { numeric: true }));
  if (!files.length) throw noSource();
  // 신랑·신부는 전용 시트에서만 온다 — 없으면 하객 중 한 명으로 대신하지 않고 멈춘다
  if (!names.includes("couple.png")) throw new Error(`신랑·신부 원본이 없다: ${srcDir}/couple.png (왼쪽 신랑·오른쪽 신부, 각 3열 × 4줄)`);
  const read = (f) => decodePng(readFileSync(path.join(srcDir, f)));
  const sources = [
    ...files.map((f, i) => ({ id: i, layout: LAYOUTS.guests, image: read(f) })),
    { id: "couple", layout: LAYOUTS.couple, image: read("couple.png") },
  ];
  const sheet = buildSheet(sources);

  const { default: sharp } = await import("sharp");
  const raw = () => sharp(Buffer.from(sheet.rgba.buffer, sheet.rgba.byteOffset, sheet.rgba.length), { raw: { width: sheet.width, height: sheet.height, channels: 4 } });
  const LIMIT = 1.2 * 1024 * 1024;
  // 무손실 → 거의 무손실 → 품질을 낮춘 손실 순으로 용량 예산에 맞춘다
  const tries = [
    ["lossless", { lossless: true, effort: 6 }],
    ["nearLossless q90", { nearLossless: true, quality: 90, effort: 6 }],
    ...[90, 85, 80, 75].map((q) => [`lossy q${q}`, { quality: q, alphaQuality: 100, effort: 6 }]),
  ];
  let out, mode;
  for (const [name, opts] of tries) {
    mode = name;
    out = await raw().webp(opts).toBuffer();
    console.log(`  webp ${name}: ${out.length} bytes`);
    if (out.length <= LIMIT) break;
  }
  if (out.length > LIMIT) throw new Error(`용량 초과: ${out.length} bytes`);
  const dest = path.join(root, "public", "pic", "village-sprites.webp");
  writeFileSync(dest, out);
  console.log(`sources ${files.join(", ")} + couple.png`);
  console.log(`scale guests ${sheet.scale.toFixed(4)} (기준: ${sheet.report.limitBy})  rows ${sheet.rows.length}  guests ${sheet.guests} (GUEST_LOOKS)`);
  console.log(`scale couple ${sheet.coupleScale.toFixed(4)} (머리 폭 ${sheet.report.targetHead.toFixed(1)}px 에 맞춤, fit ${sheet.report.coupleFit.toFixed(3)}, 기준: ${sheet.report.coupleLimitBy})`);
  console.log(`village-sprites.webp  ${sheet.width}x${sheet.height}  ${out.length} bytes  (${mode})`);
  if (sheet.report.capped.length) console.log(`보정 한도(±15%)에 걸림: ${sheet.report.capped.join(", ")}`);
  if (sheet.report.edge.length) console.log(`원본 가장자리에 닿음(원본에서 잘렸을 수 있음): ${sheet.report.edge.join(", ")}`);
  if (sheet.report.clamped.length) console.log(`프레임 밖으로 나가 위치를 당김: ${sheet.report.clamped.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
