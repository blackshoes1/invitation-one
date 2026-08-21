import { NextResponse } from "next/server";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";

/**
 * CSP 위반 보고 수신 (P2-2, Report-Only 관찰용).
 * 브라우저가 보내는 report-uri(application/csp-report) / report-to(application/reports+json)
 * 둘 다 받아 서버 로그(Vercel Runtime Logs)에 요약만 남긴다. 저장·PII 없음.
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
      const b = body as Record<string, unknown>;
      console.warn("[csp-report]", {
        directive: b["violated-directive"] ?? b.effectiveDirective ?? b["effective-directive"],
        blocked: b["blocked-uri"] ?? b.blockedURL,
        doc: b["document-uri"] ?? b.documentURL,
        sample: b["script-sample"] ?? b.sample,
      });
    }
  } catch {
    /* 형식 오류 무시 */
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
