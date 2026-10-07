# 도트 마당 '꽃길 + 보통 체형 하객 + 북적임' Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방명록 `🏘️ 마을` 탭의 그림을 참고 영상(세로 꽃길에 보통 체형 하객이 북적이는 화면)에 가깝게 올린다: 32×64 보통 체형 캐릭터 96종, 384×512 세로 꽃길 배경, 앞사람에게 가린 이름표 숨김, 둥근 말풍선.

**Architecture:** 앱 구조(순수 모듈 `pixelSprite.ts`·`villageSim.ts`·새 `villageTags.ts` + Canvas 컴포넌트 `PixelVillage.tsx`)와 그림 파이프라인(`scripts/village-art/` → PNG 두 장 → 앱은 PNG 만 사용, 테스트가 "커밋된 PNG == 생성기 결과" 보장)은 HD 설계 그대로다. 바뀌는 것은 ① 시트 규격(프레임 32×64, 하객 96종) ② 캐릭터 그리기 엔진(`figure.mjs` 신설) ③ 배경(384×512) ④ 이름표 겹침 숨김과 말풍선 모양이다.

**Tech Stack:** Next.js 16.3.3, React 19.2, TypeScript strict, Tailwind v4, vitest 3 (node 환경, `@` 별칭), Canvas 2D, Node 내장 `zlib`(PNG). 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-07-guestbook-village-crowd-design.md` (이 문서가 대체하지 않는 부분은 `2026-10-07-guestbook-village-hd-design.md` → `…garden-design.md` → `…topdown-design.md` → `…pixel-village-design.md` 순으로 따른다)

## Global Constraints

- **Next.js 16 은 학습 데이터와 다르다** (`AGENTS.md`): 이 계획은 이미 `"use client"` 인 컴포넌트 안의 DOM·Canvas API 만 다루고 새 Next API 는 없다. 그래도 Next 가 경고·오류를 내면 보고한다.
- 세계 **384×512**, 캐릭터 프레임 **32×64**, `HALF_W` 16, `BOX_H` 64, 걷는 영역(발 위치 기준) `AREA = { x0: 80, x1: 304, y0: 168, y1: 512 }`, `WALK_SPEED` 48, `ENTER_Y = WORLD_H + BOX_H`, 터치 여유 pad 6. (Task 1 에서 `BOX_H`·프레임만, Task 4 에서 세계·`AREA` 를 바꾼다. 그 사이 상태도 테스트·빌드는 항상 통과해야 한다.)
- 신랑·신부는 `fixed` 캐릭터, 발 위치 신랑 `(172, 136)` / 신부 `(212, 136)`, 이름표 기준 x 신랑 `190`(오른쪽 맞춤) / 신부 `194`(왼쪽 맞춤), 색 금색 `#b89b6e` / 분홍 `#d98fb0`. 두 번째 누름은 `#gallery` 로 스크롤(기존 동작).
- **캐릭터 시트** `public/pic/village-sprites.png`: **288×6272** PNG(9열 × 98줄, 프레임 32×64, 배경 투명, **500KB 미만**). 열 순서 `down_idle, down_walk1, down_walk2, up_idle, up_walk1, up_walk2, side_idle, side_walk1, side_walk2`(`side` 는 오른쪽을 봄, 왼쪽은 그릴 때 좌우 반전). 줄 0~95 하객 96종, 줄 96 신랑, 줄 97 신부. 하객은 `hashId(id) % 96` 번째 줄.
- **배경** `public/pic/village-bg.png`: **384×512** PNG(**300KB 미만**, 모든 픽셀 불투명).
- **그림 생성 스크립트** `scripts/village-art/`(순수 Node ESM, 외부 의존성 없음, 시드 고정 → 항상 같은 그림, `npm run village:art`). 앱 코드는 이 스크립트를 import 하지 않는다. 커밋된 두 PNG 는 스크립트 결과와 **픽셀까지 같아야** 한다(파일 바이트가 아니라 픽셀 비교 — zlib 출력은 환경에 따라 다를 수 있다). 그림을 바꾸면 반드시 `npm run village:art` 로 PNG 를 다시 만들어 함께 커밋한다.
- **참고 영상(저작권)**: 사용자가 보여 준 영상 속 그림·에셋은 다른 서비스의 것이다. 구도·밀도·분위기만 참고하고 **그림을 따라 그리거나 복사·추적하지 않는다.** 참고 프레임 파일은 저장소에 넣지 않는다. (구현자가 눈으로 비교할 용도로 작업 폴더에 있다: `C:\Users\owner\AppData\Local\Temp\claude\D--98-----invitation-one\4942bf69-1275-401d-9206-ab36cc2f7ef5\scratchpad\vid\f003.png`, `f040.png`, `f080.png`, `f117.png` — 442×598, 세로 화면, 하객 수십 명이 꽃길을 걷는 모습.)
- 렌더링 규칙은 HD 설계와 같다: 도트 세계는 `imageSmoothingEnabled = false`, 캔버스 배율 `max(1, ceil(css폭 × dpr / 384))`, 캔버스 CSS 에 `image-rendering: pixelated` 를 **쓰지 않는다**, 글씨는 화면 해상도(약 11 css px)로 그린다, 시트에서 `drawImage(sheet, sx, sy, sw, sh, dx, dy, sw, sh)` 로 잘라 그린다. 시트를 못 불러오면 `마을을 불러오지 못했어요`, 배경만 못 불러오면 단색 잔디(`#88ae65`), 시트가 오기 전에는 이름표·말풍선도 그리지 않는다.
- DB·API 변경 없음, 새 npm 의존성 없음. 마을은 공개 필드(`id`, `name`, `kind`, `message`, `review`)만 쓴다. 신랑·신부 동작, 자동 말풍선(6초/4초), 입장, 절전·접근성, `Guestbook.tsx`·`Gallery.tsx` 는 바뀌지 않는다.
- 기존 리뷰 반영 사항은 유지한다: 모션 줄이기용 말풍선 4초 타이머, IntersectionObserver 마지막 레코드, 서로게이트 안전 말줄임, 굵은 제목 폭 측정, `e.button !== 0` 가드, `touch-manipulation`, 자동 말풍선에서 입장 중 하객 제외, 이름표 기준 x(`tagX`/`tagAlign`).
- 테스트는 `tests/unit/**/*.test.ts` (vitest, node 환경, `@` → `src`). 순수 로직·생성 스크립트·정적 에셋만 테스트하고, 렌더·터치는 브라우저(헤드리스 Chromium, 작업 폴더의 임시 페이지)로 확인한다.
- 코드 주석은 한국어, "왜" 를 짧게. 커밋은 `feat(guestbook): …` 형식의 한국어 메시지 + 트레일러:

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

