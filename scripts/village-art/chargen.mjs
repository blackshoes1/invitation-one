// 도트 마당 캐릭터 생성기 — 시트에 넣을 사람(하객·신랑·신부)을 정하고, figure.mjs 로 그려 시트 픽셀(RGBA)로 만든다.
// 순수 함수라 같은 입력이면 항상 같은 그림이 나온다. 앱은 이 파일을 쓰지 않고 결과 PNG 만 쓴다.

import { FRAME_W, FRAME_H, hex, renderFrame } from "./figure.mjs";
export { FRAME_W, FRAME_H, hex };

/** 시트의 열 순서 — src/lib/pixelSprite.ts 의 FRAME_NAMES 와 같아야 한다(테스트가 검사한다) */
export const COLUMNS = [
  ["down", "idle"], ["down", "walk1"], ["down", "walk2"],
  ["up", "idle"], ["up", "walk1"], ["up", "walk2"],
  ["side", "idle"], ["side", "walk1"], ["side", "walk2"],
];
/** 시트의 하객 줄 수. 줄 GUEST_LOOKS = 신랑, GUEST_LOOKS + 1 = 신부 */
export const GUEST_LOOKS = 96;

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
          // #rrggbbaa 는 반투명(발 그림자)
          rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = color.length === 9 ? parseInt(color.slice(7, 9), 16) : 255;
        }
      }
    });
  });
  return { width, height, rgba };
}
