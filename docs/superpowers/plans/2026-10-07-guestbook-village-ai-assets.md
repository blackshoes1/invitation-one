# 도트 마당 'AI 에셋(ChatGPT 이미지) 도입' Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 ChatGPT 로 뽑은 캐릭터 시트(4장, 약 32명 × 4방향 × 3프레임)를 변환해서 마을의 하객·신랑·신부 그림으로 쓴다. 코드 생성 캐릭터 엔진은 걷어낸다.

**Architecture:** 변환 스크립트(`scripts/village-art/ingest.mjs`)가 `village-src/` 의 원본 시트를 알파 연결 성분으로 잘라 → 번짐 제거 → 배율·발 위치를 맞춰 → 12열 @2x WebP 시트 한 장으로 쌓는다. 앱은 시트 한 장만 읽는다(`pixelSprite.ts` 규격 상수 + `frameRect`). 왼쪽·오른쪽은 따로 그려진 그대로 써서 좌우 반전을 없앤다. 나머지 구조(`villageSim.ts` 이동, `PixelVillage.tsx` 캔버스 루프, `layoutTags` 계획)는 그대로다.

**Tech Stack:** Next.js 16.3.3, React 19.2, TypeScript strict, vitest 3 (node 환경, `@` 별칭), Canvas 2D, Node 내장 모듈, 기존 `scripts/village-art/png.mjs`(PNG 디코더), 개발용으로만 `sharp`(Next 가 이미 설치함, `package.json` 에 추가하지 않는다).

**Spec:** `docs/superpowers/specs/2026-10-07-guestbook-village-ai-assets-design.md` (이 문서가 대체하지 않는 부분은 `…crowd-design.md` 를 따른다. 그 계획 `2026-10-07-guestbook-village-crowd.md` 의 Task 3·4(코드 생성 하객 다양화·코드 생성 배경)는 이 계획으로 대체되었고, Task 5·6 은 이 계획 이후에 이어 한다.)

## Global Constraints

- 원본 에셋은 `village-src/` (git 제외, **커밋하지 않는다**). 사용자가 `public/pic/dot_img1~4.png` 에 넣어 둔 네 장(untracked)은 `village-src/dot_img1~4.png` 로 **옮긴다**(복사 후 원본 삭제가 아니라 `mv`). `public/pic/` 에는 최종 결과물만 둔다. `public/pic/wedding_main.jpg` 의 수정 사항은 사용자의 것이니 건드리지 않는다.
- 원본 시트 형식: 1536×1024 RGBA PNG. 한 장에 캐릭터 8명(4열×2행 블록). 캐릭터 한 명은 3열×4줄(1줄 앞, 2줄 왼쪽, 3줄 오른쪽, 4줄 뒤 — 눈으로 확인하고 다르면 보고한다), 줄마다 프레임 3개. 알파는 몸통 약 252/255, 가장자리에 옅은 번짐. 격자가 정확하지 않다(블록 사이 빈 열 폭이 일정하지 않다).
- 신랑·신부 임시 대체: **신랑 = `dot_img1` 의 첫 번째 열·첫 번째 행 블록(검은 정장 남성)**, **신부 = `dot_img3` 의 세 번째 열·두 번째 행 블록(밝은 머리의 크림색 드레스 여성)**. 이 두 명은 하객 줄에서 뺀다. (사용자가 ② 신랑·신부 시트를 만들어 넣으면 교체한다: 교체는 이 스크립트의 입력 지정만 바꾸면 되게 만든다.)
- 시트 규격: **배율 2**, 프레임 **80×128**(논리 40×64), 열 12개 `down_idle, down_walk1, down_walk2, up_idle, up_walk1, up_walk2, left_idle, left_walk1, left_walk2, right_idle, right_walk1, right_walk2`, 줄 = 사람 1명(하객 `GUEST_LOOKS`명 → 신랑 → 신부), 배경 투명, 발끝이 프레임 아래 4px 안쪽, 몸 중심이 프레임 가운데 ±4px(원 프레임 3개는 같은 가로 오프셋을 써서 걸을 때 흔들리지 않게 한다). 결과 `public/pic/village-sprites.webp`(WebP, **1.2MB 이하**, 보이는 가장자리에 옅은 번짐이 없을 것).
- 걷기 사이클은 `walk1 → idle → walk2 → idle`. 원본 프레임 3개를 `(walk1, idle, walk2)` 로 대응시키되, 어느 프레임이 가운데(서 있는) 자세인지는 다리 모양을 눈으로 보고 정한다(보통 가운데 열).
- 렌더링: 시트는 @2x 이므로 논리 크기로 줄여 그린다(`drawImage(sheet, sx, sy, sw, sh, dx, dy, sw / 2, sh / 2)`), `imageSmoothingEnabled = true`. 세계 좌표와 월드 크기는 이 계획의 Task 1·2 에서 바꾸지 않는다(배경과 함께 Task 3 에서 바꾼다). `HALF_W` 20, `BOX_H` 64.
- 새 npm 의존성 없음, `package.json` 의 `dependencies`·`devDependencies` 불변(스크립트 항목 `village:ingest` 추가는 허용). 코드 주석은 한국어, 짧게. 커밋 트레일러 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. tsc, eslint, 전체 vitest, `npm run build` 는 항상 통과해야 한다.
- 테스트는 `tests/unit/**/*.test.ts`. 원본이 저장소에 없으므로 "결과물 == 생성기" 테스트는 쓰지 않는다. 대신 결과물의 속성(크기, 용량, 알파, 발 위치)을 검사한다. `sharp` 가 필요한 속성 검사는 `sharp` 가 없으면 건너뛰고(`it.skipIf`), 헤더 크기·용량 검사는 항상 돈다.
- 참고 영상의 그림·에셋은 쓰지 않는다. 코드 생성 캐릭터 엔진(`figure.mjs`, `chargen.mjs`)은 Task 2 에서 삭제한다(git 기록에 남는다).