작업 브랜치는 이미 `feat/guestbook-pixel-village` (PR #43 의 브랜치)이다. 새 브랜치를 만들지 않는다.

---

## File Structure

| 파일 | 구분 | 책임 |
|---|---|---|
| `scripts/village-art/figure.mjs` | 신규 (Task 2) | 한 사람·한 프레임을 32×64 색 배열로 그리는 엔진(체형·음영·색 외곽선·얼굴·머리·옷·소품·걷기). `FRAME_W`, `FRAME_H`, `renderFrame` 내보냄 |
| `scripts/village-art/chargen.mjs` | 수정 (Task 1·2·3) | 열 순서(`COLUMNS`), 하객 96종 조합(`buildGuestLooks`), 신랑·신부 모습, `allLooks`, `buildSheet`. `FRAME_W/H` 는 `figure.mjs` 에서 다시 내보냄 |
| `scripts/village-art/garden.mjs` | 수정 (Task 4) | 384×512 세로 꽃길 배경 그리기 |
| `public/pic/village-sprites.png`, `village-bg.png` | 재생성 | 위 스크립트의 결과 (`npm run village:art`) |
| `src/lib/pixelSprite.ts` | 수정 (Task 1) | 시트 규격 상수(`SPRITE_H` 64, `GUEST_LOOKS` 96, 줄 번호) |
| `src/lib/villageSim.ts` | 수정 (Task 1·4) | `BOX_H` 64, 세계 384×512, `AREA` |
| `src/lib/villageTags.ts` | 신규 (Task 5) | 이름표 겹침 숨김 `layoutTags` (순수 함수) |
| `src/components/sections/PixelVillage.tsx` | 수정 (Task 4·5) | 신랑·신부 좌표, 이름표(흰 테두리·겹침 숨김), 둥근 말풍선 |
| `tests/unit/pixelSprite.test.ts`, `villageArt.test.ts`, `villageBg.test.ts`, `villageSim.test.ts` | 수정 | 새 규격에 맞춤 |
| `tests/unit/villageTags.test.ts` | 신규 (Task 5) | `layoutTags` 우선순위·겹침·경계 |

---

### Task 1: 시트 규격을 32×64 · 하객 96종으로 바꾸기 (그림은 임시로 바닥 맞춤)

이 작업은 **규격과 테스트·PNG 를 새 값으로 맞추는 것**이 목적이다. 캐릭터 그림 자체는 Task 2 에서 새로 그리므로, 여기서는 기존 그림을 프레임 아래쪽에 붙여서 화면이 크게 어색하지 않게만 한다.

**Files:**
- Modify: `src/lib/pixelSprite.ts`
- Modify: `src/lib/villageSim.ts` (`BOX_H` 한 줄)
- Modify: `scripts/village-art/chargen.mjs`
- Modify: `tests/unit/pixelSprite.test.ts`, `tests/unit/villageArt.test.ts`, `tests/unit/villageBg.test.ts`
- Regenerate: `public/pic/village-sprites.png`

**Interfaces:**
- Produces: `SPRITE_W=32`, `SPRITE_H=64`, `GUEST_LOOKS=96`, `GROOM_ROW=96`, `BRIDE_ROW=97`, `SHEET_ROWS=98`, `frameRect(row, frame)` → `{ sx: col*32, sy: row*64, sw: 32, sh: 64 }`, `lookRowFromId(id)` → `0..95`. `chargen.mjs` 는 `FRAME_H=64`, `GUEST_LOOKS=96`, `buildGuestLooks(count=96)`, `allLooks()`(98개), `buildSheet()`(288×6272) 를 내보낸다. `BOX_H=64`.

- [ ] **Step 1: 테스트를 새 규격으로 고치고 실패 확인**

`tests/unit/pixelSprite.test.ts` 를 다음처럼 바꾼다(해당 `it` 만 — 나머지는 그대로).

```ts
  it("프레임은 32×64 이다", () => {
    expect(SPRITE_W).toBe(32);
    expect(SPRITE_H).toBe(64);
  });
  // …열 순서 테스트는 그대로…
  it("줄은 하객 96종 → 신랑 → 신부 = 98줄이다", () => {
    expect(GUEST_LOOKS).toBe(96);
    expect(GROOM_ROW).toBe(96);
    expect(BRIDE_ROW).toBe(97);
    expect(SHEET_ROWS).toBe(98);
  });
```

`id 가 다르면 줄이 골고루 나온다` 는 `500명이면 96줄 중 85줄 이상 쓰인다` / `toBeGreaterThanOrEqual(85)` 로 바꾼다. `frameRect` 테스트는 다음으로 바꾼다.

```ts
  it("첫 줄 첫 열은 (0, 0) 에서 32×64", () => {
    expect(frameRect(0, "down_idle")).toEqual({ sx: 0, sy: 0, sw: 32, sh: 64 });
  });

  it("열은 프레임 순서 × 32, 줄은 줄 번호 × 64", () => {
    expect(frameRect(3, "up_walk1")).toEqual({ sx: 4 * 32, sy: 3 * 64, sw: 32, sh: 64 });
    expect(frameRect(BRIDE_ROW, "side_walk2")).toEqual({ sx: 8 * 32, sy: 97 * 64, sw: 32, sh: 64 });
  });

  it("모든 줄·프레임의 사각형이 시트(288×6272) 안에 있고 서로 겹치지 않는다", () => {
    const seen = new Set<string>();
    for (let row = 0; row < SHEET_ROWS; row++) {
      for (const f of FRAME_NAMES) {
        const r = frameRect(row, f);
        expect(r.sx).toBeGreaterThanOrEqual(0);
        expect(r.sx + r.sw).toBeLessThanOrEqual(288);
        expect(r.sy + r.sh).toBeLessThanOrEqual(6272);
        seen.add(`${r.sx},${r.sy}`);
      }
    }
    expect(seen.size).toBe(SHEET_ROWS * FRAME_NAMES.length);
  });
```

`tests/unit/villageArt.test.ts` 의 캐릭터 생성기 `describe` 를 고친다: `시트는 9열 × (하객 96 + 신랑 + 신부 = 98)줄의 32×64 프레임이다` — `FRAME_H` 64, `rows` = `GUEST_LOOKS + 2`, `sheet.height` = `98 * 64`. `buildGuestLooks(64)` → `buildGuestLooks(96)` 와 `.size).toBe(96)`, `신랑·신부는 …66줄 모두 다르다` 는 `rows`(=98) 기준이라 그대로 두되 제목의 숫자만 98 로. `frameBytes` 의 `FRAME_H` 는 이미 상수를 쓰므로 그대로. 모습 분포 테스트의 하한은 그대로(머리 모양 6종 각 8 이상, 옷 4종 각 10 이상, 피부 5종 각 10 이상 — 96종이면 모두 만족).

`tests/unit/villageBg.test.ts` 의 시트 테스트를 `288×6272 PNG 이다 — 9열 × 98줄(32×64 프레임)` / `{ width: 9 * 32, height: 98 * 64 }` 로, `400KB 미만` 을 `500KB 미만`(`500 * 1024`)으로 바꾼다. 배경 테스트는 이 작업에서 건드리지 않는다.

Run: `npx vitest run tests/unit/pixelSprite.test.ts tests/unit/villageArt.test.ts tests/unit/villageBg.test.ts`
Expected: FAIL (상수가 아직 옛 값)

- [ ] **Step 2: 상수와 생성기 규격 바꾸기**

`src/lib/pixelSprite.ts`: 머리말 주석의 `32×48` → `32×64`, `SPRITE_H = 64`, `GUEST_LOOKS = 96`(나머지 `GROOM_ROW`, `BRIDE_ROW`, `SHEET_ROWS` 는 식 그대로). `src/lib/villageSim.ts`: `export const BOX_H = 64;`.

`scripts/village-art/chargen.mjs`: `FRAME_H = 64`, `GUEST_LOOKS = 96`, 맨 위 주석의 32×48 → 32×64. `renderFrame` 안의 기존 그림은 48 줄 높이 기준 좌표다. 프레임 아래에 붙이도록 `put` 에 세로 이동량을 둔다.

```js
  const DY = CH - 48; // 임시: 기존 32×48 그림을 프레임 아래에 붙인다(Task 2 에서 새 그림으로 교체)
  const put = (x, y, c) => { y += DY; if (x >= 0 && y >= 0 && x < CW && y < CH) buf[y * CW + x] = c; };
```

(`layer`·`dot` 은 모두 `put` 을 거치므로 그대로다. 외곽선 단계는 `buf` 를 직접 읽으니 그대로 동작한다.)

- [ ] **Step 3: PNG 다시 만들고 테스트 통과 확인**

Run: `npm run village:art` → 시트가 `288x6272` 로 출력되는지 확인.
Run: `npx vitest run tests/unit/pixelSprite.test.ts tests/unit/villageArt.test.ts tests/unit/villageBg.test.ts tests/unit/villageSim.test.ts`
Expected: 전부 PASS (배경 테스트는 옛 배경 그대로라 통과해야 한다)

- [ ] **Step 4: 전체 검사**

Run: `npx tsc --noEmit && npx eslint src scripts tests && npx vitest run`
Expected: 모두 성공

- [ ] **Step 5: Commit**

```bash
git add src/lib/pixelSprite.ts src/lib/villageSim.ts scripts/village-art/chargen.mjs tests/unit public/pic/village-sprites.png
git commit -m "feat(guestbook): 캐릭터 시트 규격을 32×64·하객 96종으로 바꾼다 (그림은 임시)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 보통 체형 캐릭터 그리기 엔진 (`figure.mjs`)

기존 `renderFrame`(도형 → 음영 → 균일 외곽선, 32×48 아기 체형)을 **새 엔진**으로 바꾼다. 이 작업은 **그림의 질을 눈으로 확인하며 반복하는 작업**이다. 코드를 쓴 뒤 반드시 연락표를 만들어 `Read` 로 열어 보고, 참고 프레임(Global Constraints 의 경로)과 나란히 비교해서 기준을 만족할 때까지 다듬는다. 이 작업에서는 **하객 모습 목록(`buildGuestLooks`)·머리/옷 종류는 기존 그대로** 두고(Task 3 에서 늘린다), 같은 옵션들이 새 체형에서 잘 보이게 그리는 데 집중한다.

**Files:**
- Create: `scripts/village-art/figure.mjs`
- Modify: `scripts/village-art/chargen.mjs` (`renderFrame`·픽셀 도우미 삭제 → `figure.mjs` 에서 import, `FRAME_W/H` 다시 내보냄, `hex` 는 계속 내보냄)
- Modify: `tests/unit/villageArt.test.ts` (새 속성 테스트)
- Regenerate: `public/pic/village-sprites.png`

**Interfaces:**
- Consumes (Task 1): `FRAME_H = 64`, `COLUMNS`, 옛 `look` 필드: `skin, hair, hairStyle("short"|"bob"|"long"|"ponytail"|"bun"|"curly"|"none"), outfit("tee"|"long"|"dress"|"hoodie"|"suit"), top, pants, shoes, hat(0|"cap"|"flower"|"ribbon"), hatColor, accent`.
- Produces: `figure.mjs` → `export const FRAME_W = 32, FRAME_H = 64; export const hex(h): [r,g,b]; export function renderFrame(look, dir, anim): (string|null)[]` (길이 32*64, hex 문자열 또는 투명 `null`, `dir` ∈ `"down"|"up"|"side"`, `anim` ∈ `"idle"|"walk1"|"walk2"`). `chargen.mjs` 는 이를 import 해서 쓰고 `FRAME_W`, `FRAME_H`, `hex` 를 다시 내보낸다(테스트가 `chargen.mjs` 에서 import 한다).

**몸 설계 기준(앞모습, 32×64 프레임, 가운데 x≈15.5)** — 출발점이며 눈으로 보고 1~2px 조정해도 된다:

| 부위 | 위치 |
|---|---|
| 머리 | y 3~17(높이 15), x 9~22(너비 14), 둥근 사각형 |
| 목 | y 18~19, x 14~17 |
| 몸통 | y 20~37, x 10~21 (어깨 12px) |
| 팔 | 왼 x 7~9 · 오른 x 22~24, y 21~36 (너비 3), 손 2px 살색 |
| 다리 | y 38~60, 왼 x 11~15 · 오른 x 16~20 |
| 신발 | y 59~62 |
| 발 그림자 | y 61~63, 반투명 타원(화면 끝까지 닿지 않게) |

옆모습은 몸통 너비 약 9px(x 11~20), 머리 x 9~23(코가 오른쪽으로 1~2px 나옴). 걷기: 앞·뒤는 한쪽 다리를 2px 들고 반대 팔을 흔들며 **몸 전체가 걷기 프레임에서 1px 내려갔다 올라온다**(`walk1`/`walk2` 는 서로 다른 발·팔). 옆은 다리를 ±3px 벌리고 팔을 반대로.

**미술 기준**(전부 눈으로 확인):
1. 어른 체형: 머리 높이/키 ≈ 1/4~1/4.5, 어깨·다리 길이가 자연스럽다. 2배로 키워 봐도 아기 체형처럼 보이지 않는다.
2. 음영 3단(밝음·기본·어두움) + **색 외곽선**(그 부분 채움색을 어둡게 한 색, 순수 검정 금지). 머리·옷·피부 경계가 구분된다.
3. 얼굴(앞): 눈 2×2 + 하이라이트 1px, 눈썹, 코 그늘 1px, 입, 볼. 옆: 코·턱선이 보이고 눈은 1개. 뒤: 얼굴 없음.
4. 머리: 기본색 + 밝은 결 1~2줄 + 뒷머리 볼륨. 앞·옆·뒤 모두 방향에 맞게(뒤에서는 얼굴이 없고 머리가 후두부를 덮는다).
5. 옷: 목선·소매·밑단이 보이고 몸통에 접힌 곳 음영 1~2줄. 원피스는 치마가 퍼진다. 후드는 목 뒤 후드 주머니.
6. 모자(캡·꽃·리본)와 `suit`(신랑: 흰 셔츠·타이·가슴 꽃)가 새 체형에서도 올바른 자리에 있다.

- [ ] **Step 1: 객관 속성 테스트를 먼저 쓴다 (실패 확인)**

`tests/unit/villageArt.test.ts` 의 `캐릭터 생성기` `describe` 안에 추가한다(`frameBytes`·`sheet`·`rows` 는 이미 있다).

```ts
  /** 프레임에서 불투명 픽셀의 경계 상자 */
  const bbox = (row: number, col: number) => {
    const f = frameBytes(row, col);
    let x0 = FRAME_W, x1 = -1, y0 = FRAME_H, y1 = -1;
    for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
      if (f[(y * FRAME_W + x) * 4 + 3] === 255) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return { x0, x1, y0, y1 };
  };

  it("모든 프레임에서 캐릭터는 프레임 안에 가운데 서 있고 발이 아래에 붙으며 키가 56~63px 이다", () => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < COLUMNS.length; col++) {
        const b = bbox(row, col);
        expect(b.y1).toBeGreaterThanOrEqual(60); // 발끝(그림자 포함)이 맨 아래 근처
        expect(b.y1 - b.y0 + 1).toBeGreaterThanOrEqual(56);
        expect(b.y1 - b.y0 + 1).toBeLessThanOrEqual(64);
        const cx = (b.x0 + b.x1) / 2;
        expect(cx).toBeGreaterThanOrEqual(13);
        expect(cx).toBeLessThanOrEqual(18);
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(FRAME_W - 1);
      }
    }
  });

  it("외곽선은 순수 검정이 아니다 (색 외곽선)", () => {
    for (const row of [0, 40, rows - 1]) {
      const f = frameBytes(row, 0);
      for (let i = 0; i < f.length; i += 4) {
        if (f[i + 3] === 255) expect(f[i] + f[i + 1] + f[i + 2]).toBeGreaterThan(30);
      }
    }
  });

  it("걷기 프레임에서 몸이 1px 오르내린다 (idle 과 walk1 의 머리 꼭대기가 다르다)", () => {
    for (const row of [0, 25, 70]) {
      const idle = bbox(row, 0).y0;
      const walk = bbox(row, 1).y0;
      expect(Math.abs(idle - walk)).toBeGreaterThanOrEqual(1);
    }
  });
