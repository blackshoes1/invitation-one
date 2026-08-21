import { describe, it, expect } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csvEscape", () => {
  it("일반 값은 그대로, null/undefined 는 빈 문자열", () => {
    expect(csvEscape("홍길동")).toBe("홍길동");
    expect(csvEscape(3)).toBe("3");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("쉼표·따옴표·개행 → 따옴표로 감싸고 내부 따옴표 이중화", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("l1\nl2")).toBe('"l1\nl2"');
  });
  it("수식 인젝션 방어 — =,+,-,@,탭,CR 시작은 ' 접두", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+82")).toBe("'+82");
    expect(csvEscape("-1")).toBe("'-1");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("\tx")).toBe("'\tx");
    expect(csvEscape("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
  });
});

describe("toCsv", () => {
  it("BOM + CRLF + 헤더/행", () => {
    const out = toCsv(["a", "b"], [["1", "x,y"], [null, "=z"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('a,b\r\n1,"x,y"\r\n,\'=z');
  });
});
