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