```

`describe` 맨 위 import 에 `FRAME_W` 가 이미 있다. Run: `npx vitest run tests/unit/villageArt.test.ts` → 임시 그림(바닥 맞춤 48px)은 키 조건(56 이상)에서 FAIL 해야 한다.

- [ ] **Step 2: `figure.mjs` 를 쓰고 `chargen.mjs` 를 연결한다**

`figure.mjs` 는 기존 `chargen.mjs` 의 도우미(`hex`, `mix`, `light`, `dark`, `rect`, `rrect`, `ell`, `union`, `minus`, `shift`)를 옮겨 와서 쓰고, 다음 구조를 가진다. 함수 몸체는 위 "몸 설계 기준"과 "미술 기준"을 만족하도록 구현자가 쓴다.

```js
export const FRAME_W = 32;
export const FRAME_H = 64;
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** 한 프레임 → 길이 FRAME_W*FRAME_H 의 색 배열(hex 문자열, 투명은 null) */
export function renderFrame(look, dir, anim) {
  const buf = new Array(FRAME_W * FRAME_H).fill(null);
  // 1) 발 그림자  2) 뒷머리·몸 뒤 요소  3) 다리·신발  4) 몸통·팔  5) 목·머리·얼굴  6) 머리카락  7) 모자·소품
  // 8) 색 외곽선: 투명 픽셀이 불투명 픽셀(상하좌우)과 맞닿으면, 맞닿은 불투명 픽셀 색을 어둡게 해서 칠한다
  return buf;
}
```

`chargen.mjs` 는 기존 `renderFrame`·도우미를 지우고 다음으로 바꾼다.

```js
import { FRAME_W, FRAME_H, hex, renderFrame } from "./figure.mjs";
export { FRAME_W, FRAME_H, hex };
```

`buildSheet` 안의 `const CW`… 같은 옛 상수는 `FRAME_W/FRAME_H` 로 바꾼다. 외곽선·그림자 색은 `figure.mjs` 안에서만 관리한다.

- [ ] **Step 3: 연락표를 만들어 눈으로 확인하고 다듬는다 (반복)**

작업 폴더에 임시 스크립트(저장소에 커밋하지 않는다)를 만들어, 하객 줄 몇 개(예: 0, 7, 20, 41, 63, 95), 신랑·신부 줄의 9프레임을 **4배 확대**해서 PNG 한 장으로 저장한다(`scripts/village-art/png.mjs` 의 `encodePng` 를 쓰면 된다). 그 PNG 를 `Read` 로 열어 보고, 참고 프레임(`f040.png` 등)과 비교하며 미술 기준 6항목을 하나씩 점검한다. 부족하면 `figure.mjs` 를 고쳐 다시 만든다. 최소 3바퀴 이상 돌리고, 마지막 연락표 경로와 점검 결과(기준별 ○/△/×)를 보고에 남긴다. 1배 크기(실제 크기)로도 한 번 확인한다 — 확대해서만 좋아 보이면 안 된다.

- [ ] **Step 4: PNG 를 다시 만들고 전체 테스트 통과 확인**

Run: `npm run village:art && npx vitest run tests/unit/villageArt.test.ts tests/unit/villageBg.test.ts`
Expected: PASS (시트 500KB 미만 포함)
Run: `npx tsc --noEmit && npx eslint src scripts tests && npx vitest run`
Expected: 모두 성공

- [ ] **Step 5: Commit**

```bash
git add scripts/village-art tests/unit/villageArt.test.ts public/pic/village-sprites.png
git commit -m "feat(guestbook): 보통 체형·음영·색 외곽선 캐릭터 그리기 엔진

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 하객 96종 다양화 + 신랑·신부 + 소품

