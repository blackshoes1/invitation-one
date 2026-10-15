# 도트 마당 '2배 해상도(HD)' Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방명록 `🏘️ 마을` 탭의 정원 예식장 마당 그림을 2배 해상도(세계 384×352, 캐릭터 32×48)로 올리고, 캐릭터를 코드에서 즉석으로 그리는 대신 미리 구운 시트 PNG(하객 64종 + 신랑·신부)에서 잘라 그린다. 그림의 원본은 저장소 안의 생성 스크립트다.

**Architecture:** 앱 구조(순수 모듈 `pixelSprite.ts`·`villageSim.ts` + Canvas 컴포넌트 `PixelVillage.tsx`)는 그대로이고, 그림이 들어가는 곳을 PNG 두 장(`village-bg.png`, `village-sprites.png`)으로 모은다. `scripts/village-art/` 의 순수 Node 스크립트(캐릭터 생성기, 배경 그리기, PNG 인코더)가 두 PNG 를 만들고, 테스트가 "커밋된 PNG 가 스크립트 결과와 픽셀까지 같다" 를 보장한다. 앱은 스크립트를 import 하지 않는다. 사람이 그린 시트로 바꿀 때는 PNG 두 장만 같은 규격으로 교체한다.

**Tech Stack:** Next.js 16.3.3, React 19.2, TypeScript strict, Tailwind v4, vitest 3 (node 환경, `@` 별칭), Canvas 2D, Node 내장 `zlib`(PNG). 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-07-guestbook-village-hd-design.md` (이 문서가 대체하지 않는 부분은 `2026-10-06-guestbook-village-garden-design.md`, 그 위에 `…topdown-design.md`, `…pixel-village-design.md` 를 따른다)

## Global Constraints

- **Next.js 16 은 학습 데이터와 다르다** (`AGENTS.md`): 이 계획은 이미 `"use client"` 인 컴포넌트 안의 훅과 DOM API 만 다루고 새 Next API 는 없다. 그래도 Next 가 경고·오류를 내면 보고한다.
- 세계 **384×352**, 캐릭터 프레임 **32×48**, 걷는 영역(발 위치 기준) `x ∈ [16, 368]`, `y ∈ [144, 352]`, 걷기 속도 **48px/s**, 터치 여유 pad **6**, `HALF_W` 16, `BOX_H` 48. 화면에 보이는 크기·속도·배치는 이전(192×176)과 같고 세부만 2배다.
- 이동 규칙(4방향·대각선 없음·끝에서 방향 전환·입장·`frozen`)은 변하지 않는다. 신랑·신부는 `fixed` 캐릭터, 발 위치 신랑 `(172, 112)` / 신부 `(212, 112)`, 이름표 기준 x 신랑 `190`(오른쪽 맞춤) / 신부 `194`(왼쪽 맞춤), 색 금색 `#b89b6e` / 분홍 `#d98fb0`.
- **캐릭터 시트** `public/pic/village-sprites.png`: 288×3168 PNG(9열 × 66줄, 프레임 32×48, 배경 투명, 400KB 미만). 열 순서 `down_idle, down_walk1, down_walk2, up_idle, up_walk1, up_walk2, side_idle, side_walk1, side_walk2`(`side` 는 오른쪽을 봄, 왼쪽은 그릴 때 좌우 반전). 줄 0~63 하객 64종, 줄 64 신랑, 줄 65 신부. 하객은 `hashId(id) % 64` 번째 줄.
- **배경** `public/pic/village-bg.png`: 384×352 PNG(200KB 미만, 모든 픽셀 불투명).
- **그림 생성 스크립트** `scripts/village-art/`(순수 Node ESM, 외부 의존성 없음, 시드 고정 → 항상 같은 그림, `npm run village:art`). 앱 코드는 이 스크립트를 import 하지 않는다. 커밋된 두 PNG 는 스크립트 결과와 **픽셀까지 같아야** 하고(파일 바이트가 아니라 픽셀 — zlib 출력은 환경에 따라 다를 수 있다), 기대 픽셀 해시는 배경 `a69831e4a34724c97a2ff68ccee96968a2c5f348820a41bf2bfe148032f024a0`, 시트 `9687c0d3eeff4c9883a91f580b9026b9bb0fd66536a2200adb24336efba8731e` 이다(사용자가 계획 검토 때 확인한 그림과 같다).
- 렌더링: 도트 세계는 `imageSmoothingEnabled = false`, 캔버스 배율 `max(1, ceil(css폭 × dpr / 384))`. 384px 그림을 줄여 보이므로 캔버스 CSS 에 `image-rendering: pixelated` 를 **쓰지 않는다**(부드러운 보간). 글씨는 지금처럼 화면 해상도로 그린다(약 11 css px). 시트에서 `drawImage(sheet, sx, sy, 32, 48, dx, dy, 32, 48)` 로 잘라 그리고, 하객마다 캔버스를 따로 굽지 않는다.
- 시트를 못 불러오면 `마을을 불러오지 못했어요` 를 보여 준다. 배경만 못 불러오면 단색 잔디로 대신 그리고 캐릭터는 그대로 그린다. 시트가 오기 전에는 이름표·말풍선도 그리지 않는다.
- DB·API 변경 없음, 새 npm 의존성 없음. 마을은 공개 필드(`id`, `name`, `kind`, `message`, `review`)만 쓴다. 신랑·신부 동작(말풍선 → 두 번째 누름에서 `#gallery` 스크롤), 하객 자동 말풍선(6초/4초), 입장, 절전·접근성은 이전 계획 그대로다. `Guestbook.tsx`·`Gallery.tsx` 는 바뀌지 않는다.
- 현재 구현의 리뷰 반영 사항은 유지한다: 모션 줄이기용 말풍선 4초 타이머, IntersectionObserver 마지막 레코드, 서로게이트 안전 말줄임, 굵은 제목 폭 측정, `e.button !== 0` 가드, `touch-manipulation`, 자동 말풍선에서 입장 중 하객 제외, 이름표 기준 x(`tagX`/`tagAlign`). (컨텍스트 실패는 캔버스가 `getContext` 를 못 얻을 때 그대로 `setFailed` 로 처리한다. 동기화 effect 는 더 이상 캔버스를 만들지 않으므로 try/catch 가 필요 없다.)
- 테스트는 `tests/unit/**/*.test.ts` (vitest, node 환경, `@` → `src`). 순수 로직·생성 스크립트·정적 에셋만 테스트하고, 렌더·터치는 브라우저로 확인한다.
- 코드 주석은 한국어, "왜" 를 짧게. 커밋은 `feat(guestbook): …` 형식의 한국어 메시지 + 트레일러:

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

