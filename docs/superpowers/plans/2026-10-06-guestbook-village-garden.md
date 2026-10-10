# 도트 마당 '정원 예식장' Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방명록 `🏘️ 마을` 탭의 메이플스토리식 옆면 마을(발판·점프)을, 위에서 내려다본 정원 예식장 위를 하객 캐릭터가 앞·뒤·좌·우로 걷고 단상 위 신랑·신부를 누르면 갤러리로 이동하는 바람의 나라식 탑뷰 마당으로 교체한다.

**Architecture:** 이미 있는 구조(순수 모듈 `pixelSprite.ts`·`villageSim.ts` + Canvas 컴포넌트 `PixelVillage.tsx`)를 그대로 두고 내용만 바꾼다. 스프라이트는 앞·뒤·옆 3방향, 이동은 중력 없는 4방향 걷기, 배경은 스크립트로 그린 정원 PNG 한 장이다. 신랑·신부는 `fixed` 캐릭터로 단상에 서 있고, 이름표·말풍선 글씨는 화면 해상도로 그린다. 터치·절전·접근성은 현재 구현(리뷰 반영 포함)을 그대로 쓴다.

**Tech Stack:** Next.js 16.3.3, React 19.2, TypeScript strict, Tailwind v4, vitest 3 (node 환경, `@` 별칭), Canvas 2D. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-06-guestbook-village-garden-design.md` (이 문서가 대체하지 않는 부분은 `2026-10-06-guestbook-village-topdown-design.md`, 그 위에 `2026-10-06-guestbook-pixel-village-design.md` 를 따른다)

## Global Constraints

- **Next.js 16 은 학습 데이터와 다르다** (`AGENTS.md`): 이 계획은 이미 `"use client"` 인 컴포넌트 안의 훅(`useEffect`/`useRef`)과 DOM API 만 다루므로 새 Next API 는 없다. 그래도 Next 가 경고·오류를 내면 보고한다.
- 세계 크기 **192×176**(논리 해상도), 캐릭터 **16×24**, Canvas 2D, 도트 세계는 `imageSmoothingEnabled = false`.
- 걷는 영역(발 위치 기준): `x ∈ [8, 184]`, `y ∈ [72, 176]`. 위쪽(단상·화단·나무)은 장식이다. 장애물·캐릭터끼리의 충돌은 없다. 아래쪽(y 가 큰) 캐릭터가 위쪽 캐릭터를 가린다.
- 이동은 **상·하·좌·우 4방향, 대각선 없음**: 한 프레임에 x 와 y 가 동시에 바뀌지 않는다. 걷기 0.6~2.0초, 서기 0.5~2.0초, 속도 24px/s. 영역 끝에 닿으면 안쪽으로 되돌리고 막힌 방향을 뺀 다른 방향을 고른다.
- 새 하객(첫 목록 이후)은 화면 아래 가장자리 바깥에서 위로 걸어 들어온다. 입장 중에는 `frozen` 이어도 영역에 닿을 때까지 걷는다. 모션 줄이기에서는 입장 없이 바로 영역 안에 선다. 입장 중(화면 아래 바깥)에는 이름표를 그리지 않는다.
- **신랑·신부**: `fixed` 캐릭터, 발 위치 신랑 `(86, 56)` / 신부 `(106, 56)`, 앞모습, 움직이지 않는다. 이름표는 `groom.name`(금색 `#b89b6e`) / `bride.name`(분홍 `#d98fb0`). 신랑은 옷 `#2f3340`·바지 `#1e1f26`, 신부는 옷·바지 `#f6f3ee` + 머리 꽃, 머리색 `#2a2018`. 누르면 말풍선 `저를 누르면 사진들 볼 수 있어요!`, **같은 캐릭터의 말풍선이 떠 있을 때 다시 누르면** `#gallery` 로 스크롤(`behavior: "smooth"`, 모션 줄이기면 `"auto"`, 요소가 없으면 아무 일도 하지 않음). 신랑·신부는 `items`·하객 수·`mineId`·자동 말풍선과 무관하다.
- **하객 자동 말풍선**: 루프가 도는 동안, 말풍선이 열려 있지 않은 채 6초가 지나면 메시지가 있는 하객 중 무작위 한 명의 말풍선을 4초간 띄운다(그 하객은 멈춘다). 루프 안(`dt` 누적)에서 센다 — 화면 밖·백그라운드·모션 줄이기에서는 뜨지 않는다. 사용자가 누르면 즉시 대체된다.
- **글씨**: 이름표·말풍선 글씨는 도트 배율이 아니라 화면 해상도(약 11 css px)로 그린다. 말풍선 최대 폭 약 150 css px, 3줄 초과는 말줄임, 4초 뒤 또는 캔버스의 빈 곳을 누르면 닫힘. 스프라이트·배경은 도트 그대로.
- 캐릭터: 앞·뒤·옆 3방향 × 정지·걷기 2 = 9프레임, 왼쪽은 옆모습 좌우 반전. 머리색·옷색·모자는 하객 `id` 로 정한다. `Look.pants`(선택)로 바지 색을 지정할 수 있고 없으면 기존 남색 `#3d4a63`. 점프 프레임은 없다.
- 배경은 `public/pic/village-bg.png` (192×176 PNG, 100KB 미만). 스크립트로 그린 그림이며 같은 입력이면 항상 같다 — 결과 PNG 의 sha256 은 `df2f72421c2d58e6511ba1b4878c9091f8df6f4762a94b51c947639ca94cc607` 이어야 하고, 이 그림은 계획 검토 때 사용자가 확인한 것과 같다. 이미지를 못 불러오면 단색 잔디 배경으로 대신 그린다(마을은 깨지지 않는다). **참고 이미지(다른 사람의 청첩장)와 예식장 원본 사진은 쓰지 않는다.**
- DB·API 변경 없음, 새 npm 의존성 없음. 마을은 공개 필드(`id`, `name`, `kind`, `message`, `review`)만 쓴다. `Gallery.tsx` 는 `id="gallery"` 한 군데만 바꾼다.
- 현재 구현의 리뷰 반영 사항은 유지한다: 컨텍스트 실패 격리(try/catch + `setFailed`), 모션 줄이기용 말풍선 4초 타이머, IntersectionObserver 마지막 레코드, 서로게이트 안전 말줄임, 굵은 제목 폭 측정, `e.button !== 0` 가드.
- 절전·접근성·에러 처리는 선행 문서와 같다: 화면 밖·`document.hidden` 에서 루프 정지, `dt` 상한 50ms, `prefers-reduced-motion` 정지 화면(터치·말풍선 동작), 컨텍스트 실패 시 `마을을 불러오지 못했어요`, `role="img"` + `축하해 주신 N명의 도트 마을` 로 시작하는 `aria-label`.
- 테스트는 `tests/unit/**/*.test.ts` (vitest, node 환경, `@` → `src`). 순수 로직과 정적 에셋만 테스트하고, 렌더·터치는 브라우저로 확인한다.
- 코드 주석은 한국어, "왜" 를 짧게. 커밋은 `feat(guestbook): …` 형식의 한국어 메시지 + 트레일러:

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