Task 2 의 엔진 위에 **머리 8종, 옷 6종, 소품**을 추가하고 96종 조합 규칙을 새로 쓰며, 신랑·신부를 하객과 한눈에 구분되게 다듬는다. 이 작업도 연락표로 눈으로 확인한다.

**Files:**
- Modify: `scripts/village-art/figure.mjs` (머리 `side-part`·`sporty` 추가, 옷 `shirt`·`cardigan`·`jacket` 추가, 소품 `glasses`·`bucket`·`scarf`·`bag` 추가, 신랑 가슴 꽃·신부 베일/부케)
- Modify: `scripts/village-art/chargen.mjs` (`STYLES` 8종, `OUTFITS` 6종, 소품 필드, `buildGuestLooks`, `GROOM_LOOK`, `BRIDE_LOOK`)
- Modify: `tests/unit/villageArt.test.ts`
- Regenerate: `public/pic/village-sprites.png`

**Interfaces:**
- Consumes (Task 2): `renderFrame(look, dir, anim)`.
- Produces: `look` 필드 확장 — `hairStyle`: `"short"|"sidepart"|"bob"|"long"|"ponytail"|"bun"|"curly"|"sporty"|"none"`, `outfit`: `"tee"|"shirt"|"hoodie"|"dress"|"cardigan"|"jacket"|"suit"`(`suit` 는 신랑 전용), 소품: `glasses`(bool), `hat`(`0|"cap"|"bucket"|"flower"|"ribbon"`), `scarf`(색 문자열 또는 0), `bag`(색 문자열 또는 0). `buildGuestLooks(count = 96)` 는 서로 다른 조합 96개를 시드 고정으로 돌려준다. 정장 `suit` 는 하객에게 없다.

**분포 규칙(테스트가 검사한다):** 96명 중 머리 모양 8종이 각각 8명 이상, 옷 6종(`suit` 제외)이 각각 10명 이상, 피부 5종이 각각 10명 이상, 안경 쓴 사람 10명 이상, 모자 쓴 사람 10명 이상(종류별 3명 이상), 가방 멘 사람 10명 이상. 머리색은 자연색(검정·갈색·밤색) 비중이 높고 금발·회색·분홍·파랑 같은 튀는 색은 합쳐 20% 안팎이 되도록 한다(영상처럼 대부분은 평범하고 몇 명만 튄다).

- [ ] **Step 1: 분포·신랑신부 테스트를 쓴다 (실패 확인)**

`tests/unit/villageArt.test.ts` 의 `하객 64종은 …` 테스트를 다음으로 교체한다(제목도 96종으로).

