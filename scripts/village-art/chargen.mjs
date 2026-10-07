// 도트 마당 캐릭터 생성기 — 32×64 레이어식 도트를 코드로 그려 시트 픽셀(RGBA)로 만든다.
// 도형 → 음영(위·왼쪽은 밝게, 아래·오른쪽은 어둡게) → 실루엣 바깥 1px 외곽선을 자동으로 만든다.
// 순수 함수라 같은 입력이면 항상 같은 그림이 나온다. 앱은 이 파일을 쓰지 않고 결과 PNG 만 쓴다.

export const FRAME_W = 32;
export const FRAME_H = 64;
/** 시트의 열 순서 — src/lib/pixelSprite.ts 의 FRAME_NAMES 와 같아야 한다(테스트가 검사한다) */
export const COLUMNS = [
  ["down", "idle"], ["down", "walk1"], ["down", "walk2"],
  ["up", "idle"], ["up", "walk1"], ["up", "walk2"],
  ["side", "idle"], ["side", "walk1"], ["side", "walk2"],
];
/** 시트의 하객 줄 수. 줄 GUEST_LOOKS = 신랑, GUEST_LOOKS + 1 = 신부 */
export const GUEST_LOOKS = 96;

const CW = FRAME_W, CH = FRAME_H;
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (h, t, a) => { const c = hex(h), d = hex(t); return toHex(c.map((v, i) => v + (d[i] - v) * a)); };
const light = (h) => mix(h, "#ffffff", 0.22);
const dark = (h) => mix(h, "#1a1030", 0.24);

const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const rrect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r + 0.5;
};
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const union = (...ps) => (x, y) => ps.some((p) => p(x, y));
const minus = (a, b) => (x, y) => a(x, y) && !b(x, y);
const shift = (p, dx, dy) => (x, y) => p(x - dx, y - dy);
const NONE = () => false;