작업 브랜치는 이미 `feat/guestbook-pixel-village` (PR #43 의 브랜치)이다. 새 브랜치를 만들지 않는다.

---

## File Structure

| 파일 | 구분 | 책임 |
|---|---|---|
| `public/pic/village-bg.png` | 신규 | 위에서 본 정원 예식장 도트 배경(192×176) |
| `tests/unit/villageBg.test.ts` | 신규 | 배경 PNG 규격(192×176, 100KB 미만) 검사 |
| `src/lib/pixelSprite.ts` | 재작성 | 앞·뒤·옆 도트 프레임, id → 외형, 바지 색 지정, 신랑·신부 외형, 색 입히기, 굽기 |
| `src/lib/villageSim.ts` | 재작성 | 4방향 걷기·입장·고정 캐릭터·터치 판정 (순수 함수) |
| `src/components/sections/PixelVillage.tsx` | 재작성 | 배경, 신랑·신부, 갤러리 이동, 자동 말풍선, 화면 해상도 글씨, 터치·절전 |
| `src/components/sections/Gallery.tsx` | 수정 | 최상위 `<section>` 에 `id="gallery"` |
| `tests/unit/pixelSprite.test.ts`, `tests/unit/villageSim.test.ts` | 재작성 | 새 구조에 맞는 테스트 |
| `src/app/village-preview/page.tsx` | **임시(커밋 금지)** | Supabase 없이 마을을 눈으로 확인하는 샘플 페이지 |
| `src/components/sections/Guestbook.tsx` | 변경 없음 | |

경계는 그대로다: `villageSim.ts` 는 `pixelSprite.ts` 의 **타입(`FrameName`)만** import 한다. 에셋 교체 지점은 배경 PNG 한 장과 `pixelSprite.ts` 의 `bakeSprites` 두 곳이다.

---

### Task 1: 배경 이미지와 문서

**Files:**
- Create: `public/pic/village-bg.png`
- Create: `tests/unit/villageBg.test.ts`
- Delete(커밋하지 않은 파일): `docs/superpowers/plans/2026-10-06-guestbook-village-topdown.md` — 이 계획이 대체한 옛 계획(사진 배경)이다.
- Docs(커밋에 포함): `docs/superpowers/specs/2026-10-06-guestbook-village-garden-design.md`(신규), `docs/superpowers/specs/2026-10-06-guestbook-village-topdown-design.md`(신규), `docs/superpowers/specs/2026-10-06-guestbook-pixel-village-design.md`(수정), `docs/superpowers/plans/2026-10-06-guestbook-village-garden.md`(신규)

**Interfaces:**
- Produces (Task 2 가 사용): 정적 파일 `public/pic/village-bg.png` — 브라우저에서 `/pic/village-bg.png` 로 제공되는 192×176 PNG.

작업 폴더(저장소 밖): `SCRATCH=C:/Users/owner/AppData/Local/Temp/claude/D--98-----invitation-one/4942bf69-1275-401d-9206-ab36cc2f7ef5/scratchpad`. **아래 스크립트는 저장소 안에 두거나 커밋하지 않는다.**

- [ ] **Step 1: 옛 계획 파일을 지운다**

```bash
rm docs/superpowers/plans/2026-10-06-guestbook-village-topdown.md
git status --short
```

Expected: 위 파일이 목록에서 사라진다(커밋된 적 없는 파일이라 `git` 기록에는 남지 않는다).

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/unit/villageBg.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// vitest 는 저장소 루트에서 실행된다
const FILE = path.resolve(process.cwd(), "public/pic/village-bg.png");

describe("도트 마당 배경 이미지 (public/pic/village-bg.png)", () => {
  it("192×176 PNG 이다 — 논리 해상도와 같아야 늘어나거나 번지지 않는다", () => {
    const buf = readFileSync(FILE);
    expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(buf.readUInt32BE(16)).toBe(192); // IHDR 너비
    expect(buf.readUInt32BE(20)).toBe(176); // IHDR 높이
  });

  it("가볍다 — 100KB 미만", () => {
    expect(statSync(FILE).size).toBeLessThan(100 * 1024);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/unit/villageBg.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '…/public/pic/village-bg.png'` (2 tests)

- [ ] **Step 4: 배경 그리기 스크립트를 작업 폴더에 쓴다**

`$SCRATCH/village-bg-build/make-garden.cjs`:

```js
// 사용: node make-garden.cjs <출력 PNG>
// 위에서 내려다본 정원 예식장(192×176)을 코드로 그린다. 시드가 같으면 항상 같은 그림이 나온다.
const fs = require("fs");
const { chromium } = require("D:/98.스터디/invitation-one/node_modules/playwright-core");
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = await page.evaluate(() => {
    const W = 192, H = 176;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    let seed = 20261018;
    const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const px = (x, y, c) => rect(Math.round(x), Math.round(y), 1, 1, c);
    const disc = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(x, y, c); };
    const FLOWERS = ["#fbfbf3", "#f4a9b8", "#f7c59a", "#fbfbf3", "#e98fa5"];

    // 1) 잔디 — 큰 얼룩 두 겹으로 변화를 준 뒤 점 잡음
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const patch = Math.sin(x * 0.11 + y * 0.07) + Math.sin(x * 0.05 - y * 0.13);
      const base = patch > 0.9 ? "#93b86d" : patch < -0.9 ? "#7fa75d" : "#88ae65";
      const r = rnd();
      px(x, y, r < 0.1 ? "#76a055" : r > 0.93 ? "#9cc078" : base);
    }

    // 2) 통로 — 단상에서 아래까지 이어지는 모래색 포장길
    const AX0 = 84, AX1 = 107;
    for (let y = 56; y < H; y++) for (let x = AX0; x <= AX1; x++) {
      const edge = x === AX0 || x === AX1;
      const tile = (Math.floor((y - 56) / 6) + Math.floor((x - AX0) / 6)) % 2 === 0;
      const r = rnd();
      px(x, y, edge ? "#c6b384" : r < 0.08 ? "#cdbb8f" : tile ? "#e1d2a8" : "#dccb9f");
    }

    // 3) 단상 + 계단
    rect(68, 26, 56, 32, "#d9c9a0");
    rect(68, 26, 56, 1, "#c2b083"); rect(68, 57, 56, 1, "#b9a77a");
    for (let x = 70; x < 124; x += 8) rect(x, 27, 1, 30, "#cdbb8f");
    for (let i = 0; i < 3; i++) {
      rect(76 + i * 2, 58 + i * 4, 40 - i * 4, 4, i % 2 ? "#e6d8b2" : "#eadfba");
      rect(76 + i * 2, 61 + i * 4, 40 - i * 4, 1, "#bfae82");
    }

    // 4) 화단 — 나무 상자 + 꽃 (단상 양옆)
    const planter = (x, y, w) => {
      rect(x, y + 6, w, 7, "#8a5a3a"); rect(x, y + 6, w, 1, "#a8714b"); rect(x, y + 12, w, 1, "rgba(40,60,30,.35)");
      for (let k = 0; k < w / 2.2; k++) { const fx = x + 2 + Math.floor(rnd() * (w - 4)), fy = y + 1 + Math.floor(rnd() * 6); disc(fx, fy, 2.2, "#5b8c44"); px(fx, fy, FLOWERS[Math.floor(rnd() * FLOWERS.length)]); px(fx + 1, fy - 1, FLOWERS[Math.floor(rnd() * FLOWERS.length)]); }
    };
    planter(40, 40, 24); planter(128, 40, 24);

    // 5) 꽃 아치 — 위쪽 반원 꽃 띠 + 기둥 + 흰 커튼
    for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += 0.045) {
      const cx = 96 + Math.cos(a) * 22, cy = 36 + Math.sin(a) * 18;
      disc(cx, cy, 3, "#4f8240");
      for (let k = 0; k < 3; k++) px(cx + (rnd() - .5) * 5, cy + (rnd() - .5) * 5, FLOWERS[Math.floor(rnd() * FLOWERS.length)]);
    }
    for (const x of [72, 120]) { rect(x, 30, 4, 22, "#f4f4ef"); rect(x + 3, 30, 1, 22, "#d6d6ce"); for (let y = 30; y < 52; y += 4) disc(x + 2, y, 2.4, "#4f8240"), px(x + 2, y, FLOWERS[(y / 4) % FLOWERS.length | 0]); }
    for (const x of [64, 124]) { rect(x, 30, 5, 22, "#fbfbf7"); for (let i = 1; i < 5; i += 2) rect(x + i, 30, 1, 22, "#e4e1d6"); rect(x, 52, 5, 1, "#cfcbbe"); }

    // 6) 통로 옆 꽃길 — 분홍·흰 꽃 덩어리
    const clump = (cx, cy) => {
      disc(cx, cy, 5, "#4d7f3b"); disc(cx - 1, cy - 1, 3.6, "#5f9448");
      for (let k = 0; k < 6; k++) px(cx + Math.round((rnd() - .5) * 8), cy + Math.round((rnd() - .5) * 8), FLOWERS[Math.floor(rnd() * FLOWERS.length)]);
    };
    for (let y = 70; y <= 150; y += 7) { clump(80 + Math.round(rnd() * 2 - 1), y); clump(111 + Math.round(rnd() * 2 - 1), y); }

    // 7) 라벤더 · 오른쪽 꽃덤불
    for (let k = 0; k < 30; k++) { const x = 6 + Math.floor(rnd() * 14), y = 78 + Math.floor(rnd() * 22); rect(x, y, 1, 3, "#9a86c8"); px(x, y - 1, "#b9a8e0"); px(x, y + 3, "#5f8f47"); }
    for (const [x, y, r] of [[178, 74, 8], [184, 94, 7], [176, 112, 7]]) { disc(x, y, r, "#4d7f3b"); disc(x - 1, y - 1, r - 2, "#5f9448"); for (let k = 0; k < r * 2; k++) px(x + Math.round((rnd() - .5) * r * 1.6), y + Math.round((rnd() - .5) * r * 1.6), FLOWERS[Math.floor(rnd() * FLOWERS.length)]); }

    // 8) 나무 — 모서리의 큰 수관(위에서 본 모습)
    const tree = (cx, cy, r) => {
      disc(cx + 1, cy + 2, r, "rgba(30,60,30,0.35)");
      disc(cx, cy, r, "#3e6a34"); disc(cx - 1, cy - 1, r - 2.5, "#588c43");
      for (let k = 0; k < r * 4; k++) { const a = rnd() * Math.PI * 2, d = rnd() * (r - 3); px(cx - 2 + Math.cos(a) * d, cy - 2 + Math.sin(a) * d, rnd() < 0.5 ? "#7fb257" : "#9ccb6a"); }
      for (let k = 0; k < r * 2; k++) { const a = rnd() * Math.PI * 2; px(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), "#2f5528"); }
    };
    for (const [x, y, r] of [[10, 12, 26], [182, 10, 24], [52, -4, 14], [142, -4, 14]]) tree(x, y, r);

    // 9) 잔디밭 소품 — 풀 포기·들꽃
    for (let k = 0; k < 110; k++) {
      const x = 4 + Math.floor(rnd() * (W - 8)), y = 70 + Math.floor(rnd() * (H - 74));
      if (x > AX0 - 8 && x < AX1 + 8) continue;
      if (rnd() < 0.55) { px(x, y, "#6a9650"); px(x - 1, y - 1, "#6a9650"); px(x + 1, y - 1, "#6a9650"); }
      else { px(x, y, FLOWERS[Math.floor(rnd() * FLOWERS.length)]); px(x + 1, y, "#fff6c8"); }
    }
    return cv.toDataURL("image/png");
  });
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  await browser.close(); console.log("ok", out);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: 배경을 그리고 사용자가 확인한 이미지와 같은지 검증한다**

저장소 루트에서(Playwright 의 Chromium 이 이미 설치되어 있다):

```bash
SCRATCH="C:/Users/owner/AppData/Local/Temp/claude/D--98-----invitation-one/4942bf69-1275-401d-9206-ab36cc2f7ef5/scratchpad"
node "$SCRATCH/village-bg-build/make-garden.cjs" "$SCRATCH/village-bg-build/village-bg.png"
sha256sum "$SCRATCH/village-bg-build/village-bg.png"
```

Expected: 해시가 `df2f72421c2d58e6511ba1b4878c9091f8df6f4762a94b51c947639ca94cc607` 와 **같다**(시드가 고정이라 결정적이다). 다르면 커밋하지 말고, PNG 를 열어 눈으로 비교한 뒤 차이를 그대로 보고한다.

- [ ] **Step 6: 배경을 저장소에 넣고 테스트가 통과하는지 확인한다**

```bash
cp "$SCRATCH/village-bg-build/village-bg.png" public/pic/village-bg.png
npx vitest run tests/unit/villageBg.test.ts
```

Expected: PASS — 2 tests. `git status --short` 에 `public/pic/village-bg.png`, 테스트, 문서만 보여야 한다(스크립트는 없어야 한다).

- [ ] **Step 7: 문서와 함께 커밋한다**

```bash
git add public/pic/village-bg.png tests/unit/villageBg.test.ts docs/superpowers/specs/2026-10-06-guestbook-village-garden-design.md docs/superpowers/specs/2026-10-06-guestbook-village-topdown-design.md docs/superpowers/specs/2026-10-06-guestbook-pixel-village-design.md docs/superpowers/plans/2026-10-06-guestbook-village-garden.md
git commit -m "feat(guestbook): 도트 마당 — 정원 예식장 도트 배경과 설계 문서" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 정원 예식장 탑뷰로 교체 (스프라이트 · 이동 · 컴포넌트 · 갤러리 앵커)

세 파일이 서로의 타입에 묶여 있어(`FrameName` 이 바뀌면 옛 `villageSim`·`PixelVillage` 가 컴파일되지 않는다) **한 커밋으로** 바꾼다. 중간 커밋에서 `tsc` 가 깨지지 않게 하기 위해서다.

**Files:**
- Rewrite: `src/lib/pixelSprite.ts`, `src/lib/villageSim.ts`, `src/components/sections/PixelVillage.tsx`
- Modify: `src/components/sections/Gallery.tsx` (`id="gallery"` 한 군데)
- Rewrite: `tests/unit/pixelSprite.test.ts`, `tests/unit/villageSim.test.ts`
- Create(임시, 커밋 금지): `src/app/village-preview/page.tsx`

**Interfaces:**
- Consumes: `/pic/village-bg.png` (Task 1), `type Celebration` from `@/lib/supabase`, `groom`·`bride` from `@/lib/wedding` (각각 `{ name: string, … }`), 페이지 어딘가의 `#gallery` 요소(없어도 동작).
- Produces: 같은 이름의 default export `PixelVillage({ items: Celebration[]; highlightId?: string | null })` — `Guestbook.tsx` 는 바뀌지 않는다. 모듈 인터페이스는 아래와 같다.
  - `pixelSprite.ts`: `SPRITE_W = 16`, `SPRITE_H = 24`, `type SpriteDir = "down" | "up" | "side"`, `type SpriteAnim = "idle" | "walk1" | "walk2"`, `type FrameName = \`${SpriteDir}_${SpriteAnim}\``, `SPRITE_DIRS`, `SPRITE_ANIMS`, `FRAME_NAMES`, `FRAME_ROWS`, `type Hat`, `interface Look { hair; cloth; hat; hatColor; pants? }`, `GROOM_LOOK`, `BRIDE_LOOK`, `hatPatches(dir, hat)`, `hashId`, `lookFromId`, `buildFrameGrid(frame, look)`, `bakeFrame`, `bakeSprites(look)`
  - `villageSim.ts`: `WORLD_W = 192`, `WORLD_H = 176`, `HALF_W`, `BOX_H`, `AREA`, `WALK_SPEED`, `type Rng`, `makeRng`, `type Dir`, `DIRS`, `type Mode`, `interface Walker { id; x; y; dir; mode; timer; clock; entering; fixed }`, `spawnWalker(id, rng, entering)`, `spawnNpc(id, x, y)`, `stepWalker(w, dt, rng, frozen?)`, `spriteFor(w): { frame: FrameName; flip: boolean }`, `pickWalkerAt(walkers, px, py, pad?)`

- [ ] **Step 1: 실패하는 테스트로 교체한다**

`tests/unit/pixelSprite.test.ts` (전체 교체):

```ts
import { describe, it, expect } from "vitest";
import {
  BRIDE_LOOK,
  FRAME_NAMES,
  GROOM_LOOK,
  FRAME_ROWS,
  SPRITE_DIRS,
  SPRITE_H,
  SPRITE_W,
  buildFrameGrid,
  hashId,
  hatPatches,
  lookFromId,
} from "@/lib/pixelSprite";

describe("도트 스프라이트 데이터", () => {
  it("앞·뒤·옆 × 정지·걷기 2 = 9 프레임이다", () => {
    expect(FRAME_NAMES).toHaveLength(9);
    expect(new Set(FRAME_NAMES).size).toBe(9);
  });

  it("모든 프레임이 16×24 이고 허용된 글자만 쓴다", () => {
    for (const f of FRAME_NAMES) {
      const rows = FRAME_ROWS[f];
      expect(rows).toHaveLength(SPRITE_H);
      for (const r of rows) {
        expect(r).toHaveLength(SPRITE_W);
        expect(r).toMatch(/^[.osehcpb]+$/); // 모자(a)·꽃(f)은 덮어쓰기 조각으로만 들어간다
      }
    }
  });

  it("방향마다 모양이 달라 앞·뒤·옆이 구분된다", () => {
    const joined = (f: (typeof FRAME_NAMES)[number]) => FRAME_ROWS[f].join("");
    expect(joined("down_idle")).not.toBe(joined("up_idle"));
    expect(joined("down_idle")).not.toBe(joined("side_idle"));
    expect(joined("up_idle")).not.toBe(joined("side_idle"));
  });

  it("방향마다 걷기 프레임이 정지·서로와 달라 애니메이션이 된다", () => {
    const joined = (f: (typeof FRAME_NAMES)[number]) => FRAME_ROWS[f].join("");
    for (const d of SPRITE_DIRS) {
      expect(joined(`${d}_idle`)).not.toBe(joined(`${d}_walk1`));
      expect(joined(`${d}_idle`)).not.toBe(joined(`${d}_walk2`));
      expect(joined(`${d}_walk1`)).not.toBe(joined(`${d}_walk2`));
    }
  });

  it("앞모습만 눈 두 개, 뒷모습은 눈이 없고, 옆모습은 눈 하나다", () => {
    const eyes = (f: (typeof FRAME_NAMES)[number]) => (FRAME_ROWS[f].join("").match(/e/g) ?? []).length;
    expect(eyes("down_idle")).toBe(2);
    expect(eyes("up_idle")).toBe(0);
    expect(eyes("side_idle")).toBe(1);
  });
});

describe("hatPatches — 모자 조각", () => {
  it("모자 없음은 조각이 없다", () => {
    for (const d of SPRITE_DIRS) expect(hatPatches(d, 0)).toEqual([]);
  });

  it("조각은 머리 줄(0~10)·화면 안에서 머리카락·외곽선·빈칸만 덮는다 (얼굴·눈은 가리지 않는다)", () => {
    for (const d of SPRITE_DIRS) {
      for (const hat of [1, 2] as const) {
        for (const [r, c] of hatPatches(d, hat)) {
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(10);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(SPRITE_W);
          expect("ho.").toContain(FRAME_ROWS[`${d}_idle`][r][c]);
        }
      }
    }
  });

  it("야구모자 챙: 옆에서는 오른쪽으로 튀어나오고, 뒤에서는 보이지 않는다", () => {
    const maxCol = (d: (typeof SPRITE_DIRS)[number]) => Math.max(...hatPatches(d, 1).map(([, c]) => c));
    expect(maxCol("side")).toBeGreaterThan(maxCol("down"));
    expect(maxCol("up")).toBe(maxCol("down"));
  });
});

describe("lookFromId — 하객 id → 외형", () => {
  it("같은 id 는 항상 같은 외형이다", () => {
    expect(lookFromId("guest-1")).toEqual(lookFromId("guest-1"));
    expect(hashId("guest-1")).toBe(hashId("guest-1"));
  });

  it("id 가 다르면 외형이 다양하게 나온다 (머리·옷·모자 종류)", () => {
    const looks = Array.from({ length: 200 }, (_, i) => lookFromId(`id-${i}`));
    expect(new Set(looks.map((l) => l.hair)).size).toBeGreaterThan(3);
    expect(new Set(looks.map((l) => l.cloth)).size).toBeGreaterThan(3);
    expect(new Set(looks.map((l) => l.hat))).toEqual(new Set([0, 1, 2]));
  });
});

describe("바지 색 지정(pants)과 신랑·신부 외형", () => {
  const look = { hair: "#112233", cloth: "#445566", hat: 0 as const, hatColor: "#778899" };
  const countOf = (grid: (string | null)[][], color: string) => grid.flat().filter((c) => c === color).length;

  it("pants 를 지정하면 바지 칸이 그 색이고, 지정하지 않으면 기존 남색이다", () => {
    const withPants = buildFrameGrid("down_idle", { ...look, pants: "#abcdef" });
    const without = buildFrameGrid("down_idle", look);
    expect(countOf(withPants, "#abcdef")).toBeGreaterThan(0);
    expect(countOf(withPants, "#3d4a63")).toBe(0);
    expect(countOf(without, "#3d4a63")).toBe(countOf(withPants, "#abcdef"));
    expect(countOf(without, "#abcdef")).toBe(0);
  });

  it("신랑은 짙은 정장, 신부는 흰 옷에 머리 꽃을 단다", () => {
    expect(GROOM_LOOK.cloth).toBe("#2f3340");
    expect(GROOM_LOOK.pants).toBe("#1e1f26");
    expect(BRIDE_LOOK.cloth).toBe("#f6f3ee");
    expect(BRIDE_LOOK.pants).toBe("#f6f3ee");
    expect(BRIDE_LOOK.hat).toBe(2); // 머리 꽃
    expect(GROOM_LOOK.hat).toBe(0);
  });

  it("신랑·신부는 모든 프레임이 정상적으로 칠해지고 서로 다르게 보인다", () => {
    for (const f of FRAME_NAMES) {
      for (const l of [GROOM_LOOK, BRIDE_LOOK]) {
        const cells = buildFrameGrid(f, l).flat();
        expect(cells.every((c) => c === null || /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
      }
    }
    expect(JSON.stringify(buildFrameGrid("down_idle", GROOM_LOOK))).not.toBe(
      JSON.stringify(buildFrameGrid("down_idle", BRIDE_LOOK))
    );
    expect(buildFrameGrid("down_idle", BRIDE_LOOK).flat()).toContain("#f08aa5"); // 머리 꽃색
  });
});

describe("buildFrameGrid — 색 입히기", () => {
  const look = { hair: "#112233", cloth: "#445566", hat: 0 as const, hatColor: "#778899" };

  it("투명은 null, 머리·옷 칸에는 외형 색이 들어간다", () => {
    const g = buildFrameGrid("down_idle", look);
    expect(g).toHaveLength(SPRITE_H);
    expect(g[0][0]).toBeNull();
    const flat = g.flat();
    expect(flat).toContain("#112233");
    expect(flat).toContain("#445566");
    expect(flat).not.toContain("#778899"); // 모자 없음
  });

  it("야구모자(1)는 모자색을, 꽃(2)은 꽃색을 모든 방향에서 칠한다", () => {
    for (const d of SPRITE_DIRS) {
      expect(buildFrameGrid(`${d}_idle`, { ...look, hat: 1 }).flat()).toContain("#778899");
      expect(buildFrameGrid(`${d}_idle`, { ...look, hat: 2 }).flat()).toContain("#f08aa5");
    }
  });

  it("모든 프레임·모자 조합에서 칠한 칸은 16진 색이다 (undefined 없음)", () => {
    for (const f of FRAME_NAMES) {
      for (const hat of [0, 1, 2] as const) {
        const cells = buildFrameGrid(f, { ...look, hat }).flat();
        expect(cells.every((c) => c === null || /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
      }
    }
  });
});
```

`tests/unit/villageSim.test.ts` (전체 교체):

```ts
import { describe, it, expect } from "vitest";
import {
  AREA,
  BOX_H,
  DIRS,
  HALF_W,
  WALK_SPEED,
  WORLD_H,
  WORLD_W,
  makeRng,
  pickWalkerAt,
  spawnNpc,
  spawnWalker,
  spriteFor,
  stepWalker,
  type Walker,
} from "@/lib/villageSim";

const DT = 1 / 30;

function base(over: Partial<Walker> = {}): Walker {
  return {
    id: "t",
    x: 96,
    y: 100,
    dir: "right",
    mode: "idle",
    timer: 99,
    clock: 0,
    entering: false,
    fixed: false,
    ...over,
  };
}

describe("makeRng", () => {
  it("같은 시드는 같은 수열, 값은 [0,1)", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("spawnWalker", () => {
  it("영역 스폰은 걷는 영역 안에서 서 있는 상태로 시작한다", () => {
    const rng = makeRng(1);
    for (let i = 0; i < 100; i++) {
      const w = spawnWalker(`g${i}`, rng, false);
      expect(w.x).toBeGreaterThanOrEqual(AREA.x0);
      expect(w.x).toBeLessThanOrEqual(AREA.x1);
      expect(w.y).toBeGreaterThanOrEqual(AREA.y0);
      expect(w.y).toBeLessThanOrEqual(AREA.y1);
      expect(w.entering).toBe(false);
      expect(w.mode).toBe("idle");
    }
  });

  it("입장 스폰은 화면 아래 바깥에서 위쪽으로 걸어 들어오는 상태로 시작한다", () => {
    const w = spawnWalker("new", makeRng(2), true);
    expect(w.y).toBeGreaterThan(WORLD_H);
    expect(w.entering).toBe(true);
    expect(w.dir).toBe("up");
    expect(w.mode).toBe("walk");
  });
});

describe("세계 크기와 걷는 영역", () => {
  it("세계는 192×176 이고 걷는 영역은 단상·화단 아래 잔디밭(y 72~176)이다", () => {
    expect(WORLD_W).toBe(192);
    expect(WORLD_H).toBe(176);
    expect(AREA).toEqual({ x0: HALF_W, x1: WORLD_W - HALF_W, y0: 72, y1: WORLD_H });
  });
});

describe("spawnNpc / fixed — 신랑·신부", () => {
  it("고정 캐릭터는 주어진 자리에 앞모습으로 선다", () => {
    const w = spawnNpc("npc-groom", 86, 56);
    expect(w).toMatchObject({ id: "npc-groom", x: 86, y: 56, dir: "down", mode: "idle", entering: false, fixed: true });
  });

  it("고정 캐릭터는 시간이 흘러도(timer 가 0 이하여도) 위치·방향·상태가 변하지 않는다", () => {
    const rng = makeRng(21);
    let w = spawnNpc("npc-bride", 106, 56);
    w = { ...w, timer: -5 }; // 일반 캐릭터라면 곧바로 걷기를 시작했을 상황
    for (let i = 0; i < 600; i++) w = stepWalker(w, DT, rng); // frozen 없이 20초
    expect(w).toMatchObject({ x: 106, y: 56, dir: "down", mode: "idle", fixed: true });
  });

  it("같은 조건의 일반 캐릭터는 걷는다 — 위 테스트가 공허하지 않다는 대조군", () => {
    const rng = makeRng(21);
    let w = base({ x: 106, y: 100, dir: "down", mode: "idle", timer: -5 });
    let moved = false;
    for (let i = 0; i < 600; i++) {
      const next = stepWalker(w, DT, rng);
      if (next.x !== w.x || next.y !== w.y) moved = true;
      w = next;
    }
    expect(moved).toBe(true);
  });

  it("frozen 이어도 고정 캐릭터의 상태는 그대로다", () => {
    const rng = makeRng(23);
    const w0 = spawnNpc("npc-groom", 86, 56);
    const w1 = stepWalker(w0, 1, rng, true);
    expect(w1).toMatchObject({ x: 86, y: 56, dir: "down", mode: "idle", fixed: true });
  });

  it("고정 캐릭터가 있어도 하객은 그대로 걷고, 일반 스폰은 fixed 가 아니다", () => {
    const rng = makeRng(22);
    expect(spawnWalker("g", rng, false).fixed).toBe(false);
    expect(spawnWalker("g", rng, true).fixed).toBe(false);
    const w0 = base({ mode: "walk", dir: "right" });
    expect(stepWalker(w0, 0.5, rng).x).toBeGreaterThan(w0.x);
  });

  it("고정 캐릭터도 터치로 집을 수 있다", () => {
    const npc = spawnNpc("npc-groom", 86, 56);
    expect(pickWalkerAt([npc], 86, 56 - BOX_H / 2)?.id).toBe("npc-groom");
  });
});

describe("stepWalker — 입장", () => {
  it("입장하면 결국 영역 아래 끝에 닿아 일반 상태로 바뀐다", () => {
    const rng = makeRng(3);
    let w = spawnWalker("new", rng, true);
    for (let i = 0; i < 300 && w.entering; i++) w = stepWalker(w, DT, rng);
    expect(w.entering).toBe(false);
    expect(w.y).toBe(AREA.y1);
    expect(w.mode).toBe("idle");
  });

  it("frozen 이어도 입장 중이면 영역에 닿을 때까지 계속 걷는다", () => {
    const rng = makeRng(4);
    let w = spawnWalker("new", rng, true);
    const y0 = w.y;
    w = stepWalker(w, DT, rng, true);
    expect(w.y).toBeLessThan(y0);
    for (let i = 0; i < 300 && w.entering; i++) w = stepWalker(w, DT, rng, true);
    expect(w.entering).toBe(false);
  });
});

describe("stepWalker — 걷기", () => {
  it("걷는 동안 방향대로 한 축만 움직인다", () => {
    const rng = makeRng(5);
    const cases = [
      { dir: "right", axis: "x", sign: 1 },
      { dir: "left", axis: "x", sign: -1 },
      { dir: "down", axis: "y", sign: 1 },
      { dir: "up", axis: "y", sign: -1 },
    ] as const;
    for (const c of cases) {
      const w0 = base({ mode: "walk", dir: c.dir });
      const w1 = stepWalker(w0, 0.5, rng);
      const dx = w1.x - w0.x;
      const dy = w1.y - w0.y;
      expect(c.axis === "x" ? dy : dx).toBe(0);
      expect(c.axis === "x" ? dx : dy).toBeCloseTo(c.sign * WALK_SPEED * 0.5, 9);
    }
  });

  it("오른쪽 끝에 닿으면 영역 안으로 되돌리고 다른 방향으로 바꾼다", () => {
    const rng = makeRng(6);
    const w = stepWalker(base({ x: AREA.x1 - 0.1, mode: "walk", dir: "right" }), 1, rng);
    expect(w.x).toBe(AREA.x1);
    expect(w.dir).not.toBe("right");
  });

  it("네 모서리·가장자리에서 모두 영역 안에 머물고 막힌 방향을 피한다", () => {
    const rng = makeRng(7);
    const edges = [
      { x: AREA.x0 + 0.1, y: 100, dir: "left" },
      { x: 96, y: AREA.y0 + 0.1, dir: "up" },
      { x: 96, y: AREA.y1 - 0.1, dir: "down" },
    ] as const;
    for (const e of edges) {
      const w = stepWalker(base({ x: e.x, y: e.y, mode: "walk", dir: e.dir }), 1, rng);
      expect(w.x).toBeGreaterThanOrEqual(AREA.x0);
      expect(w.y).toBeGreaterThanOrEqual(AREA.y0);
      expect(w.y).toBeLessThanOrEqual(AREA.y1);
      expect(w.dir).not.toBe(e.dir);
    }
  });

  it("frozen 이면 영역 안에서 걷지 않고 제자리에 선다", () => {
    const rng = makeRng(8);
    const w0 = base({ mode: "walk", dir: "right" });
    const w1 = stepWalker(w0, 1, rng, true);
    expect(w1.x).toBe(w0.x);
    expect(w1.y).toBe(w0.y);
    expect(w1.mode).toBe("idle");
  });

  it("입력 객체를 바꾸지 않는다 (순수 함수)", () => {
    const rng = makeRng(9);
    const w0 = base({ mode: "walk" });
    const snapshot = JSON.stringify(w0);
    stepWalker(w0, DT, rng);
    expect(JSON.stringify(w0)).toBe(snapshot);
  });

  it("같은 시드면 결과가 같다", () => {
    const run = (seed: number) => {
      const rng = makeRng(seed);
      let w = spawnWalker("a", rng, false);
      for (let i = 0; i < 600; i++) w = stepWalker(w, DT, rng);
      return JSON.stringify(w);
    };
    expect(run(11)).toBe(run(11));
  });

  it("긴 시간 시뮬레이션해도 항상 영역 안이고, 한 프레임에 한 축만 변하며, 실제로 걷는다 (100명 × 2분)", () => {
    const rng = makeRng(2026);
    let ws = Array.from({ length: 100 }, (_, i) => spawnWalker(`g${i}`, rng, i % 3 === 0));
    // expect 를 36만 번 부르면 느리므로 위반 사례만 모았다가 마지막에 한 번 검사한다.
    const violations: string[] = [];
    let moved = 0;
    const dirsSeen = new Set<string>();
    for (let t = 0; t < 120 * 30; t++) {
      const next = ws.map((w) => stepWalker(w, DT, rng));
      for (let i = 0; i < next.length; i++) {
        const a = ws[i];
        const b = next[i];
        if (b.entering === false && a.entering === false) {
          const dx = Math.abs(b.x - a.x);
          const dy = Math.abs(b.y - a.y);
          // 영역 끝에서 안쪽으로 되돌릴 때를 빼면 한 축만 변해야 한다
          if (dx > 1e-9 && dy > 1e-9) violations.push(`diag t=${t} ${JSON.stringify(b)}`);
          if (dx > 1e-9 || dy > 1e-9) moved++;
          if (b.mode === "walk") dirsSeen.add(b.dir);
        }
        const bad =
          !Number.isFinite(b.x) ||
          !Number.isFinite(b.y) ||
          (!b.entering &&
            (b.x < AREA.x0 - 1e-6 || b.x > AREA.x1 + 1e-6 || b.y < AREA.y0 - 1e-6 || b.y > AREA.y1 + 1e-6));
        if (bad) violations.push(`out t=${t} ${JSON.stringify(b)}`);
      }
      ws = next;
      if (violations.length >= 5) break;
    }
    expect(violations.slice(0, 5)).toEqual([]);
    expect(moved).toBeGreaterThan(10000); // 걷기가 실제로 일어났다
    expect(dirsSeen).toEqual(new Set(DIRS)); // 네 방향 모두 쓰였다
    expect(ws.every((w) => !w.entering)).toBe(true); // 입장도 모두 끝났다
  });
});

describe("spriteFor", () => {
  it("위·아래는 뒤·앞 모습, 좌우는 옆모습이고 왼쪽만 반전한다", () => {
    expect(spriteFor(base({ dir: "down" }))).toEqual({ frame: "down_idle", flip: false });
    expect(spriteFor(base({ dir: "up" }))).toEqual({ frame: "up_idle", flip: false });
    expect(spriteFor(base({ dir: "right" }))).toEqual({ frame: "side_idle", flip: false });
    expect(spriteFor(base({ dir: "left" }))).toEqual({ frame: "side_idle", flip: true });
  });

  it("걷는 중이면 걷기 프레임이 번갈아 나온다", () => {
    const seen = new Set<string>();
    for (let c = 0; c < 1; c += 0.05) seen.add(spriteFor(base({ mode: "walk", dir: "down", clock: c })).frame);
    expect(seen.has("down_walk1")).toBe(true);
    expect(seen.has("down_walk2")).toBe(true);
    expect(seen.has("down_idle")).toBe(true);
  });
});

describe("pickWalkerAt — 터치 판정", () => {
  const a = base({ id: "a", x: 50, y: 100 });
  const b = base({ id: "b", x: 54, y: 102 }); // a 와 겹침, 더 아래(앞)

  it("캐릭터 몸통 안을 누르면 그 캐릭터를 돌려준다", () => {
    expect(pickWalkerAt([a], 50, 100 - BOX_H / 2)?.id).toBe("a");
  });

  it("빈 곳을 누르면 null", () => {
    expect(pickWalkerAt([a], 150, 40)).toBeNull();
  });

  it("겹치면 더 앞(아래)에 그려진 캐릭터가 우선한다", () => {
    expect(pickWalkerAt([a, b], 52, 95)?.id).toBe("b");
    expect(pickWalkerAt([b, a], 52, 95)?.id).toBe("b");
  });

  it("몸통 좌우 끝 + 여유(pad) 밖은 누르지 않은 것으로 본다", () => {
    expect(pickWalkerAt([a], 50 + HALF_W + 3 + 0.5, 90)).toBeNull();
    expect(pickWalkerAt([a], 50 + HALF_W + 2, 90)?.id).toBe("a");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/unit/pixelSprite.test.ts tests/unit/villageSim.test.ts`
Expected: FAIL — 새 export(`SPRITE_DIRS`, `hatPatches`, `GROOM_LOOK`, `AREA`, `spawnNpc`, `spriteFor`, 입장 스폰 등)가 아직 없어 다수의 테스트가 실패한다.

- [ ] **Step 3: 스프라이트 구현을 쓴다**

`src/lib/pixelSprite.ts` (전체 교체):

```ts
/**
 * 도트 마을 캐릭터 — 16×24 픽셀, 코드로 만든 오리지널 스프라이트(앞·뒤·옆 3방향).
 * 프레임은 머리(11줄) + 몸(7줄) + 다리(6줄)를 이어 붙여 만든다.
 * 글자 → 색:  . 투명  o 외곽선  s 피부  e 눈  h 머리색  c 옷색  p 바지  b 신발  a 모자색  f 꽃
 * 왼쪽으로 걷는 모습은 옆모습(오른쪽을 봄)을 좌우 반전해서 쓴다 — 반전은 그리는 쪽(PixelVillage)의 몫이다.
 * 하객 id 를 해시해 머리색·옷색·모자를 정하므로 같은 하객은 항상 같은 모습이다.
 * (나중에 시트 PNG 로 교체해도 villageSim.ts 는 손대지 않도록 이 파일에만 그림 데이터를 둔다.)
 */

export const SPRITE_W = 16;
export const SPRITE_H = 24;

/** down = 앞(아래로 걸을 때), up = 뒤(위로 걸을 때), side = 옆(오른쪽을 봄) */
export type SpriteDir = "down" | "up" | "side";
export type SpriteAnim = "idle" | "walk1" | "walk2";
export type FrameName = `${SpriteDir}_${SpriteAnim}`;

export const SPRITE_DIRS: readonly SpriteDir[] = ["down", "up", "side"];
export const SPRITE_ANIMS: readonly SpriteAnim[] = ["idle", "walk1", "walk2"];
export const FRAME_NAMES: readonly FrameName[] = SPRITE_DIRS.flatMap((d) =>
  SPRITE_ANIMS.map((a): FrameName => `${d}_${a}`)
);

const HEAD: Record<SpriteDir, string[]> = {
  down: [
    "................",
    "....oooooooo....",
    "...ohhhhhhhho...",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhsssssshho..",
    "..ohssssssssho..",
    "..ohssessessho..",
    "..ohssssssssho..",
    "...osssssssso...",
    "....oooooooo....",
  ],
  up: [
    "................",
    "....oooooooo....",
    "...ohhhhhhhho...",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "...ohhhhhhhho...",
    "....oooooooo....",
  ],
  side: [
    "................",
    "....oooooooo....",
    "...ohhhhhhhho...",
    "..ohhhhhhhhhho..",
    "..ohhhhhhhhhho..",
    "..ohhhhhhsssso..",
    "..ohhhhsssssso..",
    "..ohhhhsssesso..",
    "..ohhhhsssssso..",
    "...ohhhssssso...",
    "....oooooooo....",
  ],
};

const BODY_FRONT = [
  ".....occccco....",
  "...occcccccco...",
  "...occcccccco...",
  "...osccccccso...",
  "....occcccco....",
  "....occcccco....",
  "....oooooooo....",
];

const BODY_SIDE = [
  ".....occcco.....",
  "....occcccco....",
  "....occcccco....",
  "....occsscco....",
  "....occcccco....",
  "....occcccco....",
  "....oooooooo....",
];

const BODY: Record<SpriteDir, string[]> = {
  down: BODY_FRONT,
  up: BODY_FRONT,
  side: BODY_SIDE,
};

/** 앞·뒤는 왼발/오른발이 번갈아 앞서고, 옆은 다리를 벌렸다 모은다 */
const LEGS_FRONT: Record<SpriteAnim, string[]> = {
  idle: [
    "....oppppppo....",
    "....oppooppo....",
    "....oppooppo....",
    "....obboobbo....",
    "....oooooooo....",
    "................",
  ],
  walk1: [
    "....oppppppo....",
    "....oppooppo....",
    "....obbooppo....",
    "....ooooobbo....",
    "........oooo....",
    "................",
  ],
  walk2: [
    "....oppppppo....",
    "....oppooppo....",
    "....oppoobbo....",
    "....obbooooo....",
    "....oooo........",
    "................",
  ],
};

const LEGS_SIDE: Record<SpriteAnim, string[]> = {
  idle: [
    "....oppppppo....",
    "....oppppppo....",
    "....oppppppo....",
    "....obbbbbbo....",
    "....oooooooo....",
    "................",
  ],
  walk1: [
    "....oppppppo....",
    "...oppo..oppo...",
    "..oppo....oppo..",
    "..obbo....obbo..",
    "..oooo....oooo..",
    "................",
  ],
  walk2: [
    "....oppppppo....",
    ".....oppppo.....",
    ".....oppppo.....",
    ".....obbbbo.....",
    ".....oooooo.....",
    "................",
  ],
};

const LEGS: Record<SpriteDir, Record<SpriteAnim, string[]>> = {
  down: LEGS_FRONT,
  up: LEGS_FRONT,
  side: LEGS_SIDE,
};

function dirOf(frame: FrameName): SpriteDir {
  return frame.split("_")[0] as SpriteDir;
}

function animOf(frame: FrameName): SpriteAnim {
  return frame.split("_")[1] as SpriteAnim;
}

/** 프레임 → 24줄 문자열 (테스트·렌더가 공유) */
export const FRAME_ROWS = Object.fromEntries(
  FRAME_NAMES.map((f) => [f, [...HEAD[dirOf(f)], ...BODY[dirOf(f)], ...LEGS[dirOf(f)][animOf(f)]]])
) as Record<FrameName, string[]>;

const HAIR_COLORS = ["#3b2a20", "#6b4226", "#c98b3d", "#e8c26a", "#a8483a", "#4a4e69", "#2f2f2f", "#d98fb0"];
const CLOTH_COLORS = ["#788c63", "#4a5a3e", "#b89b6e", "#5f8fb4", "#c46b6b", "#8a6fb0", "#e0a63c", "#4fa39a", "#d98fb0"];
const HAT_COLORS = ["#c46b6b", "#5f8fb4", "#e0a63c", "#4a5a3e"];

const FIXED: Record<string, string> = {
  o: "#2b2118",
  s: "#f6d3b0",
  e: "#2b2118",
  p: "#3d4a63",
  b: "#6b4a2e",
  f: "#f08aa5",
};

/** 모자 종류 — 0 없음, 1 야구모자, 2 머리 꽃 */
export type Hat = 0 | 1 | 2;

export interface Look {
  hair: string;
  cloth: string;
  hat: Hat;
  hatColor: string;
  /** 바지 색 — 없으면 기본 남색(FIXED.p). 신랑·신부 옷차림에 쓴다 */
  pants?: string;
}

/** 단상 위 신랑·신부 — 하객 id 해시가 아니라 고정 외형 */
export const GROOM_LOOK: Look = { hair: "#2a2018", cloth: "#2f3340", hat: 0, hatColor: "#000000", pants: "#1e1f26" };
export const BRIDE_LOOK: Look = { hair: "#2a2018", cloth: "#f6f3ee", hat: 2, hatColor: "#000000", pants: "#f6f3ee" };

type Patch = [row: number, col: number, ch: string];

const span = (row: number, c0: number, c1: number, ch: string): Patch[] =>
  Array.from({ length: c1 - c0 + 1 }, (_, i): Patch => [row, c0 + i, ch]);

/**
 * 모자 조각 — 머리 줄(0~10)에만 덮어쓴다. 야구모자는 앞에서는 챙이 가로로, 옆에서는 오른쪽으로 튀어나오고,
 * 뒤에서는 챙이 보이지 않는다. 꽃은 앞·뒤에서는 오른쪽 위, 옆에서는 뒤통수 쪽에 단다.
 */
export function hatPatches(dir: SpriteDir, hat: Hat): Patch[] {
  if (hat === 0) return [];
  if (hat === 2) {
    const c = dir === "side" ? 5 : 9;
    return [...span(2, c, c + 1, "f"), ...span(3, c, c + 1, "f")];
  }
  if (dir === "down") return [...span(2, 4, 11, "a"), ...span(3, 3, 12, "a"), ...span(4, 3, 12, "a")];
  if (dir === "up") return [...span(2, 4, 11, "a"), ...span(3, 3, 12, "a"), ...span(4, 3, 12, "a")];
  return [...span(2, 4, 11, "a"), ...span(3, 3, 12, "a"), ...span(4, 3, 15, "a")];
}

/** FNV-1a 32bit — 같은 id 는 항상 같은 값 */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function lookFromId(id: string): Look {
  const h = hashId(id);
  return {
    hair: HAIR_COLORS[h % HAIR_COLORS.length],
    cloth: CLOTH_COLORS[(h >>> 4) % CLOTH_COLORS.length],
    hat: ((h >>> 9) % 3) as Hat,
    hatColor: HAT_COLORS[(h >>> 12) % HAT_COLORS.length],
  };
}

/** 프레임 + 외형 → 색 격자 (null = 투명). 순수 함수라 테스트가 쉽다. */
export function buildFrameGrid(frame: FrameName, look: Look): (string | null)[][] {
  const rows = FRAME_ROWS[frame].map((r) => r.split(""));
  for (const [r, c, ch] of hatPatches(dirOf(frame), look.hat)) rows[r][c] = ch;
  return rows.map((row) =>
    row.map((ch) => {
      if (ch === ".") return null;
      if (ch === "h") return look.hair;
      if (ch === "c") return look.cloth;
      if (ch === "a") return look.hatColor;
      if (ch === "p") return look.pants ?? FIXED.p;
      return FIXED[ch] ?? null;
    })
  );
}

/** 색 격자를 오프스크린 캔버스에 한 번만 구워 둔다 (브라우저 전용 — 테스트 대상 아님) */
export function bakeFrame(grid: (string | null)[][]): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = SPRITE_W;
  cv.height = SPRITE_H;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  grid.forEach((row, y) =>
    row.forEach((color, x) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    })
  );
  return cv;
}

/** 한 하객의 전 프레임을 구워 돌려준다 */
export function bakeSprites(look: Look): Record<FrameName, HTMLCanvasElement> {
  const out = {} as Record<FrameName, HTMLCanvasElement>;
  for (const f of FRAME_NAMES) out[f] = bakeFrame(buildFrameGrid(f, look));
  return out;
}
```

Run: `npx vitest run tests/unit/pixelSprite.test.ts`
Expected: PASS — 16 tests

- [ ] **Step 4: 이동 로직 구현을 쓴다**

`src/lib/villageSim.ts` (전체 교체):

```ts
import type { FrameName } from "@/lib/pixelSprite";

/**
 * 도트 마당 이동 로직 — 렌더·DOM 과 무관한 순수 함수 모음. (바람의 나라식 탑뷰, 정원 예식장)
 * 좌표는 논리 해상도(192×176) 기준이고 (x, y) 는 캐릭터의 '발 밑 중앙'이다.
 * 캐릭터는 상·하·좌·우 한 방향씩만 걷는다(대각선 없음). 장애물·캐릭터끼리의 충돌은 없다.
 * 신랑·신부처럼 `fixed` 인 캐릭터는 단상 위에 서서 움직이지 않는다.
 */

export const WORLD_W = 192;
export const WORLD_H = 176;
/** 캐릭터 가로 반폭 */
export const HALF_W = 8;
export const BOX_H = 24;

/** 걸을 수 있는 영역 — 발 위치 기준. 단상·화단(위) 아래의 잔디밭 전체 */
export const AREA = { x0: HALF_W, x1: WORLD_W - HALF_W, y0: 72, y1: WORLD_H } as const;

export const WALK_SPEED = 24; // px/s
/** 새 하객이 걸어 들어오기 시작하는 발 위치 — 화면 아래 바깥(몸이 막 가려지는 높이) */
const ENTER_Y = WORLD_H + BOX_H;

export type Rng = () => number;

/** mulberry32 — 시드가 같으면 같은 수열 (테스트 재현용) */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Dir = "down" | "up" | "left" | "right";
export const DIRS: readonly Dir[] = ["down", "up", "left", "right"];
export type Mode = "idle" | "walk";

export interface Walker {
  id: string;
  x: number;
  y: number;
  /** 보고 있는(걷는) 방향 */
  dir: Dir;
  mode: Mode;
  /** 현재 행동이 끝나기까지 남은 시간(초) */
  timer: number;
  /** 걷기 프레임용 누적 시간(초) */
  clock: number;
  /** true 면 화면 아래 바깥에서 영역으로 걸어 들어오는 중 */
  entering: boolean;
  /** true 면 움직이지 않는 고정 캐릭터(신랑·신부) */
  fixed: boolean;
}

/** 신랑·신부 같은 고정 캐릭터 — (x, y) 에 앞모습으로 서서 움직이지 않는다 */
export function spawnNpc(id: string, x: number, y: number): Walker {
  return { id, x, y, dir: "down", mode: "idle", timer: 0, clock: 0, entering: false, fixed: true };
}

/** entering=true 면 화면 아래 가장자리 바깥에서 걸어 들어오며 등장, 아니면 영역 안 임의 위치에 서서 시작 */
export function spawnWalker(id: string, rng: Rng, entering: boolean): Walker {
  const x = AREA.x0 + rng() * (AREA.x1 - AREA.x0);
  if (entering) {
    return { id, x, y: ENTER_Y, dir: "up", mode: "walk", timer: 0, clock: 0, entering: true, fixed: false };
  }
  const y = AREA.y0 + rng() * (AREA.y1 - AREA.y0);
  return {
    id,
    x,
    y,
    dir: DIRS[Math.floor(rng() * DIRS.length)],
    mode: "idle",
    timer: 0.2 + rng() * 2,
    clock: rng() * 10,
    entering: false,
    fixed: false,
  };
}

function pickDirExcept(rng: Rng, blocked: Dir): Dir {
  const others = DIRS.filter((d) => d !== blocked);
  return others[Math.floor(rng() * others.length)];
}

/**
 * 한 프레임 진행. 새 객체를 돌려주며 입력 w 는 바꾸지 않는다.
 * frozen=true(말풍선을 보는 중)면 영역 안에서는 멈춘다. 입장 중이면 영역에 닿을 때까지 계속 걷는다.
 */
export function stepWalker(w: Walker, dt: number, rng: Rng, frozen = false): Walker {
  const n: Walker = { ...w, clock: w.clock + dt };

  if (n.fixed) return n;

  if (n.entering) {
    n.y -= WALK_SPEED * dt;
    if (n.y <= AREA.y1) {
      n.y = AREA.y1;
      n.entering = false;
      n.mode = "idle";
      n.timer = 0.5;
    }
    return n;
  }

  if (frozen) {
    n.mode = "idle";
    return n;
  }

  n.timer -= dt;
  if (n.mode === "walk") {
    const d = WALK_SPEED * dt;
    if (n.dir === "left") n.x -= d;
    else if (n.dir === "right") n.x += d;
    else if (n.dir === "up") n.y -= d;
    else n.y += d;
    const outX = n.x < AREA.x0 || n.x > AREA.x1;
    const outY = n.y < AREA.y0 || n.y > AREA.y1;
    if (outX || outY) {
      // 영역 끝에 닿으면 안쪽으로 되돌리고 막힌 방향을 뺀 다른 방향으로 계속 걷는다
      n.x = Math.min(AREA.x1, Math.max(AREA.x0, n.x));
      n.y = Math.min(AREA.y1, Math.max(AREA.y0, n.y));
      n.dir = pickDirExcept(rng, n.dir);
    }
  }

  if (n.timer <= 0) {
    if (n.mode === "walk") {
      n.mode = "idle";
      n.timer = 0.5 + rng() * 1.5;
    } else {
      n.mode = "walk";
      n.dir = DIRS[Math.floor(rng() * DIRS.length)];
      n.timer = 0.6 + rng() * 1.4;
    }
  }
  return n;
}

const WALK_CYCLE = ["walk1", "idle", "walk2", "idle"] as const;

/** 지금 그릴 스프라이트 프레임. 왼쪽은 옆모습을 좌우 반전(flip)해서 그린다. */
export function spriteFor(w: Walker): { frame: FrameName; flip: boolean } {
  const view = w.dir === "left" || w.dir === "right" ? "side" : w.dir;
  const anim = w.mode === "walk" ? WALK_CYCLE[Math.floor(w.clock * 6) % WALK_CYCLE.length] : "idle";
  return { frame: `${view}_${anim}`, flip: w.dir === "left" };
}

/** 논리 좌표 (px, py) 를 누른 캐릭터 중 가장 앞(아래)에 그려진 것. 터치 여유 pad 포함. */
export function pickWalkerAt(
  walkers: Iterable<Walker>,
  px: number,
  py: number,
  pad = 3
): Walker | null {
  let hit: Walker | null = null;
  for (const w of walkers) {
    if (
      px >= w.x - HALF_W - pad &&
      px <= w.x + HALF_W + pad &&
      py >= w.y - BOX_H - pad &&
      py <= w.y + pad
    ) {
      if (!hit || w.y >= hit.y) hit = w;
    }
  }
  return hit;
}
```

Run: `npx vitest run tests/unit/villageSim.test.ts`
Expected: PASS — 25 tests

- [ ] **Step 5: 컴포넌트를 교체한다**

`src/components/sections/PixelVillage.tsx` (전체 교체):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Celebration } from "@/lib/supabase";
import { bride, groom } from "@/lib/wedding";
import {
  BRIDE_LOOK,
  GROOM_LOOK,
  SPRITE_H,
  SPRITE_W,
  bakeSprites,
  lookFromId,
  type FrameName,
  type Look,
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
/** 정원 예식장 배경 — 192×176, 걷는 영역은 villageSim.ts 의 AREA */
const BG_SRC = "/pic/village-bg.png";

type Sprites = Record<FrameName, HTMLCanvasElement>;

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
}

