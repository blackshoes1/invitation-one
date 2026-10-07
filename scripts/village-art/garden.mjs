// 도트 마당 배경 — 위에서 내려다본 정원 예식장(384×352)을 코드로 그려 RGBA 픽셀로 만든다.
// 시드가 같으면 항상 같은 그림이 나온다(난수는 mulberry32). 앱은 이 파일을 쓰지 않고 결과 PNG 만 쓴다.

export const GARDEN_W = 384;
export const GARDEN_H = 352;

/** "#rrggbb" 또는 "rgba(r,g,b,a)" → [r, g, b, a(0~1)] */
function parseColor(c) {
  if (c[0] === "#") return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(c);
  if (!m) throw new Error("unsupported color: " + c);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

export function drawGarden() {
  const W = GARDEN_W, H = GARDEN_H;
  const rgba = new Uint8Array(W * H * 4);
  let seed = 20261018;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const cache = new Map();
  const col = (c) => { let v = cache.get(c); if (!v) { v = parseColor(c); cache.set(c, v); } return v; };

  const px = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b, a] = col(c);
    const o = (y * W + x) * 4;
    if (a >= 1) { rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255; return; }
    rgba[o] = Math.round(r * a + rgba[o] * (1 - a));
    rgba[o + 1] = Math.round(g * a + rgba[o + 1] * (1 - a));
    rgba[o + 2] = Math.round(b * a + rgba[o + 2] * (1 - a));
    rgba[o + 3] = 255;
  };
  const rect = (x, y, w, h, c) => {
    const x0 = Math.round(x), y0 = Math.round(y);
    for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) px(xx, yy, c);
  };
  const disc = (cx, cy, r, c) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(x, y, c);
    }
  };
  const FL = ["#fbfbf3", "#f4a9b8", "#f7c59a", "#fbfbf3", "#e98fa5", "#fde7a8"];

  // 1) 잔디 — 큰 얼룩 + 점 잡음 + 풀 포기
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = Math.sin(x * 0.045 + y * 0.03) + Math.sin(x * 0.02 - y * 0.055) + Math.sin(x * 0.09 + y * 0.07) * 0.5;
      const base = p > 1.1 ? "#95ba70" : p < -1.1 ? "#7ea65c" : "#88ae65";
      const r = rnd();
      px(x, y, r < 0.09 ? "#76a055" : r > 0.94 ? "#9cc078" : base);
    }
  }
  const tuft = (x, y) => {
    px(x, y, "#5f8c48"); px(x - 1, y - 1, "#6a9650"); px(x + 1, y - 1, "#6a9650");
    px(x, y - 2, "#79a65a"); px(x - 2, y - 2, "#79a65a"); px(x + 2, y - 2, "#79a65a");
  };

  // 2) 통로 — 돌 포장길(돌마다 색이 조금씩 다름)
  const AX0 = 168, AX1 = 215;
  for (let y = 112; y < H; y += 12) {
    const off = ((y - 112) / 12) % 2 === 0 ? 0 : 8;
    for (let x = AX0 - 16 + off; x <= AX1; x += 16) {
      const x0 = Math.max(AX0, x), x1 = Math.min(AX1, x + 15);
      if (x1 < x0) continue;
      const base = pick(["#e3d4aa", "#dccb9f", "#e8dab3", "#d8c796"]);
      rect(x0, y, x1 - x0 + 1, 11, base);
      rect(x0, y, x1 - x0 + 1, 1, "#f0e5c4");
      rect(x0, y + 10, x1 - x0 + 1, 1, "#bfae80");
      for (let k = 0; k < 3; k++) px(x0 + 2 + Math.floor(rnd() * Math.max(1, x1 - x0 - 3)), y + 2 + Math.floor(rnd() * 7), "#cdbb8f");
    }
  }
  rect(AX0 - 1, 112, 1, H - 112, "#a8966a");
  rect(AX1 + 1, 112, 1, H - 112, "#a8966a");

  // 3) 단상 + 계단 — 마룻바닥 무늬
  rect(136, 52, 112, 64, "#d9c9a0");
  for (let y = 52; y < 116; y += 8) {
    rect(136, y, 112, 1, "#cdbb8f");
    for (let x = 136 + ((y / 8) % 2) * 14; x < 248; x += 28) rect(x, y, 1, 8, "#cdbb8f");
  }
  rect(136, 52, 112, 2, "#ebdfba"); rect(136, 114, 112, 3, "#a89868");
  rect(136, 52, 2, 64, "#ebdfba"); rect(246, 52, 2, 64, "#b9a77a");
  for (let i = 0; i < 3; i++) {
    rect(152 + i * 4, 117 + i * 8, 80 - i * 8, 8, i % 2 ? "#e6d8b2" : "#eadfba");
    rect(152 + i * 4, 123 + i * 8, 80 - i * 8, 2, "#bfae82");
    rect(152 + i * 4, 117 + i * 8, 80 - i * 8, 1, "#f4ecd0");
  }

  // 4) 화단 — 나무 상자 + 수국처럼 빽빽한 꽃
  const planter = (x, y, w) => {
    for (let k = 0; k < w * 0.9; k++) {
      const fx = x + 3 + Math.floor(rnd() * (w - 6)), fy = y + 2 + Math.floor(rnd() * 12);
      disc(fx, fy, 3, pick(["#4f8a40", "#5b9446"]));
    }
    for (let k = 0; k < w * 0.7; k++) {
      const fx = x + 3 + Math.floor(rnd() * (w - 6)), fy = y + 1 + Math.floor(rnd() * 12), c = pick(FL);
      disc(fx, fy, 2, c); px(fx, fy, "#fde7a8");
    }
    rect(x, y + 12, w, 14, "#8a5a3a"); rect(x, y + 12, w, 2, "#a8714b"); rect(x, y + 24, w, 2, "#5e3b25");
    for (let p0 = x + 8; p0 < x + w; p0 += 12) rect(p0, y + 14, 1, 10, "#6e4630");
    rect(x, y + 26, w, 2, "rgba(30,50,30,0.35)");
  };
  planter(80, 78, 48); planter(256, 78, 48);

  // 5) 꽃 아치 — 위쪽 반원 꽃 띠(잎 덩어리 + 꽃 송이) + 기둥 + 흰 커튼
  const bloom = (cx, cy) => { const c = pick(FL); disc(cx, cy, 3, c); px(cx, cy, "#fde7a8"); px(cx - 2, cy, c); };
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += 0.022) {
    const cx = 192 + Math.cos(a) * 44, cy = 70 + Math.sin(a) * 36;
    disc(cx + (rnd() - 0.5) * 2, cy + (rnd() - 0.5) * 2, 5.4, pick(["#4a7f3c", "#548a44", "#3f6f34"]));
  }
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += 0.075) {
    bloom(192 + Math.cos(a) * 44 + (rnd() - 0.5) * 7, 70 + Math.sin(a) * 36 + (rnd() - 0.5) * 7);
  }
  for (const x of [143, 241]) {
    rect(x, 60, 8, 48, "#f6f6f1"); rect(x + 6, 60, 2, 48, "#d3d3ca"); rect(x, 60, 1, 48, "#ffffff");
    for (let y = 62; y < 106; y += 8) {
      disc(x + 4, y, 4.6, pick(["#4a7f3c", "#548a44"]));
      bloom(x + 4 + (rnd() - 0.5) * 4, y + (rnd() - 0.5) * 3);
    }
  }
  for (const x of [128, 248]) {
    rect(x, 60, 12, 44, "#fbfbf7");
    for (let i = 2; i < 12; i += 3) rect(x + i, 60, 1, 44, "#e1ded2");
    rect(x, 102, 12, 2, "#cfcbbe"); rect(x, 60, 12, 2, "#ffffff");
  }

  // 6) 통로 옆 꽃길 — 덤불 + 꽃
  const clump = (cx, cy) => {
    disc(cx, cy, 10, "#44743a"); disc(cx - 2, cy - 2, 7.5, "#5b8f45"); disc(cx - 3, cy - 3, 3.5, "#6fa352");
    for (let k = 0; k < 11; k++) {
      const fx = cx + Math.round((rnd() - 0.5) * 17), fy = cy + Math.round((rnd() - 0.5) * 17);
      disc(fx, fy, 1.6, pick(FL)); px(fx, fy, "#fde7a8");
    }
  };
  for (let y = 140; y <= 300; y += 15) {
    clump(160 + Math.round(rnd() * 4 - 2), y);
    clump(223 + Math.round(rnd() * 4 - 2), y);
  }

  // 7) 라벤더 · 오른쪽 꽃덤불
  for (let k = 0; k < 110; k++) {
    const x = 12 + Math.floor(rnd() * 30), y = 156 + Math.floor(rnd() * 44);
    rect(x, y, 2, 7, pick(["#9a86c8", "#8b76be", "#a995d6"])); px(x, y - 1, "#c3b4ec"); rect(x, y + 7, 1, 3, "#5f8f47");
  }
  for (const [x, y, r] of [[352, 150, 16], [366, 188, 14], [350, 224, 14], [24, 268, 13]]) {
    disc(x, y, r, "#44743a"); disc(x - 2, y - 2, r - 4, "#5b8f45");
    for (let k = 0; k < r * 2; k++) {
      const fx = x + Math.round((rnd() - 0.5) * r * 1.7), fy = y + Math.round((rnd() - 0.5) * r * 1.7);
      disc(fx, fy, 1.8, pick(FL)); px(fx, fy, "#fde7a8");
    }
  }

  // 8) 나무 — 겹친 잎 덩어리 + 늘어진 가지(버드나무)
  const tree = (cx, cy, R) => {
    disc(cx + 3, cy + 5, R, "rgba(30,60,30,0.32)");
    for (let k = 0; k < R * 2.4; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * R * 0.75;
      disc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * 0.38 + rnd() * R * 0.18, pick(["#3a6431", "#41703a", "#365d2e"]));
    }
    for (let k = 0; k < R * 2.2; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * R * 0.62;
      disc(cx - 4 + Math.cos(a) * d, cy - 4 + Math.sin(a) * d, R * 0.22 + rnd() * R * 0.1, pick(["#5b9143", "#66a04b", "#559040"]));
    }
    for (let k = 0; k < R * 5; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * R * 0.7;
      const x = cx - 5 + Math.cos(a) * d, y = cy - 5 + Math.sin(a) * d;
      px(x, y, pick(["#8fc260", "#a3d070", "#7fb257"])); px(x + 1, y, "#a3d070");
    }
    for (let k = 0; k < R * 3; k++) {
      const a = rnd() * Math.PI * 2;
      const x = cx + Math.cos(a) * (R - 2), y = cy + Math.sin(a) * (R - 2);
      rect(x, y, 1, 3 + Math.floor(rnd() * 5), pick(["#2f5528", "#3a6431"]));
    }
  };
  for (const [x, y, R] of [[24, 24, 52], [364, 20, 48], [104, -8, 28], [284, -8, 28]]) tree(x, y, R);

  // 9) 잔디밭 소품 — 풀 포기·들꽃
  for (let k = 0; k < 190; k++) {
    const x = 8 + Math.floor(rnd() * (W - 16)), y = 140 + Math.floor(rnd() * (H - 146));
    if (x > AX0 - 24 && x < AX1 + 24) continue;
    tuft(x, y);
  }
  for (let k = 0; k < 110; k++) {
    const x = 8 + Math.floor(rnd() * (W - 16)), y = 140 + Math.floor(rnd() * (H - 146));
    if (x > AX0 - 24 && x < AX1 + 24) continue;
    const c = pick(FL);
    px(x, y - 1, c); px(x - 1, y, c); px(x + 1, y, c); px(x, y + 1, c); px(x, y, "#fde7a8");
  }
  return { width: W, height: H, rgba };
}