작업 브랜치는 이미 `feat/guestbook-pixel-village` (PR #43 의 브랜치)이다. 새 브랜치를 만들지 않는다.

---

## File Structure

| 파일 | 구분 | 책임 |
|---|---|---|
| `scripts/village-art/png.mjs` | 신규 | 의존성 없는 PNG 인코더/디코더(8비트 RGBA, 줄별 필터 선택) |
| `scripts/village-art/chargen.mjs` | 신규 | 32×48 레이어식 캐릭터 생성기, 하객 64종·신랑·신부 정의, 시트 픽셀 조립 |
| `scripts/village-art/garden.mjs` | 신규 | 384×352 정원 예식장 배경 그리기 |
| `scripts/village-art/build.mjs` | 신규 | 두 PNG 를 `public/pic/` 에 쓰고 픽셀 해시를 출력 |
| `package.json` | 수정 | `village:art` 스크립트 한 줄 |
| `public/pic/village-bg.png` | 교체 | 384×352 정원 배경 |
| `public/pic/village-sprites.png` | 신규 | 캐릭터 시트 288×3168 |
| `tests/unit/villageBg.test.ts` | 수정 | 두 PNG 의 규격(크기·용량) |
| `tests/unit/villageArt.test.ts` | 신규 | PNG 인코더, 생성기 성질, 커밋된 PNG == 스크립트 결과 |
| `src/lib/pixelSprite.ts` | 재작성 | 시트 규격 상수·`lookRowFromId`·`frameRect`·`hashId` (그림 데이터 없음) |
| `src/lib/villageSim.ts` | 수정 | 세계·영역·속도·반폭·pad 상수 2배 |
| `src/components/sections/PixelVillage.tsx` | 수정 | 시트·배경 이미지 로드, 시트에서 잘라 그리기, 좌표 2배, pixelated 제거 |
| `tests/unit/pixelSprite.test.ts`, `tests/unit/villageSim.test.ts` | 재작성 | 새 규격에 맞는 테스트 |
| `src/app/village-preview/page.tsx` | **임시(커밋 금지)** | Supabase 없이 마을을 눈으로 확인하는 샘플 페이지 |

경계: `villageSim.ts` 는 `pixelSprite.ts` 의 **타입(`FrameName`)만** import 한다. 앱 코드는 `scripts/` 를 import 하지 않고, 테스트만 `scripts/village-art/*.mjs` 를 import 한다.

---

### Task 1: 그림 생성 스크립트와 PNG 두 장

이 Task 는 앱 코드를 바꾸지 않는다(옛 컴포넌트는 새 배경을 192×176 으로 줄여 그리므로 깨지지 않는다). 그림 원본·PNG·그 정합성 테스트만 추가한다.

**Files:**
- Create: `scripts/village-art/png.mjs`, `scripts/village-art/chargen.mjs`, `scripts/village-art/garden.mjs`, `scripts/village-art/build.mjs`
- Modify: `package.json` (`village:art` 스크립트)
- Replace/Create: `public/pic/village-bg.png`, `public/pic/village-sprites.png` (스크립트가 만든다)
- Modify: `tests/unit/villageBg.test.ts`; Create: `tests/unit/villageArt.test.ts`
- Docs(커밋에 포함): `docs/superpowers/specs/2026-10-07-guestbook-village-hd-design.md`(신규), `docs/superpowers/specs/2026-10-06-guestbook-village-garden-design.md`(수정), `docs/superpowers/plans/2026-10-07-guestbook-village-hd.md`(신규)

**Interfaces:**
- Produces (Task 2 가 사용): 정적 파일 `/pic/village-bg.png`(384×352), `/pic/village-sprites.png`(288×3168). 규격은 위 Global Constraints.
- `chargen.mjs` 내보내기: `FRAME_W`, `FRAME_H`, `COLUMNS`, `GUEST_LOOKS`, `renderFrame`, `buildGuestLooks`, `GROOM_LOOK`, `BRIDE_LOOK`, `allLooks`, `buildSheet`. `garden.mjs`: `GARDEN_W`, `GARDEN_H`, `drawGarden`. `png.mjs`: `encodePng(width, height, rgba)`, `decodePng(png)`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/unit/villageBg.test.ts` (전체 교체):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// vitest 는 저장소 루트에서 실행된다
const pic = (name: string) => path.resolve(process.cwd(), "public/pic", name);

function pngSize(file: string): { width: number; height: number; signature: string } {
  const buf = readFileSync(file);
  return { signature: buf.subarray(1, 4).toString("ascii"), width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("도트 마당 이미지 규격 (public/pic)", () => {
  it("배경 village-bg.png 는 384×352 PNG 이다 — 세계 크기와 같아야 늘어나거나 번지지 않는다", () => {
    expect(pngSize(pic("village-bg.png"))).toEqual({ signature: "PNG", width: 384, height: 352 });
  });

  it("배경은 가볍다 — 200KB 미만", () => {
    expect(statSync(pic("village-bg.png")).size).toBeLessThan(200 * 1024);
  });

  it("캐릭터 시트 village-sprites.png 는 288×3168 PNG 이다 — 9열 × 66줄(32×48 프레임)", () => {
    expect(pngSize(pic("village-sprites.png"))).toEqual({ signature: "PNG", width: 9 * 32, height: 66 * 48 });
  });

  it("캐릭터 시트도 가볍다 — 400KB 미만", () => {
    expect(statSync(pic("village-sprites.png")).size).toBeLessThan(400 * 1024);
  });
});
```

`tests/unit/villageArt.test.ts` (신규):

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodePng, encodePng } from "../../scripts/village-art/png.mjs";
import {
  COLUMNS,
  FRAME_H,
  FRAME_W,
  GUEST_LOOKS,
  allLooks,
  buildGuestLooks,
  buildSheet,
} from "../../scripts/village-art/chargen.mjs";
import { GARDEN_H, GARDEN_W, drawGarden } from "../../scripts/village-art/garden.mjs";

const pic = (name: string) => path.resolve(process.cwd(), "public/pic", name);
const readPng = (name: string) => decodePng(readFileSync(pic(name)));

describe("PNG 인코더/디코더", () => {
  // 필터가 줄마다 달라지도록 가로·세로 그라데이션·잡음이 섞인 그림
  const w = 23, h = 17;
  const rgba = new Uint8Array(w * h * 4);
  let seed = 5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const o = (y * w + x) * 4;
      rgba[o] = y < 6 ? x * 10 : (seed >>> 24);
      rgba[o + 1] = y * 14;
      rgba[o + 2] = (x * 7 + y * 5) & 0xff;
      rgba[o + 3] = x % 5 === 0 ? 0 : 255;
    }
  }

  it("인코딩한 PNG 를 디코딩하면 원래 픽셀과 크기가 그대로 나온다", () => {
    const png = encodePng(w, h, rgba);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const back = decodePng(png);
    expect(back.width).toBe(w);
    expect(back.height).toBe(h);
    expect(Buffer.from(back.rgba).equals(Buffer.from(rgba))).toBe(true);
  });

  it("픽셀 길이가 가로×세로×4 와 다르면 거부한다", () => {
    expect(() => encodePng(3, 3, new Uint8Array(10))).toThrow();
  });

  it("PNG 가 아닌 바이트는 디코딩을 거부한다", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow();
  });
});

