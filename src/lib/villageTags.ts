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
