// 도트 마당 인물 그리기 엔진 — 32×64 프레임에 어른 비율(머리 ≈ 키의 1/4) 인물을 코드로 그린다.
// 부위 도형 → 3단 음영 → 앞 부위가 뒷 부위에 1px 그늘 → 색 외곽선 순서로 칠한다.
// 순수 함수라 같은 입력이면 항상 같은 그림이 나온다.

export const FRAME_W = 32;
export const FRAME_H = 64;
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (h, t, a) => { const c = hex(h), d = hex(t); return toHex(c.map((v, i) => v + (d[i] - v) * a)); };
/** 그늘·외곽선이 섞여 들어가는 잉크 — 순수 검정 대신 짙은 보라라 색이 탁해지지 않는다 */
const INK = "#1a1030";
const light = (h) => mix(h, "#fff8ec", 0.24);
const dark = (h) => mix(h, INK, 0.26);
const deep = (h) => mix(h, INK, 0.46);
const inkOf = (h) => mix(h, INK, 0.66);
const lum = (h) => { const [r, g, b] = hex(h); return r * 0.3 + g * 0.59 + b * 0.11; };
/** 발 그림자 — 바닥색이 비치도록 반투명(#rrggbbaa) */
const SHADOW = "#1a103052";

const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const rrect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r + 0.5;
};
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const union = (...ps) => (x, y) => ps.some((p) => p(x, y));
const minus = (a, b) => (x, y) => a(x, y) && !b(x, y);
const NONE = () => false;
/** 줄마다 [x0, x1] 구간으로 정한 도형 — 머리처럼 곡선이 미묘한 곳에 쓴다 */
const spans = (y0, list) => (x, y) => { const s = list[y - y0]; return !!s && x >= s[0] && x <= s[1]; };
/** 위(y0)에서 아래(y1)로 갈수록 dx 만큼 기우는 띠 — 흔드는 팔·벌린 다리 */
const slant = (x0, x1, y0, y1, dx) => (x, y) => {
  if (y < y0 || y > y1) return false;
  const o = Math.round((dx * (y - y0)) / Math.max(1, y1 - y0));
  return x >= x0 + o && x <= x1 + o;
};

const EYE = "#2b2433";