describe("캐릭터 생성기 (scripts/village-art/chargen.mjs)", () => {
  let sheet: { width: number; height: number; rgba: Uint8Array };
  beforeAll(() => {
    sheet = buildSheet();
  }, 60_000);

  const rows = allLooks().length;
  /** 시트의 (줄, 열) 프레임 바이트 */
  const frameBytes = (row: number, col: number) => {
    const out = Buffer.alloc(FRAME_W * FRAME_H * 4);
    for (let y = 0; y < FRAME_H; y++) {
      const o = ((row * FRAME_H + y) * sheet.width + col * FRAME_W) * 4;
      Buffer.from(sheet.rgba.buffer, sheet.rgba.byteOffset + o, FRAME_W * 4).copy(out, y * FRAME_W * 4);
    }
    return out;
  };
  const sha = (b: Buffer) => createHash("sha1").update(b).digest("hex");

  it("시트는 9열 × (하객 64 + 신랑 + 신부 = 66)줄의 32×48 프레임이다", () => {
    expect(FRAME_W).toBe(32);
    expect(FRAME_H).toBe(48);
    expect(COLUMNS).toHaveLength(9);
    expect(rows).toBe(GUEST_LOOKS + 2);
    expect(sheet.width).toBe(9 * 32);
    expect(sheet.height).toBe(66 * 48);
  });

  it("하객 64종은 서로 다른 조합이고 머리 모양·옷·피부색이 골고루 나온다 (정장은 없다)", () => {
    const looks = buildGuestLooks(64);
    expect(new Set(looks.map((l: object) => JSON.stringify(l))).size).toBe(64);
    const count = (key: string) => {
      const m = new Map<string, number>();
      for (const l of looks as Record<string, string>[]) m.set(l[key], (m.get(l[key]) ?? 0) + 1);
      return m;
    };
    const styles = count("hairStyle");
    expect(styles.size).toBe(6);
    for (const n of styles.values()) expect(n).toBeGreaterThanOrEqual(8);
    const outfits = count("outfit");
    expect(outfits.has("suit")).toBe(false);
    expect(outfits.size).toBe(4);
    for (const n of outfits.values()) expect(n).toBeGreaterThanOrEqual(10);
    const skins = count("skin");
    expect(skins.size).toBe(5);
    for (const n of skins.values()) expect(n).toBeGreaterThanOrEqual(10);
  });

  it("같은 시드는 같은 결과를 낸다", () => {
    expect(JSON.stringify(buildGuestLooks(64))).toBe(JSON.stringify(buildGuestLooks(64)));
  });

  it("모든 줄·열 프레임에 불투명 픽셀이 있고 투명 배경(알파 0)도 있다", () => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < COLUMNS.length; col++) {
        const f = frameBytes(row, col);
        let opaque = 0;
        for (let i = 3; i < f.length; i += 4) if (f[i] === 255) opaque++;
        expect(opaque).toBeGreaterThan(100);
        expect(opaque).toBeLessThan(FRAME_W * FRAME_H); // 전부 칠해지면 배경이 사라진 것
      }
    }
  });

  it("앞·뒤·옆과 정지·걷기 프레임이 서로 달라 방향이 구분되고 걷기 애니메이션이 된다", () => {
    for (const row of [0, 10, 33, 63]) {
      const shas = Array.from({ length: COLUMNS.length }, (_, col) => sha(frameBytes(row, col)));
      expect(new Set(shas).size).toBe(COLUMNS.length); // 9프레임이 모두 다르다
    }
  });

  it("신랑·신부는 서로 다르고 하객 줄과도 다르다", () => {
    const shas = Array.from({ length: rows }, (_, row) => sha(frameBytes(row, 0)));
    expect(new Set(shas).size).toBe(rows); // 66줄 모두 다르다
  });

  it("커밋된 캐릭터 시트 PNG 는 생성기 결과와 픽셀까지 같다 (스크립트를 고치면 npm run village:art 로 다시 만들어야 한다)", () => {
    const committed = readPng("village-sprites.png");
    expect(committed.width).toBe(sheet.width);
    expect(committed.height).toBe(sheet.height);
    expect(Buffer.from(committed.rgba).equals(Buffer.from(sheet.rgba))).toBe(true);
  });
});

describe("정원 배경 생성기 (scripts/village-art/garden.mjs)", () => {
  it("384×352 이고 시드가 같으면 같은 그림이며 모든 픽셀이 불투명하다", () => {
    const a = drawGarden();
    const b = drawGarden();
    expect(a.width).toBe(GARDEN_W);
    expect(a.height).toBe(GARDEN_H);
    expect(GARDEN_W).toBe(384);
    expect(GARDEN_H).toBe(352);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
    for (let i = 3; i < a.rgba.length; i += 4) {
      if (a.rgba[i] !== 255) throw new Error(`transparent pixel at ${(i - 3) / 4}`);
    }
  });

  it("커밋된 배경 PNG 는 생성기 결과와 픽셀까지 같다", () => {
    const art = drawGarden();
    const committed = readPng("village-bg.png");
    expect(committed.width).toBe(art.width);
    expect(committed.height).toBe(art.height);
    expect(Buffer.from(committed.rgba).equals(Buffer.from(art.rgba))).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/unit/villageBg.test.ts tests/unit/villageArt.test.ts`
Expected: FAIL — `villageArt.test.ts` 는 `Failed to resolve import "../../scripts/village-art/png.mjs"`, `villageBg.test.ts` 는 크기·파일 없음으로 실패한다.

- [ ] **Step 3: PNG 인코더/디코더를 쓴다**

`scripts/village-art/png.mjs`:

```js
// 의존성 없는 PNG 인코더/디코더 (8비트 RGBA 전용). Node 내장 zlib 만 쓴다.
// 인코더는 줄마다 5가지 필터 중 가장 작은 것을 골라 용량을 줄이고, 디코더는 테스트가 되읽을 때 쓴다.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const BPP = 4;

/** 한 줄에 필터 type(0~4)을 적용한 바이트 */
function filterRow(type, row, prev) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i++) {
    const a = i >= BPP ? row[i - BPP] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= BPP ? prev[i - BPP] : 0;
    const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c);
    out[i] = (row[i] - pred) & 0xff;
  }
  return out;
}

/** width×height RGBA 픽셀(Uint8Array/Buffer, 길이 width*height*4) → PNG 바이트 */
export function encodePng(width, height, rgba) {
  const stride = width * BPP;
  if (rgba.length !== stride * height) throw new Error("rgba length does not match width*height*4");
  const data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = null, bestType = 0, bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      const f = filterRow(type, row, prev);
      let score = 0;
      for (let i = 0; i < f.length; i++) score += f[i] < 128 ? f[i] : 256 - f[i];
      if (score < bestScore) { bestScore = score; best = f; bestType = type; }
    }
    raw[y * (stride + 1)] = bestType;
    best.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** encodePng 가 만든(또는 8비트 RGBA 비인터레이스) PNG → { width, height, rgba } */
export function decodePng(png) {
  const buf = Buffer.from(png);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("only 8-bit RGBA non-interlaced PNG is supported");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * BPP;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= BPP ? rgba[y * stride + i - BPP] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= BPP ? rgba[(y - 1) * stride + i - BPP] : 0;
      const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c);
      rgba[y * stride + i] = (src[i] + pred) & 0xff;
    }
  }
  return { width, height, rgba };
}
```

- [ ] **Step 4: 캐릭터 생성기를 쓴다**

`scripts/village-art/chargen.mjs`:

```js
// 도트 마당 캐릭터 생성기 — 32×48 레이어식 도트를 코드로 그려 시트 픽셀(RGBA)로 만든다.
// 도형 → 음영(위·왼쪽은 밝게, 아래·오른쪽은 어둡게) → 실루엣 바깥 1px 외곽선을 자동으로 만든다.
// 순수 함수라 같은 입력이면 항상 같은 그림이 나온다. 앱은 이 파일을 쓰지 않고 결과 PNG 만 쓴다.