/** 단상 위 신랑·신부 — 발 위치는 아치 아래 */
const NPCS: ReadonlyArray<{ id: string; x: number; y: number; look: Look; info: Info }> = [
  {
    id: "npc-groom",
    x: 86,
    y: 56,
    look: GROOM_LOOK,
    info: { name: groom.name, text: COUPLE_TEXT, npc: true, tagColor: "#b89b6e" },
  },
  {
    id: "npc-bride",
    x: 106,
    y: 56,
    look: BRIDE_LOOK,
    info: { name: bride.name, text: COUPLE_TEXT, npc: true, tagColor: "#d98fb0" },
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
  ctx.fillStyle = "#88ae65";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, sprites: Sprites): void {
  const { frame, flip } = spriteFor(w);
  const sprite = sprites[frame];
  const dx = Math.round(w.x - SPRITE_W / 2);
  const dy = Math.round(w.y - SPRITE_H);
  if (!flip) {
    ctx.drawImage(sprite, dx, dy);
    return;
  }
  ctx.save();
  ctx.translate(dx + SPRITE_W, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, 0, 0);
  ctx.restore();
}

/** 화면 해상도(캔버스 픽셀) 좌표계에서 그리는 글씨 설정 — s: 도트 배율, fp: 글자 크기(px) */
interface TextMetrics {
  s: number;
  fp: number;
  /** 캔버스 픽셀 / css 픽셀 */
  ratio: number;
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  t: TextMetrics,
  text: string,
  cx: number,
  footY: number,
  color: string
): void {
  ctx.font = `${t.fp}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = Math.round(t.fp * 0.45);
  const h = Math.round(t.fp * 1.4);
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const x = Math.round(Math.min(WORLD_W * t.s - w - 2, Math.max(2, cx * t.s - w / 2)));
  const y = Math.round(Math.min(WORLD_H * t.s - h - 2, (footY + 1) * t.s));
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
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
  const y = Math.max(3, Math.round((w.y - SPRITE_H - 4) * t.s - bh - t.fp * 0.6));
  const tailX = Math.round(Math.min(x + bw - t.fp, Math.max(x + t.fp, w.x * t.s)));
  const tail = Math.round(t.fp * 0.6);
  const border = Math.max(1, Math.round(t.ratio));

  ctx.fillStyle = "#b89b6e";
  ctx.fillRect(x - border, y - border, bw + border * 2, bh + border * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, bw, bh);
  ctx.beginPath();
  ctx.moveTo(tailX - tail, y + bh);
  ctx.lineTo(tailX + tail, y + bh);
  ctx.lineTo(tailX, y + bh + tail);
  ctx.closePath();
  ctx.fill();

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
  const spritesRef = useRef<Map<string, Sprites>>(new Map());
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

    const draw = () => {
      // 1) 도트 세계 — 배경과 캐릭터(아래쪽 캐릭터가 위쪽을 가린다)
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawBackground(ctx, bg);
      const list = [...walkersRef.current.values()].sort((a, b) => a.y - b.y);
      for (const w of list) {
        const sp = spritesRef.current.get(w.id);
        if (sp) drawWalker(ctx, w, sp);
      }
      // 2) 글씨 — 화면 해상도로 그려 또렷하게
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const t: TextMetrics = { s: scale, fp: Math.round(FONT_CSS * ratio), ratio };
      for (const w of list) {
        const info = infoRef.current.get(w.id);
        if (!info || w.y > WORLD_H) continue; // 아직 화면 아래 바깥에서 올라오는 중이면 이름표도 숨긴다
        const color = info.tagColor ?? (w.id === mineRef.current ? "#b89b6e" : "rgba(43,33,24,0.62)");
        drawTag(ctx, t, clipName(info.name), w.x, w.y, color);
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

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth || WORLD_W;
      scale = Math.max(2, Math.ceil((cssW * dpr) / WORLD_W));
      canvas.width = WORLD_W * scale;
      canvas.height = WORLD_H * scale;
      ratio = canvas.width / cssW;
      draw();
    };

    /** 말풍선이 없을 때 메시지가 있는 하객 한 명을 무작위로 골라 띄운다 */
    const showAutoBubble = (now: number) => {
      const candidates = [...infoRef.current.entries()].filter(
        ([id, info]) => !info.npc && info.text && walkersRef.current.has(id)
      );
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
    try {
      for (const n of NPCS) {
        infoRef.current.set(n.id, n.info);
        if (!spritesRef.current.has(n.id)) spritesRef.current.set(n.id, bakeSprites(n.look));
        next.set(n.id, prev.get(n.id) ?? spawnNpc(n.id, n.x, n.y));
      }
      for (const it of items) {
        ids.add(it.id);
        infoRef.current.set(it.id, {
          name: it.name,
          text: ((it.kind === "직접배달" ? it.review : it.message) ?? "").trim(),
        });
        if (!spritesRef.current.has(it.id)) spritesRef.current.set(it.id, bakeSprites(lookFromId(it.id)));
        next.set(it.id, prev.get(it.id) ?? spawnWalker(it.id, rng, entering));
      }
    } catch {
      // 캔버스 컨텍스트를 못 얻으면 스프라이트를 못 굽는다 — 마을만 폴백 문구로 바꾸고 예외는 밖으로 내보내지 않는다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
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
        aria-label={`축하해 주신 ${items.length}명의 도트 마을. 신랑·신부와 하객 캐릭터를 누르면 말풍선이 보여요.`}
        className={failed ? "hidden" : "block w-full h-auto rounded-sm border border-wedding-gold/20"}
        style={{ imageRendering: "pixelated" }}
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
```

- [ ] **Step 6: 갤러리 섹션에 이동용 id 를 단다**

`src/components/sections/Gallery.tsx` — 파일 안에 `<section className="px-6 pt-5 pb-10 bg-white">` 는 한 군데뿐이다.

old:
```tsx
    <section className="px-6 pt-5 pb-10 bg-white">
```
new:
```tsx
    <section id="gallery" className="px-6 pt-5 pb-10 bg-white">
```

`git diff src/components/sections/Gallery.tsx` 가 이 한 줄만 보여야 한다.

- [ ] **Step 7: 타입·린트·전체 테스트·빌드를 확인한다**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npx eslint src/components/sections/PixelVillage.tsx src/components/sections/Gallery.tsx src/lib/pixelSprite.ts src/lib/villageSim.ts tests/unit`
Expected: 오류·경고 없음

Run: `npm test`
Expected: PASS — 전체 통과(기존 245 + 신규 43 = 288 정도. 숫자가 다르면 기존 테스트가 늘었는지 줄었는지 확인하고, 실패가 없는지가 기준이다)

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 8: 임시 미리보기 페이지를 만든다**

로컬에는 `.env.local` 이 없어 Supabase 가 꺼져 있어서 방명록에서는 마을 탭이 안 보인다. 컴포넌트만 확인하려고 샘플 데이터 페이지를 임시로 만든다. 4초 뒤에 하객이 한 명 추가되어 입장 연출을 볼 수 있고, 아래쪽 큰 빈 `div` 는 "화면 밖에서 루프가 멈추는지" 확인할 스크롤 여백이며, 그 아래 `#gallery` 자리는 신랑·신부를 두 번 눌렀을 때의 스크롤 도착지다.

`src/app/village-preview/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import PixelVillage from "@/components/sections/PixelVillage";
import type { Celebration } from "@/lib/supabase";

const NAMES = [
  "수줍은 펭귄",
  "용감한 수달",
  "행복한 다람쥐",
  "다정한 고래",
  "느긋한 판다",
  "씩씩한 코알라",
  "김*수",
  "이*영",
  "박*준",
  "최*아",
];

function make(i: number): Celebration {
  return {
    id: `preview-${i}`,
    kind: "마음배송",
    name: NAMES[i % NAMES.length],
    area: "서울",
    date: null,
    stamp: "💌",
    message:
      i % 4 === 0
        ? "결혼 진심으로 축하드려요! 오래오래 행복하세요. 두 분의 앞날에 늘 웃음만 가득하길 바랍니다. 정말 정말 축하해요 💐"
        : "축하해요!",
    rating: null,
    review: null,
    reply: null,
    replied_at: null,
    created_at: new Date(2026, 9, 1 + (i % 28)).toISOString(),
  };
}

const initial = Array.from({ length: 24 }, (_, i) => make(i));

export default function VillagePreview() {
  const [items, setItems] = useState(initial);
  // 첫 목록 이후에 들어온 하객은 화면 아래에서 걸어 들어온다
  useEffect(() => {
    const t = setTimeout(() => setItems((prev) => [make(100), ...prev]), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="max-w-sm mx-auto p-6 bg-wedding-cream min-h-screen">
      <PixelVillage items={items} highlightId="preview-3" />
      <div style={{ height: "100vh" }} />
      {/* 갤러리 이동 확인용 — 실제 Gallery.tsx 의 id="gallery" 를 흉내 낸 자리 */}
      <section id="gallery" style={{ height: "100vh" }}>
        갤러리 자리
      </section>
    </main>
  );
}
```

- [ ] **Step 9: 개발 서버를 띄우고 브라우저로 확인한다**

`preview_start` 를 `{ name: "dev" }` 로 호출해(`.claude/launch.json` 에 `dev` 설정이 있다) 서버를 띄운다(서버 실행에 Bash 를 쓰지 않는다). 앱 안 브라우저 탭은 숨겨져 있으면 `requestAnimationFrame` 이 돌지 않아 움직임·루프 정지·자동 말풍선 검증이 0 으로 나온다. 그 경우 **헤드리스 Playwright**(`node_modules/playwright-core`, Chromium 설치됨, 뷰포트 375×812)로 `http://localhost:3000/village-preview` 를 열어 확인하고, 어떤 도구로 확인했는지 보고서에 적는다. 확인할 것(실제로 본 결과만 보고한다):
  1. **배경·캐릭터·글씨:** 콘솔·`pageerror` 에 오류가 없고, 정원 배경(나무, 꽃 아치와 단상, 화단, 꽃길과 모래길)이 도트로 선명하게 보이며, 단상 위에 신랑·신부가 서 있고(이름표 금색/분홍), 24명의 하객이 서 있거나 걷는다. 이름표 글씨가 도트 글씨가 아니라 매끈하고 읽기 쉬운지(스크린샷 확대) 확인한다. `preview-3` 이름표만 금색인지도 본다.
  2. **4방향:** 몇 초 간격의 스크린샷 여러 장으로 하객이 위·아래·좌·우로 걷는 것을 확인한다(대각선으로 미끄러지지 않고, 왼쪽으로 걸을 때 옆모습이 반전된다).
  3. **하객 말풍선:** 하객을 눌러 `이름 + 메시지` 말풍선이 뜨고 그 하객이 멈추는지, 긴 메시지가 3줄에서 `…` 로 잘리는지, 4초 뒤/빈 곳을 누르면 닫히는지 확인한다.
  4. **신랑·신부:** 한 번 누르면 `저를 누르면 사진들 볼 수 있어요!` 말풍선이 뜨는지, **말풍선이 떠 있는 동안 다시 누르면** 말풍선이 닫히고 페이지가 `#gallery` 자리로 부드럽게 스크롤되는지(잠시 기다린 뒤 `window.scrollY` 가 갤러리 위치 근처인지) 확인한다. 말풍선이 없을 때 첫 번째 누름에는 스크롤하지 않아야 한다.
  5. **자동 말풍선:** 아무것도 누르지 않고 기다리면 약 6초 뒤 하객 한 명의 말풍선이 저절로 뜨고 4초 뒤 닫히며, 신랑·신부 말풍선은 저절로 뜨지 않는지 확인한다. 아래 스니펫이 글씨 호출을 모은다(이름표 문자열 외에 하객 메시지 `축하해요!` 등이 보이면 자동 말풍선이 뜬 것이고, `저를 누르면…` 은 보이면 안 된다).

```js
const seen = new Set();
const orig = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { seen.add(String(t)); return orig.call(this, t, ...a); };
await new Promise((r) => setTimeout(r, 9000));
CanvasRenderingContext2D.prototype.fillText = orig;
[...seen];
```

  6. **입장:** 페이지를 연 뒤 약 4초에 하객이 한 명 추가되어 화면 아래 가장자리에서 걸어 올라오는지(스크린샷 2~3장), 화면 안에 들어오기 전에는 이름표가 보이지 않는지 확인한다.
  7. **배경 로드 실패:** Playwright `page.route("**/pic/village-bg.png", r => r.abort())` 로 이미지를 막고 열었을 때 단색 잔디 배경에 신랑·신부·하객이 그려지고 `pageerror` 가 없는지 확인한다.
  8. **컨텍스트 실패:** `HTMLCanvasElement.prototype.getContext = () => null` 로 덮은 초기화 스크립트를 넣고 열었을 때 `마을을 불러오지 못했어요` 가 보이고 `pageerror` 가 없는지 확인한다.
  9. **모션 줄이기:** `emulateMedia({ reducedMotion: "reduce" })` 에서 화면이 정지 상태이고, 자동 말풍선이 뜨지 않으며, 하객을 누르면 말풍선이 뜨고 약 4초 뒤 스스로 닫히는지, 신랑·신부를 두 번 누르면 즉시(부드러운 이동 없이) `#gallery` 로 가는지 확인한다.
  10. **화면 밖 정지:** 아래 스니펫으로 `drawImage` 호출 수를 센다(루프가 돌 때만 증가한다). 이어서 화면 밖에서 10초 이상 기다려도 자동 말풍선(위 스니펫의 `fillText`)이 새로 호출되지 않는지도 확인한다.

```js
let n = 0;
const orig = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function (...a) { n++; return orig.apply(this, a); };
const count = (ms) => new Promise((r) => { n = 0; setTimeout(() => r(n), ms); });
const visible = await count(500);
window.scrollTo(0, document.body.scrollHeight);
await new Promise((r) => setTimeout(r, 300)); // IntersectionObserver 반영 대기
const hidden = await count(500);
window.scrollTo(0, 0);
CanvasRenderingContext2D.prototype.drawImage = orig;
({ visible, hidden });
```

  Expected: `visible` 은 수백 이상, `hidden` 은 `0`.

  **눈으로 볼 때 같이 보고할 것(판단 근거로 쓴다):** 하객이 꽃길·화단 위를 지나가는 모습이 어색한지, 신랑·신부 이름표와 아치가 겹쳐 읽기 어려운지, 모서리 하객의 이름표가 잘리는지, 실제 하객 수(예: 100명)에서의 프레임. 이 항목은 고치지 말고 보고만 한다(설계 문서의 "알고 가는 한계").

이상이 있으면 소스를 고치고 이 단계부터 다시 확인한다.

- [ ] **Step 10: 임시 페이지를 지우고 커밋한다**

```bash
rm -r src/app/village-preview
git status --short
```

`git status` 에 `village-preview` 가 **나오지 않아야** 한다. 서버는 `preview_stop` 으로 끈다.

```bash
git add src/lib/pixelSprite.ts src/lib/villageSim.ts src/components/sections/PixelVillage.tsx src/components/sections/Gallery.tsx tests/unit/pixelSprite.test.ts tests/unit/villageSim.test.ts
git commit -m "feat(guestbook): 도트 마당을 정원 예식장 탑뷰로 교체 — 신랑·신부·갤러리 이동·자동 말풍선" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Finish (컨트롤러)

두 Task 와 최종 리뷰가 끝나면, 이미 PR #43 이 열려 있으므로 새 PR 을 만들지 않는다. 브랜치를 푸시하고 `gh pr edit 43 --body-file …` 로 PR 설명을 메이플식 설명에서 정원 예식장 탑뷰 설명으로 고친다(제목은 `feat(guestbook): 방명록 🏘️ 도트 마을 탭` 그대로 둔다). 배포 미리보기에서 사용자가 볼 체크리스트도 새 방식(4방향 걷기, 정원 배경, 신랑·신부 두 번 누르면 갤러리, 하객 자동 말풍선, 입장 연출, 글씨 선명도, `mapOnly` 모드에서 토글·마을 탭이 안 보임)에 맞게 바꾼다. 고화질 에셋은 나중에 설계 문서의 "에셋 교체 지점"(배경 PNG, `bakeSprites`)으로 바꾼다고 PR 설명에 적는다.
