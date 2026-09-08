import { NextResponse } from "next/server";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { sanitizeCspReport } from "@/lib/cspReport";

/**
 * CSP 위반 보고 수신 (P2-2, Report-Only 관찰용).
 * 브라우저가 보내는 report-uri(application/csp-report) / report-to(application/reports+json)
 * 둘 다 받아 서버 로그(Vercel Runtime Logs)에 요약만 남긴다. 저장 없음.
 *
 * ⚠️ `document-uri` 는 위반이 일어난 **페이지의 전체 URL** 이라 그대로 찍으면
 * `/delivery/manage/<관리토큰>` 이나 `?i=<초대토큰>` 이 로그에 평문으로 쌓인다.
 * 관리 토큰은 가진 사람이 곧 주인이므로 이건 사실상 권한 유출이다.
 * 정제는 src/lib/cspReport.ts 가 한다 — 여기서 원문을 만지지 말 것.
 */
export async function POST(req: Request) {
  if (!(await rateLimitAllow(`csp:${clientIp(req)}`, 60, 600)))
    return new NextResponse(null, { status: 429 });
  try {
    const text = (await req.text()).slice(0, 8000);
    const j = JSON.parse(text) as unknown;
    const reports: unknown[] = Array.isArray(j) ? j : [j];
    for (const r of reports) {
      const body =
        (r as { "csp-report"?: unknown })["csp-report"] ??
        (r as { body?: unknown }).body ??
        r;
      console.warn("[csp-report]", sanitizeCspReport(body));
    }
  } catch {
    /* 형식 오류 무시 */
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