```ts
  it("하객 96종은 서로 다른 조합이고 머리 모양·옷·피부색·소품이 골고루 나온다 (정장은 없다)", () => {
    const looks = buildGuestLooks(96) as Record<string, unknown>[];
    expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(96);
    const count = (key: string) => {
      const m = new Map<string, number>();
      for (const l of looks) m.set(String(l[key]), (m.get(String(l[key])) ?? 0) + 1);
      return m;
    };
    const styles = count("hairStyle");
    expect(styles.has("none")).toBe(false);
    expect(styles.size).toBe(8);
    for (const n of styles.values()) expect(n).toBeGreaterThanOrEqual(8);
    const outfits = count("outfit");
    expect(outfits.has("suit")).toBe(false);
    expect(outfits.size).toBe(6);
    for (const n of outfits.values()) expect(n).toBeGreaterThanOrEqual(10);
    const skins = count("skin");
    expect(skins.size).toBe(5);
    for (const n of skins.values()) expect(n).toBeGreaterThanOrEqual(10);
    expect(looks.filter((l) => l.glasses).length).toBeGreaterThanOrEqual(10);
    const hats = looks.filter((l) => l.hat);
    expect(hats.length).toBeGreaterThanOrEqual(10);
    const hatKinds = new Map<string, number>();
    for (const l of hats) hatKinds.set(String(l.hat), (hatKinds.get(String(l.hat)) ?? 0) + 1);
    expect(hatKinds.size).toBeGreaterThanOrEqual(4);
    for (const n of hatKinds.values()) expect(n).toBeGreaterThanOrEqual(3);
    expect(looks.filter((l) => l.bag).length).toBeGreaterThanOrEqual(10);
  });
```

같은 파일의 `같은 시드는 같은 결과를 낸다` 는 `buildGuestLooks(96)` 로. `신랑·신부는 서로 다르고 하객 줄과도 다르다` 는 그대로 유지(98줄 모두 다른 앞모습). 다음 테스트를 추가한다.

```ts
  it("신랑·신부는 하객과 한눈에 구분된다 — 하객 어느 줄보다 흰색·검정 비중이 크거나 소품이 있다", () => {
    const share = (row: number) => {
      const f = frameBytes(row, 0);
      let white = 0, dark = 0, opaque = 0;
      for (let i = 0; i < f.length; i += 4) {
        if (f[i + 3] !== 255) continue;
        opaque++;
        const s = f[i] + f[i + 1] + f[i + 2];
        if (s > 690) white++;
        else if (s < 200) dark++;
      }
      return { white: white / opaque, dark: dark / opaque };
    };
    const bride = share(GUEST_LOOKS + 1);
    const groom = share(GUEST_LOOKS);
    expect(bride.white).toBeGreaterThan(0.2); // 흰 드레스
    expect(groom.dark).toBeGreaterThan(0.15); // 검은 정장
    let guestsWithMoreWhite = 0;
    for (let row = 0; row < GUEST_LOOKS; row++) if (share(row).white >= bride.white) guestsWithMoreWhite++;
    expect(guestsWithMoreWhite).toBe(0);
  });
```

(`GUEST_LOOKS` 는 이미 import 되어 있다.) Run: `npx vitest run tests/unit/villageArt.test.ts` → FAIL (머리 6종, 옷 4종)

- [ ] **Step 2: 엔진에 머리·옷·소품을 추가하고 `buildGuestLooks` 를 쓴다**

`figure.mjs` 에 새 머리·옷·소품을 그린다(Task 2 의 미술 기준을 동일하게 적용). `chargen.mjs`:

```js
const STYLES = ["short", "sidepart", "bob", "long", "ponytail", "bun", "curly", "sporty"];
/** 하객 옷 — 정장(suit)은 신랑 전용이라 넣지 않는다 */
const OUTFITS = ["tee", "shirt", "hoodie", "dress", "cardigan", "jacket"];
const HATS = [0, 0, 0, 0, 0, "cap", "bucket", "flower", "ribbon"];
```

`buildGuestLooks(count)` 는 피부·머리 모양·옷을 번갈아 돌려 골고루 나오게 하고(예: `SKINS[i % 5]`, `STYLES[i % 8]`, `OUTFITS[(i + floor(i / 8)) % 6]`), 색·소품은 시드 난수(`makeRng(20261007)`)로 고르되 분포 규칙을 만족시킨다(안경·가방·모자는 몇 번째 사람에게 줄지 `i` 기반으로 정해 하한을 보장하는 편이 안전하다). 서로 다른 조합만 담는다(중복이면 건너뛴다). 신랑·신부:

```js
export const GROOM_LOOK = { skin: "#f2c29b", hair: "#2a2018", hairStyle: "sidepart", outfit: "suit", top: "#2f3340", pants: "#1e1f26", hat: 0, shoes: "#14141a", accent: "#b03a48", boutonniere: "#f6f3ee" };
export const BRIDE_LOOK = { skin: "#f9d5b8", hair: "#2a2018", hairStyle: "long", outfit: "dress", top: "#f6f3ee", pants: "#f6f3ee", hat: "flower", shoes: "#e8e0d4", veil: "#ffffff", bouquet: "#f4a9b8" };
```

(`boutonniere`·`veil`·`bouquet` 는 `figure.mjs` 가 읽는 새 선택 필드. 신부는 흰색 비중이 모든 하객보다 커야 하므로 하객 옷 색에서 순백에 가까운 색은 신부보다 면적이 작게 유지한다.)

- [ ] **Step 3: 연락표를 눈으로 확인하고 다듬는다 (반복)**

임시 스크립트로 (a) 하객 96종 앞모습 `down_idle` 한 줄에 12명씩 8행 격자(2배 확대), (b) 서로 다른 머리 모양 8종 × 앞·뒤·옆, (c) 옷 6종 × 앞·옆, (d) 신랑·신부 9프레임 4배 확대를 PNG 로 저장해 `Read` 로 열어 본다. 참고 프레임과 비교해 확인한다: ① 서로 다른 사람으로 보이는가(머리·옷·소품) ② 안경·모자·가방·목도리가 제자리에 있고 방향마다 맞는가 ③ 신랑·신부가 한눈에 구분되는가 ④ 96명이 한 화면에 몰려도 단조롭지 않은가. 최소 3바퀴 돌리고, 마지막 연락표 경로와 점검 결과를 보고에 남긴다.

- [ ] **Step 4: PNG 다시 만들고 전체 검사**

Run: `npm run village:art && npx vitest run tests/unit/villageArt.test.ts tests/unit/villageBg.test.ts`
Expected: PASS (시트 500KB 미만 포함. 넘으면 `png.mjs` 의 필터 선택을 개선하거나 팔레트 가짓수를 줄인다 — 하객 종수는 줄이지 않는다)
Run: `npx tsc --noEmit && npx eslint src scripts tests && npx vitest run`
Expected: 모두 성공

- [ ] **Step 5: Commit**