export const FRAME_W = 32;
export const FRAME_H = 48;
/** 시트의 열 순서 — src/lib/pixelSprite.ts 의 FRAME_NAMES 와 같아야 한다(테스트가 검사한다) */
export const COLUMNS = [
  ["down", "idle"], ["down", "walk1"], ["down", "walk2"],
  ["up", "idle"], ["up", "walk1"], ["up", "walk2"],
  ["side", "idle"], ["side", "walk1"], ["side", "walk2"],
];
/** 시트의 하객 줄 수. 줄 GUEST_LOOKS = 신랑, GUEST_LOOKS + 1 = 신부 */
export const GUEST_LOOKS = 64;

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

/** 한 프레임 → 길이 32*48 의 색 배열(hex 문자열, 투명은 null) */
export function renderFrame(look, dir, anim) {
  const buf = new Array(CW * CH).fill(null);
  const OUT = "#2a1d22";
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < CW && y < CH) buf[y * CW + x] = c; };
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
```

- [ ] **Step 5: 배경 그리기와 빌드 진입점을 쓴다**

`scripts/village-art/garden.mjs`:

```js
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
```

`scripts/village-art/build.mjs`:

```js
// 도트 마당 그림 두 장(배경·캐릭터 시트)을 만들어 public/pic/ 에 쓴다.  사용: npm run village:art
// 의존성 없이 Node 만으로 돈다. 시드가 같아 같은 그림이 나오며, 출력되는 픽셀 해시로 확인할 수 있다.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSheet } from "./chargen.mjs";
import { drawGarden } from "./garden.mjs";
import { encodePng } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "public", "pic");
mkdirSync(outDir, { recursive: true });

function write(name, { width, height, rgba }) {
  const png = encodePng(width, height, rgba);
  writeFileSync(path.join(outDir, name), png);
  const hash = createHash("sha256").update(rgba).digest("hex");
  console.log(`${name}  ${width}x${height}  ${png.length} bytes  pixel-sha256 ${hash}`);
}

write("village-bg.png", drawGarden());
write("village-sprites.png", buildSheet());
```

`package.json` 의 `scripts` 에 한 줄 추가한다(`restore` 바로 아래):

old:
```json
    "restore": "node scripts/restore-db.mjs",
```
new:
```json
    "restore": "node scripts/restore-db.mjs",
    "village:art": "node scripts/village-art/build.mjs",
```

- [ ] **Step 6: 생성기·인코더 테스트가 통과하고 PNG 관련 테스트만 남아 실패하는지 확인한다**

Run: `npx vitest run tests/unit/villageArt.test.ts`
Expected: PNG 인코더 3개, 생성기 성질 6개, 배경 생성기 1개는 PASS. **"커밋된 … PNG 는 생성기 결과와 픽셀까지 같다" 2개는 아직 FAIL**(시트는 파일이 없고, 배경은 옛 192×176 파일이다).

- [ ] **Step 7: 그림을 만들고 기대 픽셀 해시와 같은지 검증한다**

Run: `npm run village:art`
Expected(해시는 정확히 아래와 같아야 한다, 용량은 환경에 따라 조금 다를 수 있다):

```
village-bg.png  384x352  … bytes  pixel-sha256 a69831e4a34724c97a2ff68ccee96968a2c5f348820a41bf2bfe148032f024a0
village-sprites.png  288x3168  … bytes  pixel-sha256 9687c0d3eeff4c9883a91f580b9026b9bb0fd66536a2200adb24336efba8731e
```

해시가 다르면 **커밋하지 말고** 두 PNG 를 열어 눈으로 확인한 뒤 차이를 그대로 보고한다(스크립트를 고쳐서 맞추지 않는다). 두 PNG 는 각각 400KB·200KB 미만이어야 한다(`ls -la public/pic`).

- [ ] **Step 8: 전체 검증을 돌린다**

Run: `npx vitest run tests/unit/villageBg.test.ts tests/unit/villageArt.test.ts`
Expected: PASS — villageBg 4 + villageArt 12 = 16 tests

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npx eslint scripts tests/unit`
Expected: 오류·경고 없음

Run: `npm test`
Expected: PASS — 전체 통과(기존 245 + 옛 스프라이트 16 + 옛 이동 25 + 규격 4 + 생성기 12 = 302 정도. 숫자가 다르면 기존 테스트가 늘었는지 줄었는지 확인하고, 실패가 없는지가 기준이다)

- [ ] **Step 9: 문서와 함께 커밋한다**