/** 한 프레임 → 길이 FRAME_W*FRAME_H 의 색 배열(hex 문자열, 투명은 null) */
export function renderFrame(look, dir, anim) {
  const W = FRAME_W, H = FRAME_H, N = W * H;
  const base = new Array(N).fill(null);
  const lv = new Int8Array(N); // -1 밝음 · 0 기본 · 1 어둠 · 2 더 어둠
  const zs = new Int16Array(N).fill(-1);
  const flat = new Uint8Array(N); // 얼굴·장식: 음영·그늘을 받지 않는다
  const shadow = new Uint8Array(N);
  const casts = [], sideCasts = [];
  let zc = 0, ox = 0, oy = 0;

  const put = (x, y, c, l, z, f) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    base[i] = c; lv[i] = l; zs[i] = z; flat[i] = f ? 1 : 0;
  };
  /** 부위 하나를 칠한다. shade: rim(위·왼쪽 밝게, 아래·오른쪽 어둡게) | cyl(좌우만) | none */
  const fill = (pred, color, o = {}) => {
    const z = ++zc;
    casts[z] = o.cast !== false;
    sideCasts[z] = !!o.side;
    const p = (x, y) => pred(x - ox, y - oy);
    const mode = o.shade || "rim";
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!p(x, y)) continue;
      let l = 0;
      if (mode !== "none") {
        if ((mode === "rim" && !p(x, y - 1)) || !p(x - 1, y)) l = -1;
        if (!p(x + 1, y) || (o.r2 && !p(x + 2, y)) || (mode === "rim" && !p(x, y + 1))) l = 1;
      }
      put(x, y, color, Math.max(-1, Math.min(2, l + (o.lv || 0))), z, false);
    }
    return z;
  };
  const dot = (x, y, c) => put(x + ox, y + oy, c, 0, zc, true);
  /** 이미 칠한 부위 z 의 픽셀 음영 단계만 바꾼다(머리 결·옷 주름) */
  const tone = (pts, l, z = zc) => {
    for (const [x, y] of pts) {
      const xx = x + ox, yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (zs[i] === z && !flat[i]) lv[i] = l;
    }
  };
  const at = (dx, dy, fn) => { const a = ox, b = oy; ox += dx; oy += dy; fn(); ox = a; oy = b; };

  const skin = look.skin, hair = look.hair, top = look.top, pants = look.pants;
  const shoes = look.shoes || "#6b4a2e", accent = look.accent || "#b03a48";
  const hs = look.hairStyle, outfit = look.outfit;
  const dress = outfit === "dress", suit = outfit === "suit", hoodie = outfit === "hoodie", tee = outfit === "tee";
  const ph = anim === "walk1" ? 1 : anim === "walk2" ? -1 : 0;
  const bob = ph !== 0 ? 1 : 0; // 걷는 동안 무릎이 굽어 몸이 1px 내려간다
  const blush = mix(skin, "#ff6f86", 0.32);
  const mouthC = mix(skin, "#8a2838", 0.5);
  const browC = mix(hair, EYE, 0.55);

  // 1) 발 그림자
  const sh = ell(15.5, 62, 8.5, 1.7);
  for (let y = 60; y < H; y++) for (let x = 0; x < W; x++) if (sh(x, y)) shadow[y * W + x] = 1;

  if (dir === "side") drawSide();
  else drawFrontBack(dir === "up");
  drawHat();

  function drawFrontBack(back) {
    const liftL = ph === 1 ? 2 : 0, liftR = ph === -1 ? 2 : 0;
    // 팔은 반대쪽 다리와 함께 앞으로 나와 짧아 보인다
    const armL = ph === -1 ? -2 : 0, armR = ph === 1 ? -2 : 0;
    const hipY = 35 + bob;

    // 2) 몸 뒤 머리카락(앞모습)
    if (!back) at(0, bob, () => {
      if (hs === "long") fill(rrect(7, 7, 24, 31, 3), hair, { lv: 1, shade: "cyl" });
      if (hs === "bob") fill(rrect(7, 7, 24, 18, 3), hair, { lv: 1, shade: "cyl" });
      if (hs === "curly") fill(ell(15.5, 11, 9.5, 8.5), hair, { lv: 1, shade: "cyl" });
      if (hs === "ponytail") fill(rrect(21, 9, 25, 21, 2), hair, { lv: 1 });
    });

    // 3) 다리·신발
    if (dress) {
      fill(union(rect(12, 40, 14, 58 - liftL), rect(17, 40, 19, 58 - liftR)), skin, { shade: "cyl" });
      fill(shoeF(11, 14, liftL), shoes);
      fill(shoeF(17, 20, liftR), shoes);
    } else {
      const legs = union(
        rect(11, hipY, 20, 41),
        rect(11, hipY, 15, 47), rect(11, 48, 14, 58 - liftL),
        rect(16, hipY, 20, 47), rect(17, 48, 20, 58 - liftR)
      );
      const z = fill(legs, pants, { shade: "cyl" });
      tone([[15, 42], [15, 43], [15, 44], [15, 45], [15, 46], [15, 47]], 1, z); // 안쪽 솔기
      tone([[12, 44], [13, 45], [19, 44], [18, 45]], 1, z); // 무릎 주름
      fill(shoeF(10, 14, liftL, true), shoes);
      fill(shoeF(17, 21, liftR, false), shoes);
    }

    at(0, bob, () => {
      // 4) 목·몸통·팔
      fill(rect(14, 16, 17, 20), skin, { shade: "none", lv: 1 });
      const torso = dress
        ? spans(20, [[12, 19], ...Array(10).fill([11, 20])])
        : spans(20, [[11, 20], ...Array(suit ? 15 : 14).fill([10, 21])]);
      const tz = fill(torso, top, { r2: true });
      if (dress) drawSkirt(tz);
      torsoDetail(tz, back);

      for (const [x0, a, left] of [[7, armL, true], [22, armR, false]]) {
        const ax = back ? 29 - x0 : x0; // 뒷모습에서는 흔드는 팔도 반대
        const aa = back ? (left ? armR : armL) : a;
        drawArmF(ax, aa, ax < 16);
      }
      if (back && hoodie) {
        // 등에 늘어진 후드: 위가 넓고 아래로 좁아지며, 입구 안쪽은 어둡다
        const hz = fill(spans(18, [[11, 20], [11, 20], [11, 20], [12, 19], [12, 19], [13, 18], [14, 17]]), top);
        tone([[12, 18], [13, 18], [14, 18], [15, 18], [16, 18], [17, 18], [18, 18], [19, 18], [13, 19], [14, 19], [15, 19], [16, 19], [17, 19], [18, 19]], 2, hz);
      }
      if (back && hs === "long") {
        const lz = fill(longBack(), hair, { shade: "cyl" });
        tone([[15, 21], [15, 22], [16, 23], [16, 24], [15, 26], [15, 27]], 1, lz); // 머리 갈래
        tone([[12, 20], [12, 21], [12, 22], [19, 22], [19, 23]], -1, lz);
      }

      // 5) 머리·얼굴
      const earsOn = !["bob", "long", "curly"].includes(hs);
      const head = union(
        spans(3, [[12, 19], [10, 21], ...Array(10).fill([9, 22]), [10, 21], [11, 20], [13, 18]]),
        earsOn ? union(rect(8, 10, 8, 12), rect(23, 10, 23, 12)) : NONE
      );
      fill(head, skin);
      if (earsOn) { dot(8, 11, dark(skin)); dot(23, 11, deep(skin)); }
      if (!back) {
        for (const ex of [12, 18]) {
          dot(ex, 11, EYE); dot(ex + 1, 11, EYE); dot(ex, 12, EYE); dot(ex + 1, 12, EYE);
          dot(ex + 1, 11, "#ffffff");
          dot(ex, 9, browC); dot(ex + 1, 9, browC);
        }
        dot(11, 13, blush); dot(20, 13, blush);
        dot(16, 13, dark(skin)); dot(16, 14, dark(skin));
        dot(15, 15, mouthC); dot(16, 15, mouthC);
      }

      // 6) 머리카락
      if (hs !== "none") {
        if (back) hairBack();
        else hairFront();
      }
    });
  }

  function shoeF(x0, x1, lift, outerLeft) {
    const y = 59 - lift;
    if (outerLeft === undefined) return rect(x0, y, x1, y + 3);
    // 발끝은 바깥쪽으로 1px 넓다
    return union(rect(outerLeft ? x0 + 1 : x0, y, outerLeft ? x1 : x1 - 1, y), rect(x0, y + 1, x1, y + 3));
  }

  function drawSkirt(tz) {
    const skirt = (x, y) => y >= 30 && y <= 45 && Math.abs(x - 15.5) <= 5 + (y - 30) * 0.24;
    const sz = fill(skirt, top, { r2: true });
    const pleat = [];
    for (let y = 35; y <= 44; y++) for (const x of [12, 15, 19]) pleat.push([x + (y > 40 && x !== 15 ? (x < 15 ? -1 : 1) : 0), y]);
    tone(pleat, 1, sz);
    // 허리선
    tone([...Array(10)].map((_, i) => [11 + i, 30]), 1, sz);
    tone([...Array(10)].map((_, i) => [11 + i, 29]), 1, tz);
  }

  function torsoDetail(tz, back) {
    // 뒷모습은 주름도 좌우가 바뀐다
    const pts = (list, l, z = tz) => tone(list.map(([x, y]) => (back ? [FRAME_W - 1 - x, y] : [x, y])), l, z);
    if (tee || hoodie || outfit === "long") {
      pts([[13, 28], [14, 29], [18, 27], [18, 28], [19, 29]], 1); // 옷 주름
      pts([[12, 33], [13, 33], [14, 33], [17, 33], [18, 33], [19, 33], [15, 33], [16, 33]], 1); // 밑단
    }
    if (back) {
      if (suit) pts([...Array(12)].map((_, i) => [15, 24 + i]), 1);
      if (dress) pts([...Array(8)].map((_, i) => [15, 21 + i]), 1);
      return;
    }
    if (tee) {
      fill(union(rect(14, 20, 17, 20), rect(15, 21, 16, 21)), skin, { shade: "none" });
      dot(13, 20, dark(top)); dot(18, 20, dark(top)); dot(14, 21, dark(top)); dot(17, 21, dark(top));
    }
    if (dress) {
      fill(union(rect(13, 20, 18, 20), rect(14, 21, 17, 21)), skin, { shade: "none" });
    }
    if (outfit === "long") {
      // 셔츠 깃과 단추 줄
      fill(union(rect(12, 20, 14, 20), rect(13, 21, 14, 21), rect(17, 20, 19, 20), rect(17, 21, 18, 21)), light(top), { shade: "none" });
      fill(rect(15, 19, 16, 20), skin, { shade: "none", lv: 1 });
      pts([...Array(11)].map((_, i) => [15, 22 + i]), 1);
    }
    if (hoodie) {
      fill(minus(rrect(10, 18, 21, 22, 2), union(rect(13, 16, 18, 19), rect(14, 20, 17, 20))), top, { lv: 1 }); // 목 둘레 후드
      for (const x of [14, 17]) for (let y = 22; y <= 25; y++) dot(x, y, light(light(top)));
      const pz = fill(rect(12, 28, 19, 32), top); // 앞주머니
      tone([[12, 28], [13, 28], [14, 28], [15, 28], [16, 28], [17, 28], [18, 28], [19, 28]], 1, pz);
    }
    if (suit) {
      const V = (x, y) => y >= 20 && y <= 29 && Math.abs(x - 15.5) <= 3.2 - (y - 20) * 0.34;
      fill((x, y) => V(x - 1, y) || V(x + 1, y), dark(top), { shade: "none" }); // 옷깃
      fill(V, "#f4f4f4", { shade: "none" });
      for (let y = 22; y <= 30; y++) { dot(15, y, accent); dot(16, y, accent); }
      dot(15, 21, light(accent)); dot(16, 21, light(accent)); dot(15, 31, accent);
      dot(16, 26, dark(accent)); dot(16, 28, dark(accent));
      // 가슴 꽃
      dot(19, 23, "#fbf4f2"); dot(20, 23, "#fbf4f2"); dot(19, 24, "#f2b8c6"); dot(20, 24, "#fbf4f2"); dot(19, 25, "#5c8a4a");
      dot(15, 32, light(top)); dot(15, 34, light(top));
    }
  }

  function drawArmF(x0, a, left) {
    const end = 35 + a;
    const notch = left ? rect(x0, 21, x0, 21) : rect(x0 + 2, 21, x0 + 2, 21);
    const arm = minus(rect(x0, 21, x0 + 2, end), notch);
    const hand = union(rect(x0, end + 1, x0 + 2, end + 2), left ? rect(x0 + 1, end + 3, x0 + 2, end + 3) : rect(x0, end + 3, x0 + 1, end + 3));
    fill(union(arm, hand), skin, { shade: "cyl" });
    const sleeveEnd = tee ? 26 : dress ? 23 : end;
    if (dress) fill(rrect(x0, 20, x0 + 2, sleeveEnd, 1), top); // 퍼프 소매
    else {
      const sz = fill(minus(rect(x0, 21, x0 + 2, sleeveEnd), notch), top, { shade: "cyl" });
      tone([[x0, sleeveEnd], [x0 + 1, sleeveEnd], [x0 + 2, sleeveEnd]], 1, sz);
      if (suit) for (let x = x0; x <= x0 + 2; x++) dot(x, end + 1, "#f4f4f4");
    }
  }

  function longBack() {
    // 뒤통수는 넓고, 등 위로는 어깨 안쪽(몸통 폭)만 덮으며 끝이 갈라진다
    return union(rrect(8, 6, 23, 20, 4), rect(10, 18, 21, 28), rect(10, 29, 13, 29), rect(14, 29, 17, 30), rect(18, 29, 21, 29));
  }

  function hairFront() {
    const cap = spans(2, [[11, 20], [9, 22], [8, 23], [8, 23], [8, 23], [8, 23]]);
    const F = {
      short: { f: [9, 9, 8, 8, 8, 7, 7, 7, 6, 7, 8, 9], side: 9 },
      bob: { f: [10, 9, 8, 8, 8, 8, 8, 8, 8, 8, 9, 10], side: 16, wide: true },
      long: { f: [10, 9, 8, 8, 7, 6, 6, 7, 8, 8, 9, 10], side: 17, wide: true },
      ponytail: { f: [8, 7, 7, 6, 6, 6, 6, 6, 6, 7, 7, 8], side: 9 },
      bun: { f: [9, 8, 7, 6, 6, 6, 6, 6, 6, 7, 8, 9], side: 9 },
      curly: { f: [9, 8, 8, 9, 8, 8, 8, 8, 9, 8, 8, 9], side: 12, wide: true },
    }[hs] || { f: Array(12).fill(8), side: 9 };
    const fringe = (x, y) => x >= 10 && x <= 21 && y >= 8 && y <= F.f[x - 10];
    const sideCols = F.wide
      ? (x, y) => y >= 8 && y <= F.side - ((x === 7 || x === 24) && y >= F.side - 1 ? 2 : 0) && ((x >= 7 && x <= 10) || (x >= 21 && x <= 24))
      : (x, y) => y >= 8 && ((x >= 8 && x <= 9 && y <= F.side) || (x === 9 && y <= F.side + 1) || (x >= 22 && x <= 23 && y <= F.side) || (x === 22 && y <= F.side + 1));
    let shape = union(cap, fringe, sideCols);
    if (hs === "bun") shape = union(shape, ell(15.5, 2.5, 3.5, 2.5));
    if (hs === "curly") shape = union(minus(ell(15.5, 8, 9.5, 7.5), (x, y) => x >= 11 && x <= 20 && y > F.f[x - 10]), shape);
    const z = fill(shape, hair);
    hairShine(z, false);
    if (F.wide && hs !== "curly") tone([[8, 10], [8, 11], [8, 12], [9, 13], [22, 10], [22, 11]], -1, z); // 옆머리 결
    if (hs === "long") {
      // 어깨 앞으로 흘러내린 머리
      const sz = fill(union(rect(8, 17, 10, 26), rect(21, 17, 23, 26), rect(9, 27, 10, 27), rect(21, 27, 22, 27)), hair, { shade: "cyl" });
      tone([[9, 19], [9, 20], [9, 21], [22, 19], [22, 20]], -1, sz);
    }
  }

  function hairBack() {
    const nape = { short: 15, ponytail: 14, bun: 14, bob: 17, long: 18, curly: 17 }[hs] ?? 15;
    const wide = hs === "bob" || hs === "curly";
    let shape = union(
      spans(2, [[11, 20], [9, 22], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23], [8, 23]]),
      (x, y) => y >= 10 && y <= nape && x >= (wide ? 8 : 9) + (y >= nape - 1 ? 1 : 0) && x <= (wide ? 23 : 22) - (y >= nape - 1 ? 1 : 0)
    );
    if (hs === "bun") shape = union(shape, ell(15.5, 3, 3.5, 2.5));
    if (hs === "curly") shape = union(shape, ell(15.5, 9, 9.5, 8));
    const z = fill(shape, hair);
    hairShine(z, true);
    if (hs !== "curly") {
      // 정수리에서 목덜미로 흘러내리는 결(어두운 갈래 2줄 + 가마)
      tone([[12, 8], [12, 9], [11, 10], [11, 11], [11, 12], [19, 8], [19, 9], [20, 10], [20, 11], [20, 12], [15, 6], [16, 7]], 1, z);
      tone([[14, 9], [14, 10], [14, 11], [17, 10], [17, 11], [17, 12]], -1, z);
    }
    if (hs === "ponytail") {
      const tz = fill(union(rect(14, 12, 17, 24), rect(15, 25, 16, 26)), hair, { shade: "cyl" });
      tone([[15, 15], [15, 16], [15, 17], [15, 18]], -1, tz);
      for (const x of [14, 15, 16, 17]) dot(x, 12, "#d94a5a");
    }
    if (hs === "bun") for (const x of [13, 14, 17, 18]) dot(x, 5, dark(hair));
  }

  function hairShine(z, back) {
    // 정수리 둥근 결 한 줄 + 짧은 결 한 줄
    tone([[11, 4], [12, 4], [13, 3], [14, 3], [15, 3]], -1, z);
    tone([[18, 4], [19, 5], back ? [20, 6] : [19, 4]], -1, z);
    if (hs === "curly") {
      curls(z);
    }
  }

  /** 곱슬: 격자처럼 보이지 않게 위치를 조금씩 흔든 작은 고리(밝은 2px + 아래 어두운 1px) */
  function curls(z) {
    const hi = [], lo = [];
    for (let y = 3, r = 0; y < 18; y += 3, r++) for (let x = 6 + (r % 2) * 2, k = 0; x < 26; x += 4, k++) {
      const j = ((x * 7 + y * 13 + k) % 3) - 1; // 결정적 흔들림 −1..1
      hi.push([x + j, y], [x + j + 1, y]);
      lo.push([x + j + 2, y + 1]);
    }
    tone(lo, 1, z);
    tone(hi, -1, z);
  }

  function drawSide() {
    const sw = ph * 3; // 앞다리 +sw, 뒷다리 −sw
    const hipY = 35 + bob;
    // 2) 몸 뒤: 먼 다리·먼 팔
    const legW = dress ? 2 : 4;
    const legX = dress ? 14 : 13;
    fill(slant(legX, legX + legW, dress ? 40 : hipY, 58, -sw), dress ? skin : pants, { shade: "cyl", lv: 1 });
    fill(shoeS(legX - sw), shoes, { lv: 1 });
    at(0, bob, () => {
      if (ph !== 0) fill(union(slant(14, 16, 21, 35, sw), slant(14, 16, 36, 38, sw)), skin, { lv: 1, shade: "cyl" });
      if (ph !== 0 && !tee && !dress) fill(slant(14, 16, 21, 35, sw), top, { lv: 1, shade: "cyl" });
      if (hs === "ponytail") fill(union(rrect(4, 8, 9, 22, 2), rect(9, 8, 11, 10)), hair, { shade: "cyl" });
    });
    // 3) 가까운 다리
    fill(slant(legX + 1, legX + 1 + legW, dress ? 40 : hipY, 58, sw), dress ? skin : pants, { shade: "cyl" });
    fill(shoeS(legX + 1 + sw), shoes);
    at(0, bob, () => {
      if (!dress) fill(spans(35, [[12, 19], [12, 19], [12, 19], [12, 19], [13, 19]]), pants, { shade: "cyl" });
      // 4) 목·몸통
      fill(rect(14, 16, 17, 20), skin, { shade: "none", lv: 1 });
      if (hoodie) fill(rrect(9, 17, 14, 25, 2), top, { lv: 1 });
      const tz = fill(spans(20, [[12, 19], ...Array(suit ? 15 : 14).fill([11, 20])]), top, { r2: true });
      if (dress) {
        const sz = fill((x, y) => y >= 30 && y <= 45 && x >= 11 - (y - 30) * 0.22 && x <= 20 + (y - 30) * 0.3, top, { r2: true });
        const pl = [];
        for (let y = 35; y <= 44; y++) pl.push([14, y], [18, y]);
        tone(pl, 1, sz);
        tone([...Array(10)].map((_, i) => [11 + i, 30]), 1, sz);
      }
      if (tee || hoodie || outfit === "long") tone([[16, 27], [17, 28], [13, 29], [12, 33], [13, 33], [14, 33], [15, 33], [16, 33], [17, 33], [18, 33], [19, 33]], 1, tz);
      if (tee) { fill(rect(18, 20, 19, 20), skin, { shade: "none" }); dot(17, 20, dark(top)); }
      if (dress) fill(rect(17, 20, 19, 20), skin, { shade: "none" });
      if (outfit === "long") fill(union(rect(17, 20, 19, 20), rect(18, 21, 19, 21)), light(top), { shade: "none" });
      if (hoodie) for (let y = 21; y <= 24; y++) dot(19, y, light(light(top)));
      if (suit) {
        fill(union(rect(18, 20, 20, 23), rect(19, 24, 20, 27)), "#f4f4f4", { shade: "none" });
        fill(union(rect(17, 21, 17, 27), rect(18, 24, 18, 28)), dark(top), { shade: "none" });
        for (let y = 21; y <= 28; y++) dot(20, y, accent);
        dot(16, 23, "#fbf4f2"); dot(16, 24, "#f2b8c6"); dot(17, 23, "#fbf4f2");
      }
      if (hs === "long") fill(union(spans(7, [...Array(11).fill([8, 15]), ...Array(10).fill([8, 13]), [9, 12], [9, 11]])), hair, { shade: "cyl" });
      // 가까운 팔(뒷다리 쪽으로 흔든다)
      const end = 35;
      fill(union(slant(14, 16, 21, end, -sw), slant(14, 16, end + 1, end + 3, -sw)), skin, { shade: "cyl", side: true });
      if (dress) fill(rrect(13, 20, 17, 23, 1), top, { side: true });
      else {
        const sz = fill(slant(14, 16, 21, end, -sw), top, { shade: "cyl", side: true });
        if (tee) {
          // 반소매: 소매 아래는 살
          fill(union(slant(14, 16, 27, end, -sw), slant(14, 16, end + 1, end + 3, -sw)), skin, { shade: "cyl", side: true });
        }
        if (suit) for (let x = 14; x <= 16; x++) dot(x - sw, end, "#f4f4f4");
        else tone([[14 - sw, tee ? 26 : end], [15 - sw, tee ? 26 : end], [16 - sw, tee ? 26 : end]], 1, sz);
      }

      // 5) 머리·얼굴(오른쪽을 본다)
      const head = spans(3, [[12, 19], [10, 21], ...Array(7).fill([9, 22]), [9, 23], [9, 23], [9, 22], [10, 22], [11, 21], [13, 20]]);
      fill(head, skin);
      dot(19, 11, EYE); dot(20, 11, "#ffffff"); dot(19, 12, EYE); dot(20, 12, EYE);
      dot(19, 9, browC); dot(20, 9, browC); dot(21, 9, browC);
      dot(19, 13, blush);
      dot(22, 13, dark(skin));
      dot(21, 15, mouthC);
      dot(13, 10, light(skin)); dot(14, 11, dark(skin)); dot(14, 12, dark(skin)); // 귀
      tone([[13, 16], [14, 16], [15, 17], [16, 17]], 1);

      // 6) 머리카락
      if (hs !== "none") hairSide();
    });
  }

  function shoeS(fx) {
    // 발끝이 오른쪽(앞)을 향한다
    return spans(59, [[fx, fx + 3], [fx, fx + 4], [fx - 1, fx + 5], [fx - 1, fx + 5]]);
  }

  function hairSide() {
    const cap = spans(2, [[11, 19], [9, 21], [8, 22], [8, 22], [8, 22], [8, 21]]);
    const back = { short: 13, ponytail: 12, bun: 12, bob: 17, long: 17, curly: 16 }[hs] ?? 13;
    const wide = hs === "bob" || hs === "long" || hs === "curly";
    let shape = union(
      cap,
      rect(8, 8, 12, back), // 뒤통수
      rect(13, 8, wide ? 16 : 15, wide ? back : 9), // 귀 위(긴 머리는 귀를 덮는다)
      hs === "ponytail" ? rect(16, 8, 18, 8) : union(rect(16, 8, 21, 8), rect(19, 9, 20, 9))
    );
    if (hs === "bun") shape = union(shape, ell(10, 3.5, 3, 2.5));
    if (hs === "curly") shape = union(minus(ell(14.5, 8.5, 9.5, 8), (x, y) => x >= 17 && y >= 9), shape);
    const z = fill(shape, hair);
    tone([[11, 4], [12, 3], [13, 3], [14, 3], [15, 3]], -1, z);
    tone([[9, 7], [9, 8], [10, 9]], -1, z);
    if (hs === "curly") {
      curls(z);
    }
    if (hs === "ponytail") for (const y of [8, 9, 10]) dot(9, y, "#d94a5a");
  }

  // 7) 모자·소품
  function drawHat() {
    at(0, bob, () => {
      const hatC = look.hatColor || "#c46b6b";
      if (look.hat === "cap") {
        if (dir === "side") {
          fill(spans(1, [[11, 19], [9, 21], [8, 21], [8, 21], [8, 21], [8, 21]]), hatC);
          fill(rect(17, 7, 26, 7), dark(hatC), { shade: "none" });
          dot(14, 1, light(hatC));
        } else {
          const z = fill(spans(1, [[11, 20], [9, 22], [8, 23], [8, 23], [8, 23], [8, 23]]), hatC);
          if (dir === "down") fill(union(rect(8, 7, 23, 7), rect(9, 8, 22, 8)), dark(hatC), { shade: "none" });
          else { fill(rect(8, 7, 23, 7), dark(hatC), { shade: "none" }); tone([[15, 5], [16, 5], [15, 6], [16, 6]], 2, z); }
          dot(15, 1, light(hatC)); dot(16, 1, light(hatC));
        }
      }
      if (look.hat === "flower") {
        const fx = dir === "side" ? 12 : dir === "up" ? 10 : 21;
        fill(union(rect(fx - 1, 4, fx + 1, 6), rect(fx, 3, fx, 7), rect(fx - 2, 5, fx + 2, 5)), "#f6a9c0", { shade: "none" });
        dot(fx, 5, "#f6d86a");
        dot(fx - 1, 4, "#fbd3df");
      }
      if (look.hat === "ribbon") {
        const fx = dir === "side" ? 10 : dir === "up" ? 21 : 10;
        const bow = [[-2, -1], [-1, -1], [-2, 0], [-1, 0], [-2, 1], [1, -1], [2, -1], [1, 0], [2, 0], [2, 1], [-1, 2], [1, 2]];
        fill((x, y) => bow.some(([dx, dy]) => x === fx + dx && y === 4 + dy), "#d94a5a", { shade: "none" });
        dot(fx, 4, "#f09aa8");
        dot(fx - 2, 3, "#ec7f8c"); dot(fx + 1, 3, "#ec7f8c");
      }
    });
  }

  // 8) 앞 부위가 뒷 부위에 드리우는 1px 그늘(위에서 아래로)
  const lv2 = lv.slice();
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, q = i - W;
    if (!base[i] || flat[i] || !base[q] || flat[q]) continue;
    if (zs[q] > zs[i] && casts[zs[q]]) lv2[i] = Math.max(lv2[i], lv[i] >= 1 ? 2 : 1);
  }
  // 옆모습 팔처럼 몸통과 같은 색이 겹치는 부위는 좌우로도 그늘을 드리워 윤곽을 살린다
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!base[i] || flat[i]) continue;
    for (const q of [i - 1, i + 1]) {
      if (base[q] && !flat[q] && zs[q] > zs[i] && sideCasts[zs[q]]) lv2[i] = Math.max(lv2[i], 1);
    }
  }

  const out = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const c = base[i];
    if (!c) continue;
    if (flat[i]) { out[i] = c; continue; }
    const l = lv2[i];
    out[i] = l < 0 ? light(c) : l === 0 ? c : l === 1 ? dark(c) : deep(c);
  }
  // 9) 색 외곽선: 투명 픽셀이 칠한 픽셀과 맞닿으면 그 중 가장 어두운 이웃 색을 어둡게 해서 칠한다
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (base[i]) continue;
    let pick = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const c = base[yy * W + xx];
      if (c && (!pick || lum(c) < lum(pick))) pick = c;
    }
    if (pick) out[i] = inkOf(pick);
    else if (shadow[i]) out[i] = SHADOW;
  }
  return out;
}

