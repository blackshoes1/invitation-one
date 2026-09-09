import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-09-09 사고: 확정 문자 4건이 전부 실패했다. 솔라피 응답은
 * `"apiKey" length must be 16`. Vercel 환경변수에 붙여넣은 키에 공백·줄바꿈이
 * 섞여 있었던 것이다. 눈으로는 멀쩡해 보여 원인을 찾는 데 한참 걸렸다.
 *
 * 두 가지를 고정한다:
 *  1. 앞뒤 공백은 코드가 걷어낸다 (사람이 못 보는 실수다)
 *  2. 그래도 길이가 틀리면 **발송을 시도하지 않고** 무엇이 틀렸는지 말한다.
 *     하객 수만큼 400 을 맞아 봐야 결과는 같고 원인만 가려진다.
 */
const KEY16 = "NCSABCDEFGH12345"; // 16자

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/sms");
}

const base = {
  SOLAPI_API_KEY: KEY16,
  SOLAPI_API_SECRET: "secret",
  SOLAPI_SENDER: "01000000000",
};

const orig = { ...process.env };
beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  process.env = { ...orig };
});

describe("솔라피 설정 판정", () => {
  it("공백·줄바꿈이 섞여 들어와도 정상으로 본다 — 그 사고의 원인", () => {
    // 붙여넣기 사고를 그대로 재현: 키·시크릿·발신번호 모두 오염
    return load({
      SOLAPI_API_KEY: `  ${KEY16}\n`,
      SOLAPI_API_SECRET: " secret \n",
      SOLAPI_SENDER: "\t01000000000 ",
    }).then((m) => {
      expect(m.smsConfigProblem()).toBeNull();
      expect(m.isSmsConfigured).toBe(true);
    });
  });

  it("공백을 걷어내도 길이가 틀리면 bad_key — 길이만 남기고 키는 안 남긴다", async () => {
    const m = await load({ ...base, SOLAPI_API_KEY: "TOO-SHORT" });
    const problem = m.smsConfigProblem();
    expect(problem).toEqual({ code: "bad_key", length: 9 });
    expect(JSON.stringify(problem)).not.toContain("TOO-SHORT");
  });

  it("키가 틀리면 솔라피를 두드리지 않고 바로 실패시킨다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const m = await load({ ...base, SOLAPI_API_KEY: KEY16 + "X" });
    const r = await m.sendSms("010-0000-0000", "안녕하세요");
    expect(r.ok).toBe(false);
    expect(r.skipped).toBeUndefined(); // '건너뜀'이 아니라 '실패'다
    expect(r.error).toContain("16자여야 하는데 17자");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("아예 미설정이면 예전처럼 건너뛴다 (로컬·미설정 배포)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const m = await load({
      SOLAPI_API_KEY: undefined,
      SOLAPI_API_SECRET: undefined,
      SOLAPI_SENDER: undefined,
    });
    expect(m.smsConfigProblem()).toEqual({ code: "missing" });
    expect(await m.sendSms("010-0000-0000", "hi")).toEqual({ ok: true, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("설정이 정상이면 실제로 발송을 시도한다", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const m = await load(base);
    expect(await m.sendSms("010-0000-0000", "hi")).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