/** 한 프레임 → 길이 32*64 의 색 배열(hex 문자열, 투명은 null) */
export function renderFrame(look, dir, anim) {
  const buf = new Array(CW * CH).fill(null);
  const OUT = "#2a1d22";
  const DY = CH - 48; // 임시: 기존 32×48 그림을 프레임 아래에 붙인다(Task 2 에서 새 그림으로 교체)
  const put = (x, y, c) => { y += DY; if (x >= 0 && y >= 0 && x < CW && y < CH) buf[y * CW + x] = c; };
  const layer = (pred, color, flat) => {
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (pred(x, y)) {
      let c = color;
      if (!flat) {
        if (!pred(x, y - 1) || !pred(x - 1, y)) c = light(color);
        else if (!pred(x, y + 1) || !pred(x + 1, y)) c = dark(color);
      }
      put(x, y, c);
    }
  };
  const dot = (x, y, c) => put(x, y, c);
  const EYE = "#2b2433";

  const skin = look.skin, hair = look.hair, top = look.top, pants = look.pants, shoes = look.shoes || "#6b4a2e";
  const step = anim === "walk1" ? 1 : anim === "walk2" ? -1 : 0;
  const dress = look.outfit === "dress";
  const long = look.hairStyle === "long";
  const suit = look.outfit === "suit";
  const sleeveLong = look.outfit !== "tee" && look.outfit !== "dress";
  const accent = look.accent || "#b03a48";

  if (dir === "side") {
    // ── 옆모습(오른쪽을 봄)
    const lift = step !== 0 ? 1 : 0;
    layer(rect(15 - step * 3, 24, 17 - step * 3, 33), dark(sleeveLong ? top : skin));
    if (long) layer(rrect(7, 9, 17, 33, 3), hair);
    layer(shift(rect(11, 35, 15, 44 - lift), -step * 3, 0), dark(dress ? skin : pants));
    layer(shift(rect(10, 44 - lift, 15, 46 - lift), -step * 3, 0), dark(shoes));
    layer(shift(rect(15, 35, 19, 44 - lift), step * 3, 0), dress ? skin : pants);
    layer(shift(rect(14, 44 - lift, 20, 46 - lift), step * 3, 0), shoes);
    layer(rrect(11, 22, 20, 35, 2), top);
    if (dress) layer((x, y) => y >= 30 && y <= 41 && Math.abs(x - 15.5) <= 5 + (y - 30) * 0.28, top);
    if (suit) { layer(rect(18, 23, 19, 28), "#f4f4f4", true); for (const y of [24, 25, 26]) dot(18, y, accent); }
    layer(rect(14, 21, 17, 23), skin);
    layer(rrect(8, 6, 23, 21, 5), skin);
    layer(rect(14 + step * 3, 24, 17 + step * 3, 33), top);
    layer(rect(14 + step * 3, look.outfit === "tee" || dress ? 29 : 32, 17 + step * 3, 34), skin);
    // 얼굴 (눈 2×3, 코, 볼, 입, 귀)
    for (let y = 13; y <= 15; y++) { dot(19, y, EYE); dot(20, y, EYE); }
    dot(20, 13, "#ffffff");
    dot(24, 15, skin); dot(24, 16, skin);
    dot(18, 18, "#f0a0a0"); dot(21, 18, "#b0525a");
    layer(rect(12, 14, 13, 16), dark(skin), true);
    // 머리카락
    const faceWin = rect(17, 11, 24, 22);
    const cap = rrect(7, 4, 24, 13, 5), backHead = rect(7, 6, 16, 17);
    const styles = {
      short: union(cap, backHead),
      bob: union(cap, rect(7, 6, 16, 21)),
      long: union(cap, rect(7, 6, 16, 21)),
      ponytail: union(cap, backHead, rrect(4, 11, 9, 26, 2)),
      bun: union(cap, backHead, ell(12, 3, 4, 3)),
      curly: union(ell(14, 11, 11, 10), rrect(6, 4, 22, 12, 5)),
    };
    if (look.hairStyle !== "none") layer(minus(styles[look.hairStyle] || styles.short, faceWin), hair);
  } else {
    const back = dir === "up";
    // ── 앞·뒤 모습
    const armLdy = step, armRdy = -step;
    const liftL = step === 1 ? 2 : 0, liftR = step === -1 ? 2 : 0;
    if (long) layer(rrect(7, 10, 24, back ? 33 : 31, 3), hair);
    layer(rect(11, 35, 15, 44 - liftL), dress ? skin : pants);
    layer(rect(16, 35, 20, 44 - liftR), dress ? skin : pants);
    layer(rect(10, 44 - liftL, 15, 46 - liftL), shoes);
    layer(rect(16, 44 - liftR, 21, 46 - liftR), shoes);
    layer(rect(14, 21, 17, 23), skin);
    layer(rrect(10, 22, 21, 35, 2), top);
    const sleeveEnd = look.outfit === "tee" || dress ? 27 : 32;
    layer(rect(7, 23 + armLdy, 9, sleeveEnd + armLdy), top);
    layer(rect(22, 23 + armRdy, 24, sleeveEnd + armRdy), top);
    if (sleeveEnd < 32) {
      layer(rect(7, sleeveEnd + 1 + armLdy, 9, 33 + armLdy), skin);
      layer(rect(22, sleeveEnd + 1 + armRdy, 24, 33 + armRdy), skin);
    } else {
      layer(rect(7, 33 + armLdy, 9, 34 + armLdy), skin);
      layer(rect(22, 33 + armRdy, 24, 34 + armRdy), skin);
    }
    if (dress) layer((x, y) => y >= 30 && y <= 42 && Math.abs(x - 15.5) <= 6.5 + (y - 30) * 0.3, top);
    if (look.outfit === "hoodie") layer(ell(15.5, 22.5, 6.5, 2.5), dark(top));
    if (suit && !back) {
      layer((x, y) => y >= 22 && y <= 29 && Math.abs(x - 15.5) <= 3 - (y - 22) * 0.35, "#f4f4f4", true);
      for (let y = 24; y <= 30; y++) { dot(15, y, accent); dot(16, y, accent); }
      layer((x, y) => y >= 22 && y <= 30 && x >= 11 && x <= 13 && y - 22 >= (x - 11) * 0.4, dark(top), true);
      layer((x, y) => y >= 22 && y <= 30 && x >= 18 && x <= 20 && y - 22 >= (20 - x) * 0.4, dark(top), true);
    }
    layer(rrect(8, 6, 23, 21, 5), skin);
    if (!back) {
      for (const ex of [12, 18]) {
        for (let y = 13; y <= 15; y++) { dot(ex, y, EYE); dot(ex + 1, y, EYE); }
        dot(ex, 13, "#ffffff");
      }
      for (const x of [10, 11, 20, 21]) dot(x, 17, "#f0a0a0");
      dot(15, 18, "#b0525a"); dot(16, 18, "#b0525a");
    }
    const faceWin = (x, y) => x >= 10 && x <= 21 && y >= (x % 2 ? 12 : 13) && y <= 22;
    const full = rrect(7, 4, 24, 13, 5);
    const sides = (yEnd) => union(rect(7, 8, 9, yEnd), rect(22, 8, 24, yEnd));
    const styles = {
      short: union(full, sides(15)),
      bob: union(full, sides(21)),
      long: union(full, sides(22)),
      ponytail: union(full, sides(15)),
      bun: union(full, sides(15), ell(15.5, 3, 4, 3)),
      curly: union(ell(15.5, 12, 11.5, 10), full),
    };
    if (look.hairStyle !== "none") {
      if (back) {
        layer(union(
          rrect(7, 4, 24, 21, 5),
          long ? rect(7, 8, 24, 33) : NONE,
          look.hairStyle === "bun" ? ell(15.5, 3, 4, 3) : NONE,
          look.hairStyle === "ponytail" ? rect(14, 14, 17, 29) : NONE,
          look.hairStyle === "curly" ? ell(15.5, 12, 11.5, 10) : NONE
        ), hair);
      } else {
        layer(minus(styles[look.hairStyle] || styles.short, faceWin), hair);
        if (long) layer(union(rect(6, 22, 9, 32), rect(22, 22, 25, 32)), hair);
      }
    }
  }
  // 모자·장식
  const hatC = look.hatColor || "#c46b6b";
  if (look.hat === "cap") {
    layer(rrect(7, 2, 24, 10, 4), hatC);
    if (dir === "down") layer(rect(8, 10, 23, 12), dark(hatC));
    if (dir === "side") layer(rect(17, 10, 28, 12), dark(hatC));
  }
  if (look.hat === "flower") {
    const fx = dir === "side" ? 11 : 21;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) dot(fx + dx, 8 + dy, "#f6a9c0");
    dot(fx, 8, "#f6d86a");
  }
  if (look.hat === "ribbon") {
    const fx = dir === "side" ? 11 : 10;
    for (const [dx, dy] of [[-2, -1], [-2, 0], [-2, 1], [2, -1], [2, 0], [2, 1], [-1, 0], [1, 0]]) dot(fx + dx, 7 + dy, "#d94a5a");
    dot(fx, 7, "#f09aa8");
  }
  // 외곽선 — 실루엣 바깥 1px
  const out = buf.slice();
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (!buf[y * CW + x]) {
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const xx = x + dx, yy = y + dy;
      return xx >= 0 && yy >= 0 && xx < CW && yy < CH && buf[yy * CW + xx];
    });
    if (n) out[y * CW + x] = OUT;
  }
  return out;
}