```bash
git add scripts/village-art tests/unit/villageArt.test.ts public/pic/village-sprites.png
git commit -m "feat(guestbook): 하객 96종·머리 8종·옷 6종·소품, 신랑·신부 다듬기

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 세로 꽃길 배경 + 세계 상수 + 신랑·신부 자리

배경을 384×512 세로 꽃길로 다시 그리고, 세계 상수·걷는 영역·신랑·신부 좌표를 맞춘다.

**Files:**
- Modify: `scripts/village-art/garden.mjs` (전체 다시 그리기, `GARDEN_W=384`, `GARDEN_H=512`)
- Modify: `src/lib/villageSim.ts` (`WORLD_H`, `AREA`, 머리말 주석)
- Modify: `src/components/sections/PixelVillage.tsx` (`NPCS` 의 `y`, `BG_SRC` 주석, 도움말 주석의 크기 문구)
- Modify: `tests/unit/villageSim.test.ts`, `tests/unit/villageArt.test.ts`, `tests/unit/villageBg.test.ts`
- Regenerate: `public/pic/village-bg.png`

**Interfaces:**
- Consumes: Task 1 의 `BOX_H = 64`.
- Produces: `WORLD_W=384`, `WORLD_H=512`, `AREA = { x0: 80, x1: 304, y0: 168, y1: 512 }`, `ENTER_Y = WORLD_H + BOX_H`. 신랑 `(172, 136)`, 신부 `(212, 136)`. `drawGarden(): { width: 384, height: 512, rgba }`, `GARDEN_W=384`, `GARDEN_H=512`.

**배경 구성(좌표는 출발점, 눈으로 보고 다듬는다):**
- 잔디 바탕: 기존처럼 큰 얼룩 + 점 잡음 + 풀 포기.
- **단상·아치**(위쪽): 마룻바닥 단상 `x 128~256, y 48~140`, 계단 3단 `y 140~164`(아래로 갈수록 좁아짐은 기존 방식), 꽃 아치(중심 x=192, 둥근 띠 반지름 가로 52·세로 44, 위쪽 y≈26), 기둥 `x 140`·`x 244`, 흰 커튼. 신랑·신부가 서는 발 위치는 `y=136`(단상 위, 아치 아래).
- 단상 양옆 나무 화단 `(72, 100)`·`(264, 100)` 폭 48.
- **길**: 계단 아래 `y 164~512`, `x 120~264`(폭 144) 흙·자갈 길. 바탕 `#e2d3b0` 계열 3~4색, 자갈·작은 돌 점, 가장자리는 줄마다 ±3px 일렁이고 돌과 풀이 번진다.
- **꽃밭**: 길 양옆(`x 0~120`, `x 264~384`, `y 150~512`) 전체를 빽빽하게 — 수국 덤불(파랑·분홍·흰), 라벤더 무더기, 노랑·주황 들꽃, 키 큰 풀. 줄마다 높이가 다른 덤불 덩어리를 14~18px 간격으로 겹쳐서 땅이 보이지 않게 한다.
- 모서리 위쪽 나무 수관 2~3개(기존 `tree` 재사용), 길가 가로등이나 작은 등은 넣지 않는다(YAGNI).
- 하객이 걷는 영역(`x 80~304`)의 양끝은 꽃밭 안쪽이라, 거기 선 캐릭터가 꽃에 묻혀 보이는 것은 정상이다.

- [ ] **Step 1: 테스트를 새 값으로 고치고 실패 확인**

`tests/unit/villageSim.test.ts` 의 세계 테스트를 바꾼다.

```ts
  it("세계는 384×512 이고 걷는 영역은 단상·화단 아래 꽃길(x 80~304, y 168~512)이다", () => {
    expect(WORLD_W).toBe(384);
    expect(WORLD_H).toBe(512);
    expect(AREA).toEqual({ x0: 80, x1: 304, y0: 168, y1: 512 });
  });
```

같은 파일의 `spawnNpc("npc-groom", 172, 112)` 등 NPC 좌표 리터럴은 실제 값과 맞추기 위해 `172, 136` / `212, 136` 으로 모두 바꾼다(`112` → `136`, `toMatchObject` 의 `y` 와 `pickWalkerAt([npc], 172, 112 - BOX_H / 2)` 도 `136 - BOX_H / 2`). `HALF_W` import 가 더 이상 쓰이지 않으면 지운다.

`tests/unit/villageBg.test.ts`: 배경 테스트를 `384×512 PNG 이다 …` / `height: 512` 로, 배경 용량을 `300KB 미만`(`300 * 1024`)으로 바꾼다.

`tests/unit/villageArt.test.ts` 의 정원 `describe`: `384×352` → `384×512`, `GARDEN_H` 기대값 512. 다음 속성 테스트를 같은 `describe` 에 추가한다.

```ts
  it("길 양옆은 꽃으로 빽빽하고 길은 흙색이다", () => {
    const g = drawGarden();
    const px = (x: number, y: number) => {
      const o = (y * g.width + x) * 4;
      return [g.rgba[o], g.rgba[o + 1], g.rgba[o + 2]];
    };
    // 꽃(분홍·흰·보라·노랑·주황…)에 해당하는 색: 빨강이나 파랑이 초록보다 뚜렷하게 크거나 거의 흰색
    const flowerish = ([r, gg, b]: number[]) => r > gg + 10 || b > gg + 10 || (r > 215 && gg > 215 && b > 200);
    let flowers = 0, total = 0;
    for (let y = 200; y < 500; y++) {
      for (const x of [...Array(100).keys(), ...Array.from({ length: 100 }, (_, i) => 284 + i)]) {
        total++;
        if (flowerish(px(x, y))) flowers++;
      }
    }
    expect(flowers / total).toBeGreaterThan(0.2);
    // 길 한가운데(x 150~234)는 거의 흙색(빨강 > 초록 > 파랑, 밝은 베이지)
    let beige = 0, pathTotal = 0;
    for (let y = 200; y < 500; y += 3) {
      for (let x = 150; x < 234; x += 3) {
        pathTotal++;
        const [r, gg, b] = px(x, y);
        if (r > 190 && r >= gg && gg > b) beige++;
      }
    }
    expect(beige / pathTotal).toBeGreaterThan(0.8);
  });
```

Run: `npx vitest run tests/unit/villageSim.test.ts tests/unit/villageArt.test.ts tests/unit/villageBg.test.ts`
Expected: FAIL

- [ ] **Step 2: 상수·좌표를 바꾸고 배경을 새로 그린다**

`src/lib/villageSim.ts`: `WORLD_H = 512`, `AREA = { x0: 80, x1: WORLD_W - 80, y0: 168, y1: WORLD_H }`, 맨 위 주석의 `384×352` → `384×512`, `AREA` 주석을 `단상·화단(위) 아래 꽃길(양끝은 꽃밭 가장자리)` 로. `PixelVillage.tsx`: `NPCS` 의 두 `y: 112` → `y: 136`, `BG_SRC` 위 주석 `384×352` → `384×512`, 하단 도움말 주석 `384px 그림` 은 그대로. `garden.mjs` 는 위 구성대로 `GARDEN_H=512` 에 맞춰 다시 쓴다(`px`·`rect`·`disc`·난수·`parseColor` 도우미는 재사용). 모든 좌표가 새 캔버스 안에 들어가는지 확인한다.

- [ ] **Step 3: 배경을 눈으로 확인하고 다듬는다 (반복)**

