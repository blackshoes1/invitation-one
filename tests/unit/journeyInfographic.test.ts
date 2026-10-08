import { describe, expect, it } from "vitest";
import type { Celebration } from "@/lib/supabase";
import { KOREA_VIEW } from "@/lib/koreaGeo";
import {
  OTHER_KEY,
  VIEW,
  MAX_SHIFT,
  bubbleRadius,
  cardStats,
  groupByRegion,
  journeyKeys,
  layoutBubbles,
  nameList,
  placeLabel,
  topKeys,
  type BubbleItem,
} from "@/lib/journeyInfographic";

let seq = 0;
function mk(p: Partial<Celebration> & Pick<Celebration, "kind">): Celebration {
  seq += 1;
  return {
    id: p.id ?? `c${seq}`,
    kind: p.kind,
    name: p.name ?? `하객${seq}`,
    area: p.area ?? null,
    date: p.date ?? null,
    stamp: p.stamp ?? null,
    message: null,
    rating: null,
    review: null,
    reply: null,
    replied_at: null,
    created_at: p.created_at ?? `2026-09-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
  };
}
const direct = (area: string | null, extra: Partial<Celebration> = {}) =>
  mk({ kind: "직접배달", area, ...extra });
const heart = (area: string | null, extra: Partial<Celebration> = {}) =>
  mk({ kind: "마음배송", area, ...extra });

describe("groupByRegion — 시/도 단위 집계", () => {
  it("같은 시/도의 다른 시군구는 한 버블로 합치고 직접/마음을 나눠 센다", () => {
    const g = groupByRegion(
      [direct("서울 강동구"), heart("서울 강남구"), heart("서울 강남구")],
      "all",
    );
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe("서울");
    expect(g[0].direct).toHaveLength(1);
    expect(g[0].heart).toHaveLength(2);
    expect(g[0].total).toBe(3);
  });

  it("자유입력 '경주' 는 경북으로, '서울시' 도 서울로 묶는다", () => {
    const g = groupByRegion([heart("경주"), heart("경북 포항시"), heart("서울시")], "all");
    const byKey = Object.fromEntries(g.map((x) => [x.key, x.total]));
    expect(byKey["경북"]).toBe(2);
    expect(byKey["서울"]).toBe(1);
  });

  it("해외·좌표 없는 지역·빈 지역은 '해외·기타' 한 버블로 모은다", () => {
    const g = groupByRegion([heart("해외 프랑스"), heart("어딘가"), heart(null), direct("  ")], "all");
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe(OTHER_KEY);
    expect(g[0].total).toBe(4);
  });

  it("버블 기준 좌표는 시/도 중심이고 해외·기타는 지도 왼쪽 아래다", () => {
    const g = groupByRegion([heart("서울"), heart("해외")], "all");
    const seoul = g.find((x) => x.key === "서울")!;
    const other = g.find((x) => x.key === OTHER_KEY)!;
    expect(seoul.x).toBeCloseTo(42.6);
    expect(seoul.y).toBeCloseTo(30);
    expect(other.x).toBeLessThan(KOREA_VIEW.w / 2);
    expect(other.y).toBeGreaterThan(KOREA_VIEW.h * 0.8);
  });

  it("개수 내림차순, 같으면 지역명 오름차순으로 안정 정렬한다", () => {
    const g = groupByRegion(
      [heart("부산"), heart("대구"), heart("광주"), heart("서울"), heart("서울")],
      "all",
    );
    expect(g.map((x) => x.key)).toEqual(["서울", "광주", "대구", "부산"]);
  });
});

describe("필터와 카드 수치", () => {
  const data = [
    direct("서울 강남구"),
    direct("부산 해운대구"),
    heart("서울 마포구"),
    heart("서울 마포구"),
    heart("제주 제주시"),
    heart("해외 일본"),
  ];

  it("필터에 맞는 종류만 센다", () => {
    const onlyDirect = groupByRegion(data, "직접배달");
    expect(onlyDirect.map((x) => [x.key, x.total])).toEqual([
      ["부산", 1],
      ["서울", 1],
    ]);
    const onlyHeart = groupByRegion(data, "마음배송");
    expect(onlyHeart.find((x) => x.key === "서울")!.total).toBe(2);
    expect(onlyHeart.find((x) => x.key === "부산")).toBeUndefined();
    expect(onlyHeart.every((x) => x.direct.length === 0)).toBe(true);
  });

  it("카드 수치는 필터와 무관하게 전체 기준이다", () => {
    expect(cardStats(data)).toEqual({ directCount: 2, heartCount: 4, areaCount: 4 });
  });

  it("빈 목록이면 모두 0", () => {
    expect(cardStats([])).toEqual({ directCount: 0, heartCount: 0, areaCount: 0 });
    expect(groupByRegion([], "all")).toEqual([]);
  });
});

describe("bubbleRadius", () => {
  it("인원이 늘수록 커지고(단조) 최소 < 최대다", () => {
    const max = 34;
    let prev = 0;
    for (let n = 1; n <= max; n++) {
      const r = bubbleRadius(n, max);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    expect(bubbleRadius(1, max)).toBeLessThan(bubbleRadius(max, max));
  });

  it("0명 지역에는 버블이 없다(반지름 0)", () => {
    expect(bubbleRadius(0, 10)).toBe(0);
  });

  it("면적(r²)이 인원에 거의 비례하는 sqrt 스케일이다 — 큰 값이 압도하지 않는다", () => {
    const r4 = bubbleRadius(4, 40);
    const r16 = bubbleRadius(16, 40);
    expect(r16 / r4).toBeLessThan(2); // 인원 4배 → 반지름 2배 미만(최소 반지름 바닥 때문)
    expect(r16).toBeGreaterThan(r4);
  });
});

describe("topKeys — 상위 3개 지역", () => {
  it("개수 상위 3개, 동점은 지역명 오름차순", () => {
    const g = groupByRegion(
      [
        ...Array(5).fill(0).map(() => heart("서울")),
        ...Array(3).fill(0).map(() => heart("부산")),
        ...Array(3).fill(0).map(() => heart("대구")),
        ...Array(3).fill(0).map(() => heart("광주")),
        heart("제주"),
      ],
      "all",
    );
    expect(topKeys(g)).toEqual(["서울", "광주", "대구"]);
  });

  it("해외·기타는 지역이 아니므로 순위에서 뺀다", () => {
    const g = groupByRegion([heart("해외"), heart("해외"), heart("해외"), heart("서울")], "all");
    expect(topKeys(g)).toEqual(["서울"]);
  });

  it("지역이 3개 미만이면 있는 만큼만", () => {
    expect(topKeys(groupByRegion([heart("서울")], "all"))).toEqual(["서울"]);
    expect(topKeys([])).toEqual([]);
  });
});

describe("layoutBubbles — 겹침 해소", () => {
  // 서울·인천·경기가 겹치는 현실적인 쏠림 샘플
  const sample = (): BubbleItem[] => {
    const cel = [
      ...Array(18).fill(0).map(() => heart("서울")),
      ...Array(12).fill(0).map(() => heart("경기")),
      ...Array(7).fill(0).map(() => heart("인천")),
      ...Array(9).fill(0).map(() => heart("부산")),
      ...Array(6).fill(0).map(() => heart("대구")),
      heart("대전"),
      heart("세종"),
      heart("충북"),
      heart("충남"),
      heart("해외"),
    ];
    const g = groupByRegion(cel, "all");
    const max = Math.max(...g.map((x) => x.total));
    return g.map((x) => ({ key: x.key, x: x.x, y: x.y, r: bubbleRadius(x.total, max) }));
  };

  const gapOf = (a: BubbleItem, b: BubbleItem) => Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r);

  it("처리 전에는 겹치고 처리 후에는 서로 겹치지 않는다(허용오차 이내)", () => {
    const input = sample();
    let before = 0;
    for (let i = 0; i < input.length; i++)
      for (let j = i + 1; j < input.length; j++) if (gapOf(input[i], input[j]) < 0) before++;
    expect(before).toBeGreaterThan(0);

    const out = layoutBubbles(input);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++)
        expect(gapOf(out[i], out[j])).toBeGreaterThan(-0.05);
  });

  it("모든 버블이 viewBox 안에 있다", () => {
    for (const b of layoutBubbles(sample())) {
      expect(b.x - b.r).toBeGreaterThanOrEqual(-1e-9);
      expect(b.y - b.r).toBeGreaterThanOrEqual(-1e-9);
      expect(b.x + b.r).toBeLessThanOrEqual(VIEW.w + 1e-9);
      expect(b.y + b.r).toBeLessThanOrEqual(VIEW.h + 1e-9);
    }
  });

  it("원위치에서 최대 이동 거리를 넘지 않는다", () => {
    const input = sample();
    const out = layoutBubbles(input);
    out.forEach((b, i) => {
      expect(Math.hypot(b.x - input[i].x, b.y - input[i].y)).toBeLessThanOrEqual(MAX_SHIFT + 1e-9);
    });
  });

  it("큰 버블이 작은 버블보다 덜 움직인다", () => {
    // 서울(큰 것)·인천(작은 것)만 둔 단순한 겹침 — 샌드위치 구조의 연쇄 이동과 섞이지 않게
    const input: BubbleItem[] = [
      { key: "서울", x: 42.6, y: 30, r: 9 },
      { key: "인천", x: 34.7, y: 32.2, r: 4 },
    ];
    const out = layoutBubbles(input);
    const move = (i: number) => Math.hypot(out[i].x - input[i].x, out[i].y - input[i].y);
    expect(move(0)).toBeLessThan(move(1));
    // 이동량 비는 반지름 반비례(큰 쪽 4/13, 작은 쪽 9/13)
    expect(move(1) / move(0)).toBeCloseTo(9 / 4, 1);
  });

  it("같은 입력이면 같은 출력이고, 입력 배열·객체는 바뀌지 않는다", () => {
    const input = sample();
    const snapshot = JSON.stringify(input);
    const a = layoutBubbles(input);
    const b = layoutBubbles(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(a).toEqual(b);
    expect(a).not.toBe(input);
    expect(a.map((x) => x.key)).toEqual(input.map((x) => x.key));
  });

  it("겹치지 않는 입력은 그대로 둔다", () => {
    const input: BubbleItem[] = [
      { key: "a", x: 20, y: 20, r: 4 },
      { key: "b", x: 70, y: 100, r: 5 },
    ];
    expect(layoutBubbles(input)).toEqual(input);
  });

  it("완전히 같은 자리에 있어도 갈라진다(0 거리 처리)", () => {
    const out = layoutBubbles([
      { key: "a", x: 50, y: 50, r: 5 },
      { key: "b", x: 50, y: 50, r: 5 },
    ]);
    expect(Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y)).toBeGreaterThan(9.9);
  });
});

describe("journeyKeys — 여정 점선 지점", () => {
  it("직접 만난 분을 날짜순으로 잇는다", () => {
    const keys = journeyKeys([
      direct("부산", { date: "2026-10-03" }),
      direct("서울", { date: "2026-09-12" }),
      direct("대구", { date: "2026-09-20" }),
    ]);
    expect(keys).toEqual(["서울", "대구", "부산"]);
  });

  it("날짜가 없으면 created_at 으로 순서를 정한다", () => {
    const keys = journeyKeys([
      direct("부산", { date: null, created_at: "2026-09-25T10:00:00Z" }),
      direct("서울", { date: "2026-09-12" }),
      direct("대구", { date: null, created_at: "2026-09-18T10:00:00Z" }),
    ]);
    expect(keys).toEqual(["서울", "대구", "부산"]);
  });

  it("연속으로 같은 지역이면 합치고, 떨어져 있으면 다시 지난다", () => {
    const keys = journeyKeys([
      direct("서울 강남구", { date: "2026-09-01" }),
      direct("서울 마포구", { date: "2026-09-02" }),
      direct("부산", { date: "2026-09-03" }),
      direct("서울", { date: "2026-09-04" }),
    ]);
    expect(keys).toEqual(["서울", "부산", "서울"]);
  });

  it("서로 다른 지역이 2개 미만이면 빈 배열", () => {
    expect(journeyKeys([])).toEqual([]);
    expect(journeyKeys([direct("서울", { date: "2026-09-01" })])).toEqual([]);
    expect(
      journeyKeys([
        direct("서울 강남구", { date: "2026-09-01" }),
        direct("서울 마포구", { date: "2026-09-02" }),
      ]),
    ).toEqual([]);
  });

  it("마음배송은 여정에 넣지 않는다", () => {
    const keys = journeyKeys([
      direct("서울", { date: "2026-09-01" }),
      heart("부산", { date: "2026-09-02" }),
      direct("대구", { date: "2026-09-03" }),
    ]);
    expect(keys).toEqual(["서울", "대구"]);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const input = [direct("부산", { date: "2026-10-03" }), direct("서울", { date: "2026-09-12" })];
    const copy = [...input];
    journeyKeys(input);
    expect(input).toEqual(copy);
  });
});

describe("nameList — 말풍선 이름 목록", () => {
  it("6명까지 보여주고 나머지는 외 N명", () => {
    const entries = Array.from({ length: 9 }, (_, i) => heart("서울", { name: `이름${i}` }));
    const r = nameList(entries);
    expect(r.lines).toHaveLength(6);
    expect(r.more).toBe(3);
    expect(r.lines[0]).toBe("💌 이름0님");
  });

  it("6명 이하이면 more 는 0", () => {
    const r = nameList([direct("서울", { name: "철수" }), heart("서울", { name: "영희", stamp: "🌸" })]);
    expect(r).toEqual({ lines: ["철수님", "🌸 영희님"], more: 0 });
  });

  it("빈 이름은 건너뛰고 개수에도 넣지 않는다", () => {
    const r = nameList([heart("서울", { name: "" }), heart("서울", { name: "   " }), heart("서울", { name: "민수" })]);
    expect(r.lines).toEqual(["💌 민수님"]);
    expect(r.more).toBe(0);
  });
});

describe("placeLabel — 지역명 라벨 위치", () => {
  it("이웃 버블이 바로 아래에 붙어 있으면 다른 쪽에 놓는다", () => {
    const a: BubbleItem = { key: "서울", x: 40, y: 30, r: 8 };
    const below: BubbleItem = { key: "경기", x: 44, y: 44, r: 7 };
    const p = placeLabel(a, [a, below], "서울");
    expect(p.y).toBeLessThan(a.y + a.r); // 아래(y+r+3)가 아님
  });

  it("방해물이 없으면 기본 자리(아래 가운데)", () => {
    const a: BubbleItem = { key: "부산", x: 80, y: 90, r: 5 };
    expect(placeLabel(a, [a], "부산")).toEqual({ x: 80, y: 98, anchor: "middle" });
  });
});