---

## File Structure

| 파일 | 구분 | 책임 |
|---|---|---|
| `scripts/village-art/ingest.mjs` | 신규 (Task 1) | 원본 시트 → 12열 @2x 시트. 순수 함수(프레임 찾기·정렬·쌓기)와 입출력을 나눠 테스트 가능하게 |
| `public/pic/village-sprites.webp` | 신규 (Task 1) | 결과 시트 |
| `tests/unit/villageSheet.test.ts` | 신규 (Task 1) | 결과 시트 속성·`ingest.mjs` 순수 함수 테스트 |
| `src/lib/pixelSprite.ts` | 수정 (Task 2) | 새 규격 상수·`frameRect` |
| `src/lib/villageSim.ts` | 수정 (Task 2) | `spriteFor` flip 제거, `HALF_W` 20 |
| `src/components/sections/PixelVillage.tsx` | 수정 (Task 2) | @2x 시트 그리기 |
| `scripts/village-art/{figure,chargen}.mjs`, `public/pic/village-sprites.png`, 관련 테스트 | 삭제/정리 (Task 2) | 코드 생성 캐릭터 제거 |

---

### Task 1: 원본 시트 변환 스크립트와 결과 시트

**Files:**
- Create: `scripts/village-art/ingest.mjs`
- Create: `tests/unit/villageSheet.test.ts`
- Modify: `package.json` (`"village:ingest": "node scripts/village-art/ingest.mjs"` 한 줄만)
- Move: `public/pic/dot_img1~4.png` → `village-src/`
- Create: `public/pic/village-sprites.webp`

**Interfaces:**
- Consumes: `scripts/village-art/png.mjs` 의 `decodePng(buffer) → { width, height, rgba: Uint8Array }`, `encodePng(width, height, rgba) → Buffer`.
- Produces: `ingest.mjs` 는 다음을 내보내고(이름은 Task 2 와 테스트가 쓴다), 직접 실행하면 시트를 쓴다.
  - 상수: `FRAME_W = 80`, `FRAME_H = 128`, `SHEET_SCALE = 2`, `COLUMNS`(위 12열 이름 배열)
  - `export function findComponents(rgba, width, height, { alphaMin }): { x0, y0, x1, y1, area }[]` — 알파 `>= alphaMin` 인 픽셀의 4방향 연결 성분들의 경계 상자
  - `export function buildSheet(sources, picks): { width, height, rgba, rows: { source, block }[], guests: number }` — `sources` 는 디코드된 이미지 목록, `picks` 는 신랑·신부 지정
  - 직접 실행 결과: `public/pic/village-sprites.webp` 와 콘솔에 `guests`(= `GUEST_LOOKS` 후보), 최종 크기·용량

