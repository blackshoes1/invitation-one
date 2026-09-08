import { describe, it, expect } from "vitest";
import { safeUrl, sanitizeCspReport } from "@/lib/cspReport";

/**
 * 문제 5 — CSP 보고가 서버 로그에 토큰을 남기지 않는다.
 *
 * `document-uri` 는 위반이 일어난 **페이지의 전체 URL** 이라, 정제하지 않으면
 * `/delivery/manage/<관리토큰>` 이 Vercel Runtime Logs 에 평문으로 쌓인다.
 * 관리 토큰은 가진 사람이 곧 주인이므로 사실상 권한 유출이다.
 */
const MANAGE = "0123456789abcdef0123456789abcdef";
const INVITE = "ffffffffffffffffffffffffffffffff";

describe("safeUrl", () => {
  it("관리 토큰 경로를 라우트 템플릿으로 바꾼다", () => {
    const s = safeUrl(`https://kkachi.vercel.app/delivery/manage/${MANAGE}`);
    expect(s).toBe("/delivery/manage/:token");
    expect(s).not.toContain(MANAGE);
  });

  it("개인 초대 토큰(쿼리)을 통째로 버린다", () => {
    const s = safeUrl(`https://kkachi.vercel.app/delivery?i=${INVITE}&x=1`);
    expect(s).toBe("/delivery");
    expect(s).not.toContain(INVITE);
  });

  it("그룹 slug + 초대 토큰도 남기지 않는다", () => {
    const s = safeUrl(`https://kkachi.vercel.app/delivery/group/abcd12?i=${INVITE}`);
    expect(s).toBe("/delivery/group/:slug");
    expect(s).not.toContain(INVITE);
  });

  it("복구 토큰 경로도 자리표시자로", () => {
    expect(safeUrl(`/delivery/recover/${MANAGE}`)).toBe("/delivery/recover/:token");
  });

  it("fragment 는 남지 않는다", () => {
    expect(safeUrl(`https://kkachi.vercel.app/delivery#t=${MANAGE}`)).toBe("/delivery");
  });

  it("외부 출처는 origin 까지만 (경로에 뭐가 있을지 모른다)", () => {
    expect(safeUrl("https://evil.example.com/a/b?token=zzz")).toBe(
      "https://evil.example.com"
    );
  });

  it("CSP 키워드는 진단에 필요하므로 그대로 둔다", () => {
    expect(safeUrl("inline")).toBe("inline");
    expect(safeUrl("eval")).toBe("eval");
  });

  it("파싱 못 하는 값은 원문 fallback 을 남기지 않는다", () => {
    // 원문을 그대로 찍는 것이 정확히 막으려는 것이다
    const s = safeUrl("http://[not a url");
    expect(s).toBe("(unparseable)");
    expect(s).not.toContain("not a url");
  });

  it("빈 값·비문자열은 undefined", () => {
    expect(safeUrl("")).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl(123)).toBeUndefined();
  });
});

describe("sanitizeCspReport", () => {
  it("script sample 은 기록하지 않는다", () => {
    const out = sanitizeCspReport({
      "violated-directive": "script-src-elem",
      "script-sample": `var t='${MANAGE}'`,
      sample: "secret",
      "document-uri": `https://kkachi.vercel.app/delivery/manage/${MANAGE}`,
    });
    expect(JSON.stringify(out)).not.toContain(MANAGE);
    expect(JSON.stringify(out)).not.toContain("secret");
    expect("sample" in out).toBe(false);
  });

  it("진단 정보(위반 지시어·차단 출처)는 유지한다", () => {
    const out = sanitizeCspReport({
      "violated-directive": "img-src",
      "blocked-uri": "https://cdn.example.com/a.png",
      "document-uri": "https://kkachi.vercel.app/delivery",
      disposition: "report",
      "status-code": 200,
    });
    expect(out.directive).toBe("img-src");
    expect(out.blocked).toBe("https://cdn.example.com");
    expect(out.doc).toBe("/delivery");
    expect(out.disposition).toBe("report");
    expect(out.status).toBe(200);
  });

  it("report-to(camelCase) 형식도 같은 규칙을 받는다", () => {
    const out = sanitizeCspReport({
      effectiveDirective: "connect-src",
      blockedURL: "https://x.example.com/p?k=1",
      documentURL: `https://kkachi.vercel.app/delivery/manage/${MANAGE}`,
    });
    expect(out.directive).toBe("connect-src");
    expect(out.doc).toBe("/delivery/manage/:token");
    expect(JSON.stringify(out)).not.toContain(MANAGE);
  });

  it("지시어에 긴 임의 문자열이 와도 잘라 낸다", () => {
    const out = sanitizeCspReport({ "violated-directive": "x".repeat(500) });
    expect(out.directive!.length).toBe(80);
  });

  it("빈 보고도 던지지 않는다", () => {
    expect(sanitizeCspReport(null)).toEqual({
      directive: undefined,
      blocked: undefined,
      doc: undefined,
      disposition: undefined,
      status: undefined,
    });
  });
});