```bash
git add scripts/village-art package.json public/pic/village-bg.png public/pic/village-sprites.png tests/unit/villageBg.test.ts tests/unit/villageArt.test.ts docs/superpowers/specs/2026-10-07-guestbook-village-hd-design.md docs/superpowers/specs/2026-10-06-guestbook-village-garden-design.md docs/superpowers/plans/2026-10-07-guestbook-village-hd.md
git commit -m "feat(guestbook): 도트 마당 HD — 그림 생성 스크립트와 384×352 배경·캐릭터 시트" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

`git status --short` 가 비어야 한다.

---

### Task 2: 2배 해상도로 교체 (시트 규격 · 이동 상수 · 컴포넌트)

세 파일이 서로의 타입·상수에 묶여 있어(`pixelSprite` 의 내보내기가 통째로 바뀐다) **한 커밋으로** 바꾼다. 중간 커밋에서 `tsc` 가 깨지지 않게 하기 위해서다.

**Files:**
- Rewrite: `src/lib/pixelSprite.ts`, `src/components/sections/PixelVillage.tsx`
- Modify: `src/lib/villageSim.ts` (상수 2배 — 아래에 전체 파일을 싣는다)
- Rewrite: `tests/unit/pixelSprite.test.ts`, `tests/unit/villageSim.test.ts`
- Create(임시, 커밋 금지): `src/app/village-preview/page.tsx`

**Interfaces:**
- Consumes: `/pic/village-bg.png`, `/pic/village-sprites.png` (Task 1), `scripts/village-art/chargen.mjs` 의 `COLUMNS`, `FRAME_W`, `FRAME_H`, `GUEST_LOOKS`, `allLooks` (테스트만), `type Celebration` from `@/lib/supabase`, `groom`·`bride` from `@/lib/wedding`.
- Produces: 같은 이름의 default export `PixelVillage({ items: Celebration[]; highlightId?: string | null })` — `Guestbook.tsx` 는 바뀌지 않는다. 모듈 인터페이스:
  - `pixelSprite.ts`: `SPRITE_W = 32`, `SPRITE_H = 48`, `SHEET_SRC`, `type SpriteDir`, `type SpriteAnim`, `type FrameName`, `SPRITE_DIRS`, `SPRITE_ANIMS`, `FRAME_NAMES`, `GUEST_LOOKS = 64`, `GROOM_ROW = 64`, `BRIDE_ROW = 65`, `SHEET_ROWS = 66`, `hashId(id)`, `lookRowFromId(id)`, `frameRect(row, frame): { sx, sy, sw, sh }`
  - `villageSim.ts`: Task 1 이전과 같은 내보내기, 상수 값만 2배(`WORLD_W 384`, `WORLD_H 352`, `HALF_W 16`, `BOX_H 48`, `AREA { x0 16, x1 368, y0 144, y1 352 }`, `WALK_SPEED 48`, `pickWalkerAt` 기본 pad 6)

- [ ] **Step 1: 실패하는 테스트로 교체한다**

`tests/unit/pixelSprite.test.ts` (전체 교체):

```ts
import { describe, it, expect } from "vitest";
import { COLUMNS, FRAME_H, FRAME_W, GUEST_LOOKS as ART_GUEST_LOOKS, allLooks } from "../../scripts/village-art/chargen.mjs";
import {
  BRIDE_ROW,
  FRAME_NAMES,
  GROOM_ROW,
  GUEST_LOOKS,
  SHEET_ROWS,
  SPRITE_H,
  SPRITE_W,
  frameRect,
  hashId,
  lookRowFromId,
} from "@/lib/pixelSprite";

describe("캐릭터 시트 규격", () => {
  it("프레임은 32×48 이다", () => {
    expect(SPRITE_W).toBe(32);
    expect(SPRITE_H).toBe(48);
  });

  it("열은 앞→뒤→옆, 각각 정지→걷기1→걷기2 순서의 9프레임이다", () => {
    expect(FRAME_NAMES).toEqual([
      "down_idle", "down_walk1", "down_walk2",
      "up_idle", "up_walk1", "up_walk2",
      "side_idle", "side_walk1", "side_walk2",
    ]);
  });

  it("줄은 하객 64종 → 신랑 → 신부 = 66줄이다", () => {
    expect(GUEST_LOOKS).toBe(64);
    expect(GROOM_ROW).toBe(64);
    expect(BRIDE_ROW).toBe(65);
    expect(SHEET_ROWS).toBe(66);
  });
});

describe("앱 쪽 시트 규격과 그림 생성 스크립트 규격이 같다", () => {
  it("프레임 크기·열 순서·줄 수가 scripts/village-art/chargen.mjs 와 일치한다", () => {
    expect(FRAME_W).toBe(SPRITE_W);
    expect(FRAME_H).toBe(SPRITE_H);
    expect(COLUMNS.map(([dir, anim]: string[]) => `${dir}_${anim}`)).toEqual([...FRAME_NAMES]);
    expect(ART_GUEST_LOOKS).toBe(GUEST_LOOKS);
    expect(allLooks()).toHaveLength(SHEET_ROWS);
  });
});

describe("hashId / lookRowFromId — 하객 id → 시트 줄", () => {
  it("같은 id 는 항상 같은 값·같은 줄이다", () => {
    expect(hashId("guest-1")).toBe(hashId("guest-1"));
    expect(lookRowFromId("guest-1")).toBe(lookRowFromId("guest-1"));
  });

  it("줄은 항상 하객 줄(0~63)의 정수이고 신랑·신부 줄은 나오지 않는다", () => {
    for (let i = 0; i < 2000; i++) {
      const row = lookRowFromId(`id-${i}`);
      expect(Number.isInteger(row)).toBe(true);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(GUEST_LOOKS);
      expect(row).not.toBe(GROOM_ROW);
      expect(row).not.toBe(BRIDE_ROW);
    }
  });

  it("id 가 다르면 줄이 골고루 나온다 (500명이면 64줄 중 55줄 이상 쓰인다)", () => {
    const rows = new Set(Array.from({ length: 500 }, (_, i) => lookRowFromId(`id-${i}`)));
    expect(rows.size).toBeGreaterThanOrEqual(55);
  });
});