- [ ] **Step 1: 원본 옮기기와 눈으로 보는 분석 (탐색)**

`mkdir village-src` 는 이미 있다. `mv public/pic/dot_img*.png village-src/`. 네 장을 `Read` 로 열어 구조(블록 위치, 줄 방향, 프레임 순서, 크기 차이)를 확인한다. 작업 폴더(scratchpad)에 임시 스크립트를 두고, 각 캐릭터 블록의 줄·프레임 경계 상자와 줄별 머리 폭(위 40% 높이 구간의 최대 가로폭)을 측정해 방향별 크기 차이를 숫자로 본다(예: 뒷모습이 앞모습보다 작게 그려졌는지). 측정 결과를 보고에 남긴다.

- [ ] **Step 2: 순수 함수 테스트를 먼저 쓴다 (실패 확인)**

`tests/unit/villageSheet.test.ts` 에 다음을 쓴다(합성 이미지로 `findComponents` 를 검증 — 원본 파일이 없어도 돈다).

```ts
import { describe, it, expect } from "vitest";
import { findComponents } from "../../scripts/village-art/ingest.mjs";

/** w×h 투명 이미지에 (x0,y0)-(x1,y1) 불투명 사각형들을 찍는다 */
function image(w: number, h: number, rects: [number, number, number, number, number?][]) {
  const rgba = new Uint8Array(w * h * 4);
  for (const [x0, y0, x1, y1, a = 255] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const o = (y * w + x) * 4; rgba[o] = 200; rgba[o + 3] = a; }
  }
  return { w, h, rgba };
}

describe("findComponents — 알파 연결 성분", () => {
  it("떨어진 덩어리를 각각의 경계 상자로 찾는다", () => {
    const { w, h, rgba } = image(40, 30, [[2, 3, 9, 12], [20, 5, 33, 25]]);
    const comps = findComponents(rgba, w, h, { alphaMin: 128 });
    const boxes = comps.map((c: { x0: number; y0: number; x1: number; y1: number }) => [c.x0, c.y0, c.x1, c.y1]).sort();
    expect(boxes).toEqual([[2, 3, 9, 12], [20, 5, 33, 25]]);
  });

  it("옅은 알파(번짐)는 임계값 아래면 무시하고, 맞닿은 번짐이 덩어리를 이어 붙이지 않는다", () => {
    const { w, h, rgba } = image(40, 20, [[2, 2, 10, 15], [14, 2, 22, 15], [11, 2, 13, 15, 20]]);
    const comps = findComponents(rgba, w, h, { alphaMin: 128 });
    expect(comps).toHaveLength(2);
  });

  it("알파가 임계값 이상인 픽셀이 없으면 빈 목록", () => {
    const { w, h, rgba } = image(10, 10, [[1, 1, 5, 5, 100]]);
    expect(findComponents(rgba, w, h, { alphaMin: 128 })).toEqual([]);
  });

  it("대각선으로만 닿은 픽셀은 같은 덩어리가 아니다(4방향 연결)", () => {
    const { w, h, rgba } = image(6, 6, [[1, 1, 2, 2], [3, 3, 4, 4]]);
    expect(findComponents(rgba, w, h, { alphaMin: 128 })).toHaveLength(2);
  });
});
```

