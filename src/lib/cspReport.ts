/**
 * CSP 위반 보고 정제 (문제 5) — 서버 로그에 토큰이 남지 않게.
 *
 * 보고에 실리는 `document-uri` 는 **위반이 일어난 페이지의 전체 URL** 이다.
 * 이 사이트에서 그 URL 들은 이런 모양이다:
 *
 *   /delivery/manage/1a2b…            ← 관리 토큰. 가진 사람이 곧 주인이다
 *   /delivery?i=ffff…                 ← 개인 초대 토큰
 *   /delivery/group/abcd?i=ffff…      ← 그룹 + 초대 토큰
 *
 * 즉 있는 그대로 찍으면 **관리 링크가 서버 로그(Vercel Runtime Logs)에 평문으로
 * 쌓인다.** 로그를 볼 수 있는 사람이 아무 하객의 주문을 취소·변경할 수 있다는 뜻이다.
 *
 * 그래서 경로를 고정된 라우트 템플릿으로 바꾸고 쿼리·fragment 를 통째로 버린다.
 * 진단에 필요한 것(어떤 지시어를 어떤 출처가 위반했는가)은 그대로 남긴다.
 */
import { siteOrigin } from "@/lib/siteUrl";

/** 토큰이 경로에 들어가는 라우트 — 세그먼트를 자리표시자로 바꾼다 */
const TOKEN_ROUTES: { re: RegExp; to: string }[] = [
  { re: /^\/delivery\/manage\/[^/]+/, to: "/delivery/manage/:token" },
  { re: /^\/delivery\/recover\/[^/]+/, to: "/delivery/recover/:token" },
  { re: /^\/delivery\/group\/[^/]+/, to: "/delivery/group/:slug" },
  { re: /^\/checkin\/[^/]+/, to: "/checkin/:key" },
];

/**
 * URL → 진단용 축약형.
 * - 쿼리·fragment 제거 (초대 토큰 `?i=`, 복구 토큰 등이 여기 산다)
 * - 토큰 경로는 라우트 템플릿으로
 * - 외부 출처는 **origin 까지만** (경로에 무엇이 들어 있을지 모른다)
 * - 파싱 실패면 원문을 남기지 않는다 — 임의 문자열이 그대로 로그에 들어가는 게
 *   정확히 막으려는 것이다
 */
/** 우리 사이트인가 — 아니면 경로를 남기지 않는다 (미리보기 배포는 외부로 취급) */
function isOwnHost(host: string): boolean {
  if (host === "x.invalid") return true; // 상대 경로였다는 뜻
  try {
    if (host === new URL(siteOrigin()).host) return true;
  } catch {
    /* env 가 이상하면 아래 기본값으로 */
  }
  return /(^|\.)kkachi\.vercel\.app$/.test(host) || /^localhost(:\d+)?$/.test(host);
}

export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || v === "") return undefined;
  // CSP 는 URL 이 아닌 키워드도 보낸다 — 이건 그대로 두는 게 진단에 유용하다
  if (/^(inline|eval|data|blob|self|wasm-eval|wasm-unsafe-eval)$/.test(v)) return v;
  try {
    // 상대 경로도 받도록 base 를 준다 (base 호스트는 결과에 쓰지 않는다)
    const u = new URL(v, "https://x.invalid");
    if (!isOwnHost(u.host)) return u.origin; // 외부 출처 — 경로는 남기지 않는다
    for (const { re, to } of TOKEN_ROUTES)
      if (re.test(u.pathname)) return to;
    return u.pathname; // 쿼리·fragment 는 버린다
  } catch {
    // 파싱 실패 — 원문 fallback 을 남기지 않는다
    return "(unparseable)";
  }
}

/** 로그로 남길 필드만 뽑는다 (allowlist). script sample 은 기록하지 않는다. */
export function sanitizeCspReport(body: unknown): {
  directive?: string;
  blocked?: string;
  doc?: string;
  disposition?: string;
  status?: number;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) if (b[k] != null) return b[k];
    return undefined;
  };
  const directive = pick("violated-directive", "effectiveDirective", "effective-directive");
  const disposition = pick("disposition");
  const status = pick("status-code", "statusCode");
  return {
    // 지시어 이름은 열거형에 가깝지만 외부 입력이므로 길이를 제한한다
    directive: typeof directive === "string" ? directive.slice(0, 80) : undefined,
    blocked: safeUrl(pick("blocked-uri", "blockedURL")),
    doc: safeUrl(pick("document-uri", "documentURL")),
    disposition: typeof disposition === "string" ? disposition.slice(0, 20) : undefined,
    status: typeof status === "number" ? status : undefined,
    // ⚠️ script-sample / sample 은 일부러 뺐다 — 페이지의 스크립트 조각이 그대로
    //    들어오며, 인라인 스크립트에 토큰이나 하객 정보가 실릴 수 있다.
  };
}