`npm run village:art` 후 `public/pic/village-bg.png` 를 `Read` 로 열어 참고 프레임(`f003.png` 등)과 비교한다. 점검: ① 길이 위에서 아래로 곧게 이어지고 가장자리가 자연스러운가 ② 꽃밭이 빽빽하고 색이 다양한가(흰·분홍·보라·노랑·주황) ③ 아치·단상이 위쪽에 있고 신랑·신부 발 위치(`(172,136)`, `(212,136)`)가 단상 바닥 위인가 ④ 하객이 걸을 길 위에 시선을 빼앗는 큰 물체가 없는가. 최소 2바퀴 돌린다. 작업 폴더에서 새 시트의 캐릭터 몇 명을 배경 위 같은 좌표에 합성한 확인용 PNG 도 만들어 크기감(캐릭터 폭이 길 폭의 약 1/4.5)을 본다.

- [ ] **Step 4: 전체 검사**

Run: `npm run village:art && npx tsc --noEmit && npx eslint src scripts tests && npx vitest run`
Expected: 모두 성공

- [ ] **Step 5: Commit**

```bash
git add scripts/village-art/garden.mjs src/lib/villageSim.ts src/components/sections/PixelVillage.tsx tests/unit public/pic/village-bg.png
git commit -m "feat(guestbook): 세로 꽃길 배경(384×512)과 세계·신랑신부 좌표

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 이름표 겹침 숨김 + 흰 테두리 이름표 + 둥근 말풍선

**Files:**
- Create: `src/lib/villageTags.ts`
- Create: `tests/unit/villageTags.test.ts`
- Modify: `src/components/sections/PixelVillage.tsx` (`drawTag` → `tagRect` + `drawTag`, `drawBubble`, `draw` 의 이름표 루프)

**Interfaces:**
- Produces: `export interface TagBox { id: string; x: number; y: number; w: number; h: number; priority: number }`, `export function layoutTags(boxes: readonly TagBox[], gap?: number): Set<string>` — `priority` 가 큰 것부터(같으면 입력 순서) 놓고, 이미 놓인 사각형과 겹치면(사이 `gap` 포함, 기본 0) 빼며, 보이는 이름표의 `id` 집합을 돌려준다. 입력을 바꾸지 않는다.
- 컴포넌트 우선순위: 신랑·신부 `1e9`, 내 캐릭터 `1e8`, 그 외 하객은 발 위치 `w.y`(앞에 있을수록 큼).

- [ ] **Step 1: 실패하는 테스트**

`tests/unit/villageTags.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { layoutTags, type TagBox } from "@/lib/villageTags";

const box = (id: string, x: number, y: number, priority: number, w = 40, h = 12): TagBox => ({ id, x, y, w, h, priority });

describe("layoutTags — 이름표 겹침 숨김", () => {
  it("겹치지 않으면 모두 보인다", () => {
    const shown = layoutTags([box("a", 0, 0, 1), box("b", 50, 0, 1), box("c", 0, 20, 1)]);
    expect([...shown].sort()).toEqual(["a", "b", "c"]);
  });

  it("겹치면 우선순위가 높은 쪽만 보인다 (입력 순서와 무관)", () => {
    expect([...layoutTags([box("low", 0, 0, 1), box("high", 10, 2, 5)])]).toEqual(["high"]);
    expect([...layoutTags([box("high", 10, 2, 5), box("low", 0, 0, 1)])]).toEqual(["high"]);
  });

  it("우선순위가 같으면 입력 순서가 앞선 것이 이긴다", () => {
    expect([...layoutTags([box("first", 0, 0, 1), box("second", 5, 0, 1)])]).toEqual(["first"]);
  });

  it("숨겨진 이름표는 다른 이름표를 막지 않는다 (a 가 b 를 가리고, c 는 b 와만 겹치면 보인다)", () => {
    const shown = layoutTags([box("a", 0, 0, 3), box("b", 30, 0, 2), box("c", 60, 0, 1)]);
    // b(30~70)는 a(0~40)와 겹쳐 숨고, c(60~100)는 숨은 b 와만 겹치므로 보인다
    expect([...shown].sort()).toEqual(["a", "c"]);
  });

  it("맞닿기만 한 것(경계가 같은 것)은 겹침이 아니다", () => {
    const shown = layoutTags([box("a", 0, 0, 1), box("b", 40, 0, 1), box("c", 0, 12, 1)]);
    expect([...shown].sort()).toEqual(["a", "b", "c"]);
  });

  it("gap 을 주면 가까운 것도 겹침으로 본다", () => {
    expect([...layoutTags([box("a", 0, 0, 2), box("b", 41, 0, 1)], 2)]).toEqual(["a"]);
  });

  it("입력 배열을 바꾸지 않고, 빈 입력은 빈 집합이다", () => {
    const input = [box("a", 0, 0, 1), box("b", 5, 0, 9)];
    const copy = JSON.stringify(input);
    layoutTags(input);
    expect(JSON.stringify(input)).toBe(copy);
    expect(layoutTags([]).size).toBe(0);
  });
});
```

Run: `npx vitest run tests/unit/villageTags.test.ts` → FAIL (모듈 없음)

- [ ] **Step 2: `villageTags.ts` 구현**

```ts
/**
 * 이름표 겹침 숨김 — 렌더·DOM 과 무관한 순수 함수.
 * 사람이 몰리면 이름표가 서로 겹쳐 읽을 수 없으므로, 우선순위가 높은 것부터 놓고 이미 놓인 것과 겹치면 뺀다.
 * (숨은 이름표는 누르면 나오는 말풍선 제목으로 볼 수 있다.)
 */
export interface TagBox {
  id: string;
  /** 사각형 왼쪽 위(캔버스 픽셀) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 클수록 먼저 놓는다 */
  priority: number;
}