Run: `npx vitest run tests/unit/villageSheet.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: `ingest.mjs` 구현 — 순수 함수부터**

`findComponents` 를 구현한다(반복형 스택으로, 재귀 금지 — 1536×1024 에서 호출 깊이 초과 방지). 나머지(블록 찾기, 줄·프레임 분리, 번짐 제거, 배율·정렬, 쌓기, WebP 쓰기)는 구현자가 설계하되 다음을 지킨다.

1. 블록(캐릭터 한 명)은 사람이 정한 상수 격자가 아니라 알파 성분에서 찾는다: 옅은 번짐이 이어 붙이지 않도록 임계값을 높게(예: `alphaMin 160`) 잡고, 성분을 위치로 묶어 4열×2행 블록 → 블록 안 3열×4줄 프레임으로 정렬한다. 한 프레임이 여러 성분(머리 장식 꽃 등)으로 쪼개지면 가까운 것끼리 합친다.
2. 번짐 제거: 알파 `< 48` 은 0 으로, 그 외는 유지(부드러운 가장자리는 둔다). 색이 어두운 번짐 테두리가 남지 않는지 잔디색 위 합성으로 눈으로 확인한다.
3. 배율: 같은 사람의 4방향이 같은 크기로 보이게 한다. Step 1 의 측정에서 방향별 머리 폭이 다르면 (사람, 방향)마다 배율을 머리 폭 기준으로 보정한다(앞 방향 기준, 보정은 ±15% 로 제한하고 넘으면 보고). 시트 전체로는 가장 큰 어른 캐릭터의 앞모습 높이가 프레임 높이 120px 안에 들어가는 공통 배율을 먼저 구한다. 아이처럼 작게 그려진 캐릭터는 작게 남는다.
4. 정렬: 프레임마다 발끝(알파 `>= 128` 인 가장 아래 행)을 프레임 아래에서 4px 위에 맞추고, 가로는 (사람, 방향)마다 3프레임의 몸 중심 중앙값을 프레임 가운데에 맞춘 오프셋을 3프레임에 똑같이 쓴다. 프레임 밖으로 잘리는 픽셀이 있으면 배율을 줄이거나 보고한다.
5. 줄 순서: 원본 이미지 이름순 → 블록 읽기 순서(왼쪽→오른쪽, 위→아래). 신랑·신부로 지정된 두 블록은 하객 줄에서 빼고 맨 끝에 신랑, 신부 순으로 둔다.
6. WebP: `sharp(rawRgba, { raw: { width, height, channels: 4 } }).webp({ lossless: true })` 로 시작하고 1.2MB 를 넘으면 `nearLossless: true, quality: 90`, 그래도 넘으면 품질을 낮춘다(눈으로 확인). 결과를 `public/pic/village-sprites.webp` 에 쓰고 크기·용량·`guests` 수를 출력한다.
7. `import.meta.url` 이 실행 파일일 때만 쓰기를 한다(테스트가 import 해도 파일을 쓰지 않게).

- [ ] **Step 4: 연락표로 눈 검수하고 다듬는다 (반복)**

작업 폴더에 임시 스크립트로 결과 시트의 일부를 PNG 로 풀어(`sharp` 로 webp → raw → `encodePng`) (a) 하객 12명 × 12열을 한 장, (b) 신랑·신부 두 줄, (c) 잔디색(#88ae65) 위 2배 확대 한 장, (d) 한 사람의 4방향 walk1→idle→walk2→idle 나열을 만든다. `Read` 로 열어 점검한다: ① 방향 줄이 맞는가(앞·뒤·왼쪽·오른쪽) ② 프레임 순서가 걷는 모양으로 이어지는가 ③ 같은 사람의 4방향 크기가 같은가 ④ 발끝이 같은 높이인가 ⑤ 가장자리에 번짐·어두운 테두리가 없는가 ⑥ 잘린 곳이 없는가 ⑦ 아이와 어른의 크기 차이가 자연스러운가. 최소 3바퀴 돌리고 점검 결과와 연락표 경로를 보고에 남긴다.

- [ ] **Step 5: 결과물 속성 테스트를 추가한다**

`tests/unit/villageSheet.test.ts` 에 다음을 더한다. WebP 헤더에서 크기를 읽는 도우미는 테스트 안에 둔다.

```ts
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { COLUMNS, FRAME_H, FRAME_W } from "../../scripts/village-art/ingest.mjs";

const SHEET = path.resolve(process.cwd(), "public/pic/village-sprites.webp");

