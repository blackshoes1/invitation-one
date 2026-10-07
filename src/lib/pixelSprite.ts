/**
 * 도트 마당 캐릭터 시트 규격 — 그림 자체는 `public/pic/village-sprites.png` 한 장에 있다.
 * 시트는 32×64 프레임을 줄(= 한 사람) × 열(= 방향·동작)로 늘어놓은 것이고,
 * 생성 스크립트(scripts/village-art/)가 만든다. 나중에 사람이 그린 시트로 바꿔도 이 규격만 지키면 된다.
 *
 * 열 순서: 앞(down)·뒤(up)·옆(side, 오른쪽을 봄) × 정지·걷기1·걷기2. 왼쪽은 그릴 때 옆모습을 좌우 반전한다.
 * 줄 순서: 하객 GUEST_LOOKS 종 → 신랑 → 신부. 하객은 id 해시로 줄을 고르므로 같은 하객은 항상 같은 모습이다.
 */

export const SPRITE_W = 32;
export const SPRITE_H = 64;

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
export const GUEST_LOOKS = 96;
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