export function layoutTags(boxes: readonly TagBox[], gap = 0): Set<string> {
  const order = boxes.map((b, i) => ({ b, i })).sort((p, q) => q.b.priority - p.b.priority || p.i - q.i);
  const placed: TagBox[] = [];
  const shown = new Set<string>();
  for (const { b } of order) {
    const hit = placed.some(
      (p) => b.x < p.x + p.w + gap && p.x < b.x + b.w + gap && b.y < p.y + p.h + gap && p.y < b.y + b.h + gap
    );
    if (hit) continue;
    placed.push(b);
    shown.add(b.id);
  }
  return shown;
}
```

Run: `npx vitest run tests/unit/villageTags.test.ts` → PASS

- [ ] **Step 3: 컴포넌트에 연결 — 이름표**

`PixelVillage.tsx` 의 `drawTag` 를 사각형 계산과 그리기로 나눈다.

```ts
/** 이름표 사각형(캔버스 픽셀) — 위치 계산만 한다 */
function tagRect(
  ctx: CanvasRenderingContext2D,
  t: TextMetrics,
  text: string,
  cx: number,
  footY: number,
  tagX?: number,
  align: "left" | "right" | "center" = "center"
): { x: number; y: number; w: number; h: number } {
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
function drawTag(ctx: CanvasRenderingContext2D, t: TextMetrics, text: string, r: { x: number; y: number; w: number; h: number }, color: string): void {
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
```

`draw` 의 이름표 루프는 다음 순서로 바꾼다(`list` 는 이미 `y` 오름차순). 색: 신랑·신부는 `info.tagColor`, 내 캐릭터 `#a8864e`, 그 외 `#3b2d22`(흰 테두리 위에서 읽히는 짙은 갈색). 가독성이 모자라면 눈으로 보고 색·테두리 굵기를 조정한다.

```ts
      const boxes: TagBox[] = [];
      const meta = new Map<string, { text: string; color: string; rect: { x: number; y: number; w: number; h: number } }>();
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
      const shown = layoutTags(boxes);
      for (const w of list) {
        const m = meta.get(w.id);
        if (m && shown.has(w.id)) drawTag(ctx, t, m.text, m.rect, m.color);
      }
```

`import { layoutTags, type TagBox } from "@/lib/villageTags";` 를 추가한다.

- [ ] **Step 4: 컴포넌트에 연결 — 둥근 말풍선**

`drawBubble` 을 흰 둥근 상자 + 꼬리 + 은은한 그림자 + 얇은 테두리로 바꾼다. `ctx.roundRect` 는 구형 Safari 에 없으므로 `arcTo` 로 경로를 만든다.

```ts
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
```

`drawBubble` 의 상자 그리기 부분(테두리 `fillRect` 두 개와 꼬리 삼각형)을 다음으로 바꾼다. 글자 배치·줄바꿈·폭 계산은 그대로다.

```ts
  const radius = Math.round(t.fp * 0.9);
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
```

(삼각형이 테두리 선 위에 겹쳐 이음매가 보이면 꼬리를 `stroke` 로 따로 그리지 말고 눈으로 보고 조정한다.) `border` 는 기존 변수(`Math.max(1, round(ratio))`)를 그대로 쓴다. `x`, `y`, `tailX`, `tail`, `bw`, `bh` 는 기존 값이다. `y` 계산의 `SPRITE_H` 는 이미 상수라 64 를 따른다.

- [ ] **Step 5: 눈으로 확인**

임시 페이지가 아직 없으면 Task 6 의 확인 환경 만들기(Step 1)를 먼저 해서 하객 40명이 있는 화면에서 확인한다. 점검: ① 이름표가 읽히는가(흰 테두리 + 짙은 색) ② 앞사람에 가려진 뒷사람 이름표가 사라지고 신랑·신부 이름표는 항상 보이는가 ③ 말풍선이 둥글고 꼬리가 자연스러우며 이모지가 보이는가 ④ 말풍선이 화면 가장자리에서 잘리지 않는가.

- [ ] **Step 6: 전체 검사 + Commit**

Run: `npx tsc --noEmit && npx eslint src scripts tests && npx vitest run && npm run build`
Expected: 모두 성공

```bash
git add src/lib/villageTags.ts src/components/sections/PixelVillage.tsx tests/unit/villageTags.test.ts
git commit -m "feat(guestbook): 이름표 겹침 숨김·흰 테두리 이름표·둥근 말풍선

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 북적임 확인 · 비교 이미지 · 마무리

코드를 새로 쓰는 일은 적고, **하객이 몰렸을 때 실제로 어떻게 보이고 도는지 확인하고 사용자에게 보여 줄 근거를 만드는 작업**이다.

**Files:**
- Modify (필요할 때만): `src/components/sections/PixelVillage.tsx`, `scripts/village-art/*`
- Modify: `docs/superpowers/specs/2026-10-07-guestbook-village-hd-design.md` (맨 위 상태 줄에 "일부 항목은 `…crowd-design.md` 가 대체" 한 줄), PR #43 본문
- 임시(커밋 안 함): 작업 폴더의 확인 페이지·스크립트·스크린샷

- [ ] **Step 1: 확인 환경 만들기 (저장소 밖)**

작업 폴더(scratchpad)에 임시 git worktree 를 만들어 거기에 `src/app/village-preview/page.tsx`(클라이언트 컴포넌트)를 둔다. 이 페이지는 `?n=` 쿼리 수만큼 가짜 하객(`Celebration` 형: `id`, `name`(한글 2~4자 이름 다양하게 + 영문 몇 개), `kind`, `message`(짧은 것·긴 것·이모지 포함), `review` 등)을 만들어 `<PixelVillage items={…} highlightId={…} />` 를 렌더한다. 앱이 `?key=` 로 접근을 막는 구조면(`src/proxy.ts` 또는 `middleware`) 확인 페이지가 통과하도록 임시 worktree 안에서만 우회한다. `npm run dev -- -p 3000` 으로 띄우고, Playwright(`node_modules/playwright-core`, 이전 세션 스크립트 `scratchpad/lib.cjs`·`perf.cjs`·`common.cjs` 를 참고)로 스크린샷을 찍는다. 저장소의 `.env*` 값이나 키는 출력하지 않는다.

- [ ] **Step 2: 시나리오 확인과 스크린샷**

모바일 폭(390×844, dpr 3)과 데스크톱(1280, dpr 1·2)에서: ① `n=0`(빈 마당) ② `n=12` ③ `n=40` ④ `n=60`. 각각 캔버스 스크린샷을 저장한다. 확인: 캐릭터가 길 위에 모여 북적이는가, 이름표 겹침 숨김이 동작하는가, 신랑·신부 탭 → 말풍선 → 한 번 더 탭 → `#gallery` 스크롤이 되는가, 하객 탭 말풍선이 뜨는가, 콘솔 오류가 없는가, 새 하객이 아래에서 걸어 들어오는가(`n` 을 늘려 추가하는 시나리오가 없으면 페이지에 4초 뒤 하객 1명 추가 로직을 넣는다).

- [ ] **Step 3: 성능 측정**

`n=60`, dpr 2 와 3 에서 5초 동안 초당 그리기 횟수(`requestAnimationFrame`/`drawImage`)와 프레임 시간 평균·최대를 재고, 이전 `n=24` 대비 눈에 띄게 나빠졌는지 판단한다. 수치를 보고에 남긴다. 프레임이 눈에 띄게 떨어지면 `measureText` 결과를 이름·배율별로 캐시하는 등 최소한의 최적화를 한다(그 경우 변경은 이 작업에서 커밋).

- [ ] **Step 4: 비교 이미지 만들기**

참고 프레임 한 장(`f040.png`)과 우리 `n=40` 모바일 스크린샷을 같은 높이로 나란히 놓은 PNG 한 장을 만든다(작업 폴더 `crowd-compare.png`, 저장소에 넣지 않는다). 이 이미지는 사용자에게 보여 주는 용도다.

- [ ] **Step 5: 문서·PR 본문 갱신, 전체 검사, push**

HD 설계 문서 맨 위의 상태 줄 아래에 `> 일부 항목(세계 크기·캐릭터 규격·하객 종수·이름표·말풍선)은 2026-10-07-guestbook-village-crowd-design.md 가 대체한다.` 를 추가한다. PR #43 본문(`gh pr view 43 --json body` 로 읽고 `gh pr edit 43 --body-file …` 로 갱신)에 이번 변경(세로 꽃길·32×64 보통 체형·하객 96종·이름표 겹침 숨김·둥근 말풍선)과 검증 결과, 사람이 배포 미리보기에서 볼 체크리스트(실기기 선명도·북적임·이름표 가독성·말풍선·성능)를 반영한다.

Run: `npm run village:art && git status --short`(재생성했을 때 PNG 가 안 바뀌어야 한다) 그다음 `npx tsc --noEmit && npx eslint src scripts tests && npx vitest run && npm run build`
Expected: 모두 성공, `git status` 깨끗

```bash
git add docs src scripts
git commit -m "docs(guestbook): 북적임 확인 결과 반영·HD 설계 대체 표시

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

push 후 CI 결과(`gh pr checks 43`)를 확인해 보고한다. `main` 이 앞서 있으면 먼저 `git merge origin/main` 으로 따라잡는다(충돌이 나면 사용자 코드를 건드리지 말고 보고한다).