describe("frameRect — 시트에서 잘라 낼 사각형", () => {
  it("첫 줄 첫 열은 (0, 0) 에서 32×48", () => {
    expect(frameRect(0, "down_idle")).toEqual({ sx: 0, sy: 0, sw: 32, sh: 48 });
  });

  it("열은 프레임 순서 × 32, 줄은 줄 번호 × 48", () => {
    expect(frameRect(3, "up_walk1")).toEqual({ sx: 4 * 32, sy: 3 * 48, sw: 32, sh: 48 });
    expect(frameRect(BRIDE_ROW, "side_walk2")).toEqual({ sx: 8 * 32, sy: 65 * 48, sw: 32, sh: 48 });
  });

  it("모든 줄·프레임의 사각형이 시트(288×3168) 안에 있고 서로 겹치지 않는다", () => {
    const seen = new Set<string>();
    for (let row = 0; row < SHEET_ROWS; row++) {
      for (const f of FRAME_NAMES) {
        const r = frameRect(row, f);
        expect(r.sx).toBeGreaterThanOrEqual(0);
        expect(r.sx + r.sw).toBeLessThanOrEqual(288);
        expect(r.sy + r.sh).toBeLessThanOrEqual(3168);
        seen.add(`${r.sx},${r.sy}`);
      }
    }
    expect(seen.size).toBe(SHEET_ROWS * FRAME_NAMES.length);
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
    x: 192,
    y: 200,
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
  it("세계는 384×352 이고 걷는 영역은 단상·화단 아래 잔디밭(y 144~352)이다", () => {
    expect(WORLD_W).toBe(384);
    expect(WORLD_H).toBe(352);
    expect(AREA).toEqual({ x0: HALF_W, x1: WORLD_W - HALF_W, y0: 144, y1: WORLD_H });
  });
});

describe("spawnNpc / fixed — 신랑·신부", () => {
  it("고정 캐릭터는 주어진 자리에 앞모습으로 선다", () => {
    const w = spawnNpc("npc-groom", 172, 112);
    expect(w).toMatchObject({ id: "npc-groom", x: 172, y: 112, dir: "down", mode: "idle", entering: false, fixed: true });
  });

  it("고정 캐릭터는 시간이 흘러도(timer 가 0 이하여도) 위치·방향·상태가 변하지 않는다", () => {
    const rng = makeRng(21);
    let w = spawnNpc("npc-bride", 212, 112);
    w = { ...w, timer: -5 }; // 일반 캐릭터라면 곧바로 걷기를 시작했을 상황
    for (let i = 0; i < 600; i++) w = stepWalker(w, DT, rng); // frozen 없이 20초
    expect(w).toMatchObject({ x: 212, y: 112, dir: "down", mode: "idle", fixed: true });
  });

  it("같은 조건의 일반 캐릭터는 걷는다 — 위 테스트가 공허하지 않다는 대조군", () => {
    const rng = makeRng(21);
    let w = base({ x: 212, y: 200, dir: "down", mode: "idle", timer: -5 });
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
    const w0 = spawnNpc("npc-groom", 172, 112);
    const w1 = stepWalker(w0, 1, rng, true);
    expect(w1).toMatchObject({ x: 172, y: 112, dir: "down", mode: "idle", fixed: true });
  });

  it("고정 캐릭터가 있어도 하객은 그대로 걷고, 일반 스폰은 fixed 가 아니다", () => {
    const rng = makeRng(22);
    expect(spawnWalker("g", rng, false).fixed).toBe(false);
    expect(spawnWalker("g", rng, true).fixed).toBe(false);
    const w0 = base({ mode: "walk", dir: "right" });
    expect(stepWalker(w0, 0.5, rng).x).toBeGreaterThan(w0.x);
  });

  it("고정 캐릭터도 터치로 집을 수 있다", () => {
    const npc = spawnNpc("npc-groom", 172, 112);
    expect(pickWalkerAt([npc], 172, 112 - BOX_H / 2)?.id).toBe("npc-groom");
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
      { x: AREA.x0 + 0.1, y: 200, dir: "left" },
      { x: 192, y: AREA.y0 + 0.1, dir: "up" },
      { x: 192, y: AREA.y1 - 0.1, dir: "down" },
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
  const a = base({ id: "a", x: 100, y: 200 });
  const b = base({ id: "b", x: 108, y: 204 }); // a 와 겹침, 더 아래(앞)

  it("캐릭터 몸통 안을 누르면 그 캐릭터를 돌려준다", () => {
    expect(pickWalkerAt([a], 100, 200 - BOX_H / 2)?.id).toBe("a");
  });

  it("빈 곳을 누르면 null", () => {
    expect(pickWalkerAt([a], 300, 80)).toBeNull();
  });

  it("겹치면 더 앞(아래)에 그려진 캐릭터가 우선한다", () => {
    expect(pickWalkerAt([a, b], 104, 190)?.id).toBe("b");
    expect(pickWalkerAt([b, a], 104, 190)?.id).toBe("b");
  });

  it("몸통 좌우 끝 + 여유(pad) 밖은 누르지 않은 것으로 본다", () => {
    expect(pickWalkerAt([a], 100 + HALF_W + 6 + 0.5, 180)).toBeNull();
    expect(pickWalkerAt([a], 100 + HALF_W + 5, 180)?.id).toBe("a");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/unit/pixelSprite.test.ts tests/unit/villageSim.test.ts`
Expected: FAIL — 새 export(`GUEST_LOOKS`, `lookRowFromId`, `frameRect`, `SHEET_ROWS` 등)가 아직 없고 이동 상수가 아직 192×176 기준이라 다수의 테스트가 실패한다.

- [ ] **Step 3: 시트 규격 모듈을 쓴다**

`src/lib/pixelSprite.ts` (전체 교체):

```ts
/**
 * 도트 마당 캐릭터 시트 규격 — 그림 자체는 `public/pic/village-sprites.png` 한 장에 있다.
 * 시트는 32×48 프레임을 줄(= 한 사람) × 열(= 방향·동작)로 늘어놓은 것이고,
 * 생성 스크립트(scripts/village-art/)가 만든다. 나중에 사람이 그린 시트로 바꿔도 이 규격만 지키면 된다.
 *
 * 열 순서: 앞(down)·뒤(up)·옆(side, 오른쪽을 봄) × 정지·걷기1·걷기2. 왼쪽은 그릴 때 옆모습을 좌우 반전한다.
 * 줄 순서: 하객 GUEST_LOOKS 종 → 신랑 → 신부. 하객은 id 해시로 줄을 고르므로 같은 하객은 항상 같은 모습이다.
 */

export const SPRITE_W = 32;
export const SPRITE_H = 48;

export const SHEET_SRC = "/pic/village-sprites.png";

/** down = 앞(아래로 걸을 때), up = 뒤(위로 걸을 때), side = 옆(오른쪽을 봄) */
export type SpriteDir = "down" | "up" | "side";
export type SpriteAnim = "idle" | "walk1" | "walk2";
export type FrameName = `${SpriteDir}_${SpriteAnim}`;

export const SPRITE_DIRS: readonly SpriteDir[] = ["down", "up", "side"];
export const SPRITE_ANIMS: readonly SpriteAnim[] = ["idle", "walk1", "walk2"];
/** 시트의 열 순서와 같다 */
export const FRAME_NAMES: readonly FrameName[] = SPRITE_DIRS.flatMap((d) =>
  SPRITE_ANIMS.map((a): FrameName => `${d}_${a}`)
);

/** 하객 모습 가짓수(시트의 앞쪽 줄) */
export const GUEST_LOOKS = 64;
export const GROOM_ROW = GUEST_LOOKS;
export const BRIDE_ROW = GUEST_LOOKS + 1;
export const SHEET_ROWS = GUEST_LOOKS + 2;

/** FNV-1a 32bit — 같은 id 는 항상 같은 값 */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 하객 id → 시트 줄(0 ~ GUEST_LOOKS-1) */
export function lookRowFromId(id: string): number {
  return hashId(id) % GUEST_LOOKS;
}

/** 시트에서 (줄, 프레임)을 잘라 낼 사각형 */
export function frameRect(row: number, frame: FrameName): { sx: number; sy: number; sw: number; sh: number } {
  return { sx: FRAME_NAMES.indexOf(frame) * SPRITE_W, sy: row * SPRITE_H, sw: SPRITE_W, sh: SPRITE_H };
}
```

Run: `npx vitest run tests/unit/pixelSprite.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 4: 이동 로직 상수를 2배로 한다**

`src/lib/villageSim.ts` (전체 교체 — 기존 파일에서 바뀌는 곳은 위쪽 상수들, `pickWalkerAt` 의 기본 `pad`, 그리고 그 주변 주석뿐이다):

```ts
import type { FrameName } from "@/lib/pixelSprite";

/**
 * 도트 마당 이동 로직 — 렌더·DOM 과 무관한 순수 함수 모음. (바람의 나라식 탑뷰, 정원 예식장)
 * 좌표는 논리 해상도(384×352) 기준이고 (x, y) 는 캐릭터의 '발 밑 중앙'이다.
 * 캐릭터는 상·하·좌·우 한 방향씩만 걷는다(대각선 없음). 장애물·캐릭터끼리의 충돌은 없다.
 * 신랑·신부처럼 `fixed` 인 캐릭터는 단상 위에 서서 움직이지 않는다.
 */

export const WORLD_W = 384;
export const WORLD_H = 352;
/** 캐릭터 가로 반폭 */
export const HALF_W = 16;
export const BOX_H = 48;

/** 걸을 수 있는 영역 — 발 위치 기준. 단상·화단(위) 아래의 잔디밭 전체 */
export const AREA = { x0: HALF_W, x1: WORLD_W - HALF_W, y0: 144, y1: WORLD_H } as const;

export const WALK_SPEED = 48; // px/s
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
  pad = 6
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
  BRIDE_ROW,
  GROOM_ROW,
  SHEET_SRC,
  SPRITE_H,
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
/** 정원 예식장 배경 — 384×352, 걷는 영역은 villageSim.ts 의 AREA */
const BG_SRC = "/pic/village-bg.png";

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

/** 단상 위 신랑·신부 — 발 위치는 아치 아래 */
const NPCS: ReadonlyArray<{ id: string; x: number; y: number; row: number; info: Info }> = [
  {
    id: "npc-groom",
    x: 172,
    y: 112,
    row: GROOM_ROW,
    info: { name: groom.name, text: COUPLE_TEXT, npc: true, tagColor: "#b89b6e", tagX: 190, tagAlign: "right" },
  },
  {
    id: "npc-bride",
    x: 212,
    y: 112,
    row: BRIDE_ROW,
    info: { name: bride.name, text: COUPLE_TEXT, npc: true, tagColor: "#d98fb0", tagX: 194, tagAlign: "left" },
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

/** 캐릭터 시트에서 (줄, 프레임)을 잘라 그린다. 왼쪽은 옆모습을 좌우 반전 */
function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, sheet: HTMLImageElement, row: number): void {
  const { frame, flip } = spriteFor(w);
  const { sx, sy, sw, sh } = frameRect(row, frame);
  const dx = Math.round(w.x - SPRITE_W / 2);
  const dy = Math.round(w.y - SPRITE_H);
  if (!flip) {
    ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, sw, sh);
    return;
  }
  ctx.save();
  ctx.translate(dx + SPRITE_W, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh);
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
  color: string,
  tagX?: number,
  align: "left" | "right" | "center" = "center"
): void {
  ctx.font = `${t.fp}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = Math.round(t.fp * 0.45);
  const h = Math.round(t.fp * 1.4);
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const anchor = tagX ?? cx;
  const left = align === "right" ? anchor * t.s - w : align === "left" ? anchor * t.s : anchor * t.s - w / 2;
  const x = Math.round(Math.min(WORLD_W * t.s - w - 2, Math.max(2, left)));
  const y = Math.round(Math.min(WORLD_H * t.s - h - 2, (footY + 2) * t.s));
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
  const y = Math.max(3, Math.round((w.y - SPRITE_H - 8) * t.s - bh - t.fp * 0.6));
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
 * 그림은 PNG 두 장(배경 village-bg.png, 캐릭터 시트 village-sprites.png)이고, 하객은 id 해시로 시트의 한 줄을 고른다.
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
      ctx.imageSmoothingEnabled = false;
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
      for (const w of list) {
        const info = infoRef.current.get(w.id);
        if (!info || w.y > WORLD_H) continue; // 아직 화면 아래 바깥에서 올라오는 중이면 이름표도 숨긴다
        const color = info.tagColor ?? (w.id === mineRef.current ? "#b89b6e" : "rgba(43,33,24,0.62)");
        drawTag(ctx, t, clipName(info.name), w.x, w.y, color, info.tagX, info.tagAlign);
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
```

- [ ] **Step 6: 타입·린트·전체 테스트·빌드를 확인한다**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npx eslint src/components/sections/PixelVillage.tsx src/lib/pixelSprite.ts src/lib/villageSim.ts scripts tests/unit`
Expected: 오류·경고 없음

Run: `npm test`
Expected: PASS — 전체 통과(기존 245 + 신규 51 = 296 정도. 숫자가 다르면 기존 테스트가 늘었는지 줄었는지 확인하고, 실패가 없는지가 기준이다)

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 7: 임시 미리보기 페이지를 만든다**

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

- [ ] **Step 8: 개발 서버를 띄우고 브라우저로 확인한다**

`preview_start` 를 `{ name: "dev" }` 로 호출해(`.claude/launch.json` 에 `dev` 설정이 있다) 서버를 띄운다(서버 실행에 Bash 를 쓰지 않는다). 앱 안 브라우저 탭은 숨겨져 있으면 `requestAnimationFrame` 이 돌지 않아 움직임·루프 정지·자동 말풍선 검증이 0 으로 나온다. 그 경우 **헤드리스 Playwright**(`node_modules/playwright-core`, Chromium 설치됨, 뷰포트 375×812)로 `http://localhost:3000/village-preview` 를 열어 확인하고, 어떤 도구로 확인했는지 보고서에 적는다(스크립트는 저장소 밖 스크래치 폴더에 둔다). 확인할 것(실제로 본 결과만 보고한다):
  1. **배경·캐릭터·글씨:** 콘솔·`pageerror` 에 오류가 없고, 384×352 정원 배경(돌 포장길, 꽃 아치, 수국 화단, 나무)이 보이며, 단상 위에 신랑(검은 정장·빨간 타이)·신부(흰 드레스·머리 꽃)가 서 있고 이름표(금색/분홍)가 겹치지 않으며, 24명의 하객이 32×48 크기의 음영·외곽선이 있는 캐릭터로 보인다. 이름표 글씨가 매끈한지(스크린샷 확대), `preview-3` 이름표만 금색인지도 본다.
  2. **하객 다양성·반전:** 하객들의 머리 모양·옷·피부색이 다양한지, 왼쪽으로 걷는 하객이 옆모습을 반전해서 그려지는지 본다.
  3. **4방향:** 몇 초 간격의 스크린샷 여러 장으로 하객이 위·아래·좌·우로 걷는 것을 확인한다(대각선으로 미끄러지지 않는다).
  4. **하객 말풍선:** 하객을 눌러 `이름 + 메시지` 말풍선이 뜨고 그 하객이 멈추는지, 긴 메시지가 3줄에서 `…` 로 잘리는지, 4초 뒤/빈 곳을 누르면 닫히는지, 말풍선이 캐릭터 머리 위(키가 2배가 된 만큼)에 알맞게 뜨는지 확인한다.
  5. **신랑·신부:** 한 번 누르면 `저를 누르면 사진들 볼 수 있어요!` 말풍선, **말풍선이 떠 있는 동안 다시 누르면** 말풍선이 닫히고 페이지가 `#gallery` 자리로 부드럽게 스크롤되는지(`window.scrollY` 확인), 말풍선이 없을 때 첫 누름에는 스크롤하지 않는지 확인한다.
  6. **자동 말풍선:** 아무것도 누르지 않고 기다리면 약 6초 뒤 하객 한 명의 말풍선이 저절로 뜨고 4초 뒤 닫히며, 신랑·신부 말풍선은 저절로 뜨지 않는지 확인한다. 아래 스니펫이 글씨 호출을 모은다(이름표 문자열 외에 하객 메시지 `축하해요!` 등이 보이면 자동 말풍선이 뜬 것이고, `저를 누르면…` 은 보이면 안 된다).

```js
const seen = new Set();
const orig = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { seen.add(String(t)); return orig.call(this, t, ...a); };
await new Promise((r) => setTimeout(r, 9000));
CanvasRenderingContext2D.prototype.fillText = orig;
[...seen];
```

  7. **입장:** 페이지를 연 뒤 약 4초에 하객이 한 명 추가되어 화면 아래 가장자리에서 걸어 올라오는지(스크린샷 2~3장), 화면 안에 들어오기 전에는 이름표가 보이지 않는지 확인한다.
  8. **시트 로드 실패:** Playwright `page.route("**/pic/village-sprites.png", r => r.abort())` 로 시트를 막고 열었을 때 `마을을 불러오지 못했어요` 가 보이고 `pageerror` 가 없는지 확인한다.
  9. **배경 로드 실패:** `page.route("**/pic/village-bg.png", r => r.abort())` 로 배경을 막고 열었을 때 단색 잔디 배경에 신랑·신부·하객이 정상적으로 그려지고 `pageerror` 가 없는지 확인한다.
  10. **컨텍스트 실패:** `HTMLCanvasElement.prototype.getContext = () => null` 로 덮은 초기화 스크립트를 넣고 열었을 때 `마을을 불러오지 못했어요` 가 보이고 `pageerror` 가 없는지 확인한다.
  11. **모션 줄이기:** `emulateMedia({ reducedMotion: "reduce" })` 에서 화면이 정지 상태이고, 자동 말풍선이 뜨지 않으며, 하객을 누르면 말풍선이 뜨고 약 4초 뒤 스스로 닫히는지, 신랑·신부를 두 번 누르면 즉시(부드러운 이동 없이) `#gallery` 로 가는지 확인한다.
  12. **화면 밖 정지:** 아래 스니펫으로 `drawImage` 호출 수를 센다(루프가 돌 때만 증가한다). 이어서 화면 밖에서 10초 이상 기다려도 자동 말풍선(위 스니펫의 `fillText`)이 새로 호출되지 않는지도 확인한다.

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

  13. **화질:** `deviceScaleFactor` 1, 2, 3 으로 각각 열어(뷰포트 375×812) 마을 스크린샷을 찍고, 캐릭터·글씨·배경이 지나치게 흐리거나 도트가 들쭉날쭉하지 않은지 눈으로 확인해 한두 문장으로 보고한다(384px 그림을 폭 약 336css px 로 줄여 보이는 설계이므로 약간 부드러운 것은 정상이다).

  **눈으로 볼 때 같이 보고할 것(판단 근거로 쓴다):** 하객이 꽃길·화단 위를 지나가는 모습, 맨 위 하객의 말풍선이 머리를 덮는지, 이름표 겹침·잘림, 실제 하객 수(예: 100명)에서의 프레임. 이 항목은 고치지 말고 보고만 한다(설계 문서의 "알고 가는 한계").

이상이 있으면 소스를 고치고 이 단계부터 다시 확인한다.

- [ ] **Step 9: 임시 페이지를 지우고 커밋한다**

```bash
rm -r src/app/village-preview
git status --short
```

`git status` 에 `village-preview` 가 **나오지 않아야** 한다. 서버는 `preview_stop` 으로 끈다.

```bash
git add src/lib/pixelSprite.ts src/lib/villageSim.ts src/components/sections/PixelVillage.tsx tests/unit/pixelSprite.test.ts tests/unit/villageSim.test.ts
git commit -m "feat(guestbook): 도트 마당 HD — 2배 해상도 시트 캐릭터와 정원 배경으로 교체" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Finish (컨트롤러)

두 Task 와 최종 리뷰가 끝나면, 이미 PR #43 이 열려 있으므로 새 PR 을 만들지 않는다. 브랜치를 푸시하고 `gh pr edit 43 --body-file …` 로 PR 설명을 갱신한다: 2배 해상도(384×352 배경, 32×48 캐릭터 시트 64종), 그림 생성 스크립트(`npm run village:art`)와 "커밋된 PNG == 스크립트 결과" 테스트, 에셋 교체 지점(PNG 두 장), 배포 미리보기 체크리스트(배경·캐릭터 화질, 하객 다양성, 이름표 겹침, 신랑·신부 두 번 누르기, 자동 말풍선, `mapOnly`). 제목은 그대로 둔다.