// ── 시트에 넣을 사람들 ───────────────────────────────────────────────

const SKINS = ["#f9d5b8", "#f2c29b", "#e0a577", "#c68a5b", "#8d5a3b"];
const HAIRS = ["#2b2220", "#4a3226", "#6e4a33", "#8a4b32", "#d9b45f", "#9a9aa0", "#e58fb3", "#4b6fb5"];
const TOPS = ["#5f8fd4", "#e98fb0", "#e8c14a", "#5fa36a", "#9a86c8", "#f4f4f4", "#6fcbb8", "#d9665a", "#8a8f9c"];
const PANTS = ["#3d5a8a", "#2f3340", "#c8b48a", "#f1efe8", "#7a5a9a", "#4a4e5a"];
const STYLES = ["short", "bob", "long", "ponytail", "bun", "curly"];
/** 하객 옷 — 정장은 신랑 전용이라 넣지 않는다 */
const OUTFITS = ["tee", "long", "dress", "hoodie"];
const HATS = [0, 0, 0, "cap", "flower", "ribbon"];
const HAT_COLORS = ["#c46b6b", "#5f8fb4", "#e0a63c"];
const SHOES = ["#6b4a2e", "#f4f4f4", "#2f3340"];

/** mulberry32 — 시드가 같으면 같은 수열 */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 하객 count 종 — 피부·머리 모양·옷은 번갈아 돌리고(골고루) 색·모자는 시드 난수로 고른다. 서로 다른 조합만 담는다. */
export function buildGuestLooks(count = GUEST_LOOKS) {
  const rnd = makeRng(20261007);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const seen = new Set();
  const looks = [];
  for (let i = 0; looks.length < count; i++) {
    const look = {
      skin: SKINS[i % SKINS.length],
      hairStyle: STYLES[i % STYLES.length],
      outfit: OUTFITS[(i + Math.floor(i / STYLES.length)) % OUTFITS.length],
      hair: pick(HAIRS),
      top: pick(TOPS),
      pants: pick(PANTS),
      hat: pick(HATS),
      hatColor: pick(HAT_COLORS),
      shoes: pick(SHOES),
    };
    const key = JSON.stringify(look);
    if (seen.has(key)) continue;
    seen.add(key);
    looks.push(look);
  }
  return looks;
}

export const GROOM_LOOK = { skin: "#f2c29b", hair: "#2a2018", hairStyle: "short", outfit: "suit", top: "#2f3340", pants: "#1e1f26", hat: 0, shoes: "#14141a", accent: "#b03a48" };
export const BRIDE_LOOK = { skin: "#f9d5b8", hair: "#2a2018", hairStyle: "long", outfit: "dress", top: "#f6f3ee", pants: "#f6f3ee", hat: "flower", shoes: "#e8e0d4" };

/** 시트 줄 순서 대로의 모든 사람: 하객 GUEST_LOOKS 명 → 신랑 → 신부 */
export function allLooks() {
  return [...buildGuestLooks(GUEST_LOOKS), GROOM_LOOK, BRIDE_LOOK];
}

/** 시트 전체 픽셀(RGBA) — 한 줄 = 한 사람, 열 = COLUMNS */
export function buildSheet() {
  const looks = allLooks();
  const width = COLUMNS.length * FRAME_W;
  const height = looks.length * FRAME_H;
  const rgba = new Uint8Array(width * height * 4);
  looks.forEach((look, row) => {
    COLUMNS.forEach(([dir, anim], col) => {
      const frame = renderFrame(look, dir, anim);
      for (let y = 0; y < FRAME_H; y++) {
        for (let x = 0; x < FRAME_W; x++) {
          const color = frame[y * FRAME_W + x];
          if (!color) continue;
          const [r, g, b] = hex(color);
          const o = ((row * FRAME_H + y) * width + col * FRAME_W + x) * 4;
          rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
        }
      }
    });
  });
  return { width, height, rgba };
}