/** WebP 헤더에서 캔버스 크기를 읽는다 (VP8X / VP8L / VP8 ) */
function webpSize(buf: Buffer): { width: number; height: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw new Error("not webp");
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (fourcc === "VP8L") { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
  if (fourcc === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  throw new Error("unknown webp chunk " + fourcc);
}

describe("결과 시트 village-sprites.webp", () => {
  it("규격: 12열 × 80, 줄은 128 의 배수이고 최소 하객 20명 + 신랑 + 신부", () => {
    expect(FRAME_W).toBe(80);
    expect(FRAME_H).toBe(128);
    expect(COLUMNS).toHaveLength(12);
    const { width, height } = webpSize(readFileSync(SHEET));
    expect(width).toBe(12 * FRAME_W);
    expect(height % FRAME_H).toBe(0);
    expect(height / FRAME_H).toBeGreaterThanOrEqual(22);
  });

  it("용량 예산 — 1.2MB 이하", () => {
    expect(statSync(SHEET).size).toBeLessThanOrEqual(1.2 * 1024 * 1024);
  });
});

// sharp 가 있을 때만 도는 픽셀 속성 검사 (CI 에 sharp 가 없으면 건너뛴다)
const sharpMod = await import("sharp").then((m) => m.default).catch(() => null);

describe.skipIf(!sharpMod)("결과 시트 픽셀 속성", () => {
  it("모든 프레임에 캐릭터가 있고 발끝이 아래 가까이, 몸이 가운데에 있으며 잘리지 않는다", async () => {
    const { data, info } = await sharpMod!(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rows = info.height / FRAME_H;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < COLUMNS.length; col++) {
        let x0 = FRAME_W, x1 = -1, y0 = FRAME_H, y1 = -1, opaque = 0;
        for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
          const a = data[((row * FRAME_H + y) * info.width + col * FRAME_W + x) * 4 + 3];
          if (a >= 128) { opaque++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        expect(opaque).toBeGreaterThan(800);
        expect(y1).toBeGreaterThanOrEqual(FRAME_H - 8); // 발끝이 아래 가까이
        expect(y1).toBeLessThanOrEqual(FRAME_H - 1);
        expect(x0).toBeGreaterThanOrEqual(1);          // 좌우로 잘리지 않음
        expect(x1).toBeLessThanOrEqual(FRAME_W - 2);
        expect(y0).toBeGreaterThanOrEqual(1);          // 위로 잘리지 않음
        expect((x0 + x1) / 2).toBeGreaterThanOrEqual(FRAME_W / 2 - 14);
        expect((x0 + x1) / 2).toBeLessThanOrEqual(FRAME_W / 2 + 14);
      }
    }
  });

  it("옅은 번짐이 없다 — 알파가 1~47 인 픽셀은 전체의 1% 미만", async () => {
    const { data, info } = await sharpMod!(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let faint = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0 && data[i] < 48) faint++;
    expect(faint / (info.width * info.height)).toBeLessThan(0.01);
  });
});
```

(`rows` 하한 22 는 하객 20 + 신랑 + 신부. 실제 하객 수는 구현 결과에 맞춘다 — 30 안팎이어야 한다.)

Run: `npx vitest run tests/unit/villageSheet.test.ts` → PASS

- [ ] **Step 6: 전체 검사 + Commit**

Run: `npx tsc --noEmit && npx eslint src scripts tests && npx vitest run && npm run build`
Expected: 모두 성공 (`public/pic/village-sprites.png` 와 코드 생성기는 아직 그대로 두고, 앱은 아직 옛 시트를 쓴다)

```bash
git add scripts/village-art/ingest.mjs tests/unit/villageSheet.test.ts package.json public/pic/village-sprites.webp
git commit -m "feat(guestbook): ChatGPT 캐릭터 시트를 12열 @2x 시트로 바꾸는 변환 스크립트

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`village-src/` 와 `dot_img*.png` 는 커밋하지 않는다. `git status` 로 확인한다.)

---

### Task 2: 앱을 새 시트로 바꾸고 코드 생성 캐릭터 걷어내기

**Files:**
- Modify: `src/lib/pixelSprite.ts`, `src/lib/villageSim.ts`, `src/components/sections/PixelVillage.tsx`
- Modify: `tests/unit/pixelSprite.test.ts`, `tests/unit/villageSim.test.ts`, `tests/unit/villageArt.test.ts`, `tests/unit/villageBg.test.ts`
- Modify: `scripts/village-art/build.mjs` (배경 PNG 만 쓰게), `package.json` 의 `village:art` 는 그대로
- Delete: `scripts/village-art/figure.mjs`, `scripts/village-art/chargen.mjs`, `public/pic/village-sprites.png`

**Interfaces:**
- Consumes (Task 1): `public/pic/village-sprites.webp`(12열, 프레임 80×128, 줄 = 하객 N명 → 신랑 → 신부), `ingest.mjs` 의 `FRAME_W/FRAME_H/SHEET_SCALE/COLUMNS`, Task 1 보고서의 `guests` 수 N.
- Produces: `pixelSprite.ts` → `SPRITE_W = 40`, `SPRITE_H = 64`(논리), `SHEET_SCALE = 2`, `SHEET_FRAME_W = 80`, `SHEET_FRAME_H = 128`, `SHEET_SRC = "/pic/village-sprites.webp"`, `SpriteDir = "down"|"up"|"left"|"right"`, `FRAME_NAMES`(12개, 열 순서), `GUEST_LOOKS = N`, `GROOM_ROW = N`, `BRIDE_ROW = N + 1`, `SHEET_ROWS = N + 2`, `hashId`, `lookRowFromId(id) → 0..N-1`, `frameRect(row, frame) → { sx, sy, sw: 80, sh: 128 }`. `villageSim.ts` → `spriteFor(w): { frame: FrameName }`(flip 없음), `HALF_W = 20`, `BOX_H = 64`.

- [ ] **Step 1: 테스트를 새 규격으로 바꾸고 실패 확인**

`tests/unit/pixelSprite.test.ts` 를 새로 쓴다(앱 규격 + 시트 파일 일치). `N` 은 Task 1 보고의 하객 수로 채운다.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { COLUMNS, FRAME_H, FRAME_W, SHEET_SCALE } from "../../scripts/village-art/ingest.mjs";
import {
  BRIDE_ROW, FRAME_NAMES, GROOM_ROW, GUEST_LOOKS, SHEET_FRAME_H, SHEET_FRAME_W, SHEET_ROWS,
  SHEET_SCALE as APP_SCALE, SPRITE_H, SPRITE_W, frameRect, hashId, lookRowFromId,
} from "@/lib/pixelSprite";

describe("캐릭터 시트 규격", () => {
  it("논리 크기 40×64, 시트 프레임은 그 2배(80×128)", () => {
    expect(SPRITE_W).toBe(40);
    expect(SPRITE_H).toBe(64);
    expect(APP_SCALE).toBe(2);
    expect(SHEET_FRAME_W).toBe(SPRITE_W * APP_SCALE);
    expect(SHEET_FRAME_H).toBe(SPRITE_H * APP_SCALE);
  });

  it("열은 앞·뒤·왼쪽·오른쪽, 각각 정지→걷기1→걷기2 순서의 12프레임이다", () => {
    expect(FRAME_NAMES).toEqual([
      "down_idle", "down_walk1", "down_walk2",
      "up_idle", "up_walk1", "up_walk2",
      "left_idle", "left_walk1", "left_walk2",
      "right_idle", "right_walk1", "right_walk2",
    ]);
  });

  it("줄은 하객 → 신랑 → 신부 순서이고 서로 이어진다", () => {
    expect(GROOM_ROW).toBe(GUEST_LOOKS);
    expect(BRIDE_ROW).toBe(GUEST_LOOKS + 1);
    expect(SHEET_ROWS).toBe(GUEST_LOOKS + 2);
    expect(GUEST_LOOKS).toBeGreaterThanOrEqual(20);
  });
});

describe("앱 쪽 시트 규격과 변환 스크립트 규격이 같다", () => {
  it("프레임 크기·배율·열 순서가 scripts/village-art/ingest.mjs 와 일치한다", () => {
    expect(FRAME_W).toBe(SHEET_FRAME_W);
    expect(FRAME_H).toBe(SHEET_FRAME_H);
    expect(SHEET_SCALE).toBe(APP_SCALE);
    expect(COLUMNS).toEqual([...FRAME_NAMES]);
  });

  it("실제 시트 파일의 가로·세로가 상수와 맞는다 (WebP 헤더)", () => {
    const buf = readFileSync(path.resolve(process.cwd(), "public/pic/village-sprites.webp"));
    const fourcc = buf.toString("ascii", 12, 16);
    let width: number, height: number;
    if (fourcc === "VP8X") { width = 1 + buf.readUIntLE(24, 3); height = 1 + buf.readUIntLE(27, 3); }
    else if (fourcc === "VP8L") { const b = buf.readUInt32LE(21); width = 1 + (b & 0x3fff); height = 1 + ((b >> 14) & 0x3fff); }
    else throw new Error("unexpected webp chunk " + fourcc);
    expect(width).toBe(FRAME_NAMES.length * SHEET_FRAME_W);
    expect(height).toBe(SHEET_ROWS * SHEET_FRAME_H);
  });
});

describe("hashId / lookRowFromId — 하객 id → 시트 줄", () => {
  it("같은 id 는 항상 같은 값·같은 줄이다", () => {
    expect(hashId("guest-1")).toBe(hashId("guest-1"));
    expect(lookRowFromId("guest-1")).toBe(lookRowFromId("guest-1"));
  });

  it("줄은 항상 하객 줄(0~GUEST_LOOKS-1)의 정수이고 신랑·신부 줄은 나오지 않는다", () => {
    for (let i = 0; i < 2000; i++) {
      const row = lookRowFromId(`id-${i}`);
      expect(Number.isInteger(row)).toBe(true);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(GUEST_LOOKS);
    }
  });

  it("id 가 다르면 줄이 골고루 나온다 (500명이면 하객 줄의 90% 이상이 쓰인다)", () => {
    const rows = new Set(Array.from({ length: 500 }, (_, i) => lookRowFromId(`id-${i}`)));
    expect(rows.size).toBeGreaterThanOrEqual(Math.floor(GUEST_LOOKS * 0.9));
  });
});

describe("frameRect — 시트에서 잘라 낼 사각형", () => {
  it("첫 줄 첫 열은 (0, 0) 에서 80×128", () => {
    expect(frameRect(0, "down_idle")).toEqual({ sx: 0, sy: 0, sw: 80, sh: 128 });
  });

  it("열은 프레임 순서 × 80, 줄은 줄 번호 × 128", () => {
    expect(frameRect(3, "up_walk1")).toEqual({ sx: 4 * 80, sy: 3 * 128, sw: 80, sh: 128 });
    expect(frameRect(BRIDE_ROW, "right_walk2")).toEqual({ sx: 11 * 80, sy: BRIDE_ROW * 128, sw: 80, sh: 128 });
  });

  it("모든 줄·프레임의 사각형이 시트 안에 있고 서로 겹치지 않는다", () => {
    const seen = new Set<string>();
    for (let row = 0; row < SHEET_ROWS; row++) {
      for (const f of FRAME_NAMES) {
        const r = frameRect(row, f);
        expect(r.sx + r.sw).toBeLessThanOrEqual(12 * 80);
        expect(r.sy + r.sh).toBeLessThanOrEqual(SHEET_ROWS * 128);
        seen.add(`${r.sx},${r.sy}`);
      }
    }
    expect(seen.size).toBe(SHEET_ROWS * FRAME_NAMES.length);
  });
});
```

`tests/unit/villageSim.test.ts`: `spriteFor` 테스트에서 `flip` 단언을 지우고 왼쪽 걷기는 `left_*`, 오른쪽은 `right_*` 프레임이 나오는지로 바꾼다(`spriteFor({ ...w, dir: "left", mode: "walk", clock: 0 }).frame` 이 `"left_walk1"`, `dir: "right"` 이 `"right_walk1"`, 정지는 `left_idle`/`right_idle`, 앞·뒤는 `down_*`/`up_*`). `HALF_W` 가 쓰인 곳(`AREA` 단언, `pickWalkerAt`)은 새 값(20)을 따르도록 고친다(`AREA` 단언은 상수 표현식 그대로라 값만 바뀐다).

`tests/unit/villageArt.test.ts`: 코드 생성 캐릭터 `describe`(`캐릭터 생성기 …`) 전체와 그 import(`chargen.mjs`)를 지우고, PNG 코덱·정원 배경 `describe` 만 남긴다(`readPng` 도우미는 정원 테스트가 쓰므로 유지). `tests/unit/villageBg.test.ts`: 캐릭터 시트 PNG 두 테스트(`288×3168…`, `400KB…`)를 지운다(시트 검사는 `villageSheet.test.ts` 가 한다). `scripts/village-art/build.mjs` 에서 `buildSheet`/시트 쓰기를 지우고 배경만 쓰게 한다. 삭제: `figure.mjs`, `chargen.mjs`, `public/pic/village-sprites.png`.

Run: `npx vitest run tests/unit/pixelSprite.test.ts tests/unit/villageSim.test.ts tests/unit/villageArt.test.ts tests/unit/villageBg.test.ts` → FAIL (상수·`spriteFor` 가 아직 옛 규격)

- [ ] **Step 2: 앱 코드 바꾸기**

`pixelSprite.ts` 를 위 Interfaces 대로 쓴다(머리말 주석도 새 구조로: 사람이 그린(AI) 시트, @2x, 12열, 생성 스크립트는 `ingest.mjs`). 열 이름 타입은 `SpriteDir = "down"|"up"|"left"|"right"`. `frameRect` 는 `FRAME_NAMES.indexOf(frame) * SHEET_FRAME_W`, `row * SHEET_FRAME_H`. `villageSim.ts`: `HALF_W = 20`, `spriteFor` 는 `{ frame: \`${w.dir === "down" ? "down" : w.dir}_${anim}\` }` 꼴(`Dir` 이 이미 `down|up|left|right` 라 그대로 쓰면 된다). `FrameName` 타입은 `pixelSprite` 가 내보낸 것을 쓴다.

`PixelVillage.tsx`: `drawWalker` 를 다음처럼 바꾼다(반전 분기 삭제, @2x 를 논리 크기로 그린다). 이미지 보간은 켠다.

```ts
/** 캐릭터 시트에서 (줄, 프레임)을 잘라 논리 크기로 그린다 — 시트는 @2x 이고 왼쪽·오른쪽은 따로 그려져 있다 */
function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, sheet: HTMLImageElement, row: number): void {
  const { frame } = spriteFor(w);
  const { sx, sy, sw, sh } = frameRect(row, frame);
  const dx = Math.round(w.x - SPRITE_W / 2);
  const dy = Math.round(w.y - SPRITE_H);
  ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, SPRITE_W, SPRITE_H);
}
```

`draw` 의 `ctx.imageSmoothingEnabled = false` 를 `true`(및 `imageSmoothingQuality = "high"`)로 바꾸고 주석에 "@2x 시트를 줄여 그리므로 보간한다" 를 쓴다. 배경 PNG 는 아직 옛 도트 배경이라 보간되면 흐려질 수 있으니, **배경을 그릴 때만 `imageSmoothingEnabled = false` 로 두고 캐릭터를 그리기 전에 `true` 로 바꾼다**(Task 3 에서 배경이 @2x 이미지로 바뀌면 통일한다). `NPCS` 의 `row`·좌표, 이름표 `tagX` 는 그대로(세계는 아직 384×352). 하객은 `lookRowFromId`(새 `GUEST_LOOKS`)를 쓴다.

- [ ] **Step 3: 테스트·타입·빌드 통과 확인**

Run: `npx vitest run tests/unit/pixelSprite.test.ts tests/unit/villageSim.test.ts tests/unit/villageArt.test.ts tests/unit/villageBg.test.ts` → PASS
Run: `npx tsc --noEmit && npx eslint src scripts tests && npx vitest run && npm run build` → 모두 성공

- [ ] **Step 4: 눈으로 확인 (임시 페이지)**

작업 폴더에 git worktree 로 임시 확인 환경을 만든다(저장소를 어지럽히지 않는다): 거기에 `src/app/village-preview/page.tsx`(클라이언트 컴포넌트)를 두고 `?n=` 쿼리 수만큼 가짜 하객(`Celebration` 형: `id`, `name`(한글 이름 다양하게), `kind`, `message`, `review`)으로 `<PixelVillage />` 를 렌더한다. 앱이 `?key=` 로 접근을 막으면(`src/proxy.ts` 등) 임시 worktree 안에서만 우회한다. `npm run dev -- -p 3000` 으로 띄우고 Playwright(`node_modules/playwright-core`, 이전 세션 스크립트 `scratchpad/lib.cjs`·`perf.cjs`·`common.cjs` 참고)로 모바일 폭(390×844, dpr 3)과 데스크톱(dpr 1·2)에서 `n=12`, `n=30` 스크린샷을 찍어 `Read` 로 열어 본다. 점검: 캐릭터가 선명한가(흐리지 않은가), 방향 전환 시 앞·뒤·왼쪽·오른쪽 모습이 맞는가, 걷기가 자연스러운가(발 흔들림·세로 튐 없음), 신랑·신부가 단상에 서 있고 이름표·말풍선·두 번 탭 갤러리 이동이 되는가, 콘솔 오류가 없는가. 이 확인 환경(경로와 실행 방법)은 보고서에 남긴다(이후 Task 에서 재사용).

- [ ] **Step 5: Commit**

```bash
git add -A src scripts tests public/pic package.json
git commit -m "feat(guestbook): 마을 캐릭터를 AI 시트(12열 @2x)로 바꾸고 코드 생성 캐릭터를 걷어낸다

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`git status` 로 `village-src/`, `dot_img*.png`, `wedding_main.jpg` 가 포함되지 않았는지 확인한다. `git add -A` 는 위 경로에만 쓴다.)
