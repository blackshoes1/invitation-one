/**
 * 도트 마당 캐릭터 시트 규격 — 그림 자체는 `public/pic/village-sprites.webp` 한 장에 있다.
 * 사람이 그린(AI) 캐릭터 시트를 `scripts/village-art/ingest.mjs` 가 잘라 붙인 @2x 시트로,
 * 프레임은 80×128(논리 40×64의 2배)이고 줄(= 한 사람) × 열(= 방향·동작)로 늘어서 있다.
 * 규격만 지키면 시트는 언제든 다시 만들어 바꿀 수 있다.
 *
 * 열 순서: 앞(down)·뒤(up)·왼쪽(left)·오른쪽(right) × 정지·걷기1·걷기2 = 12열. 왼쪽·오른쪽은 따로 그려져 있어 반전하지 않는다.
 * 줄 순서: 하객 GUEST_LOOKS 종 → 신랑 → 신부. 하객은 id 해시로 줄을 고르므로 같은 하객은 항상 같은 모습이다.
 */

/** 논리 크기 — 화면에 그리는 캐릭터 크기 */
export const SPRITE_W = 40;
export const SPRITE_H = 64;
/** 발 기준점(스프라이트 아래 끝)에서 머리 꼭대기까지의 대표 높이(논리 px) — 시트 실측 40~55(중앙값 49.5). 말풍선 꼬리 위치에 쓴다 */
export const SPRITE_HEAD_H = 52;

/** 시트는 논리 크기의 2배로 그려 두어, 큰 화면에서도 흐려지지 않고 줄여 그릴 때 보간한다 */
export const SHEET_SCALE = 2;
export const SHEET_FRAME_W = SPRITE_W * SHEET_SCALE;
export const SHEET_FRAME_H = SPRITE_H * SHEET_SCALE;

export const SHEET_SRC = "/pic/village-sprites.webp";

/** down = 앞(아래로 걸을 때), up = 뒤(위로 걸을 때) */
export type SpriteDir = "down" | "up" | "left" | "right";
export type SpriteAnim = "idle" | "walk1" | "walk2";
export type FrameName = `${SpriteDir}_${SpriteAnim}`;

export const SPRITE_DIRS: readonly SpriteDir[] = ["down", "up", "left", "right"];
export const SPRITE_ANIMS: readonly SpriteAnim[] = ["idle", "walk1", "walk2"];
/** 시트의 열 순서와 같다 */
export const FRAME_NAMES: readonly FrameName[] = SPRITE_DIRS.flatMap((d) =>
  SPRITE_ANIMS.map((a): FrameName => `${d}_${a}`)
);

/**
 * 하객 모습 가짓수(시트의 앞쪽 줄) — 하객 시트 4장 × 8명. 신랑·신부는 전용 시트(couple.png)에서 온다.
 * 시트를 다시 만들면 `npm run village:ingest` 가 찍는 `guests N` 으로 맞출 것
 */
export const GUEST_LOOKS = 32;
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
  return {
    sx: FRAME_NAMES.indexOf(frame) * SHEET_FRAME_W,
    sy: row * SHEET_FRAME_H,
    sw: SHEET_FRAME_W,
    sh: SHEET_FRAME_H,
  };
}
