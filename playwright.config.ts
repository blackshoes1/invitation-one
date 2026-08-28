import { defineConfig } from "@playwright/test";

/**
 * E2E (P1-5).
 *
 * 실행 전 반드시 같은 env 로 빌드가 있어야 한다 (NEXT_PUBLIC_* 는 빌드 타임 상수):
 *   NEXT_PUBLIC_INVITATION_KEY=<키> npm run build && npm run test:e2e
 * CI 에서는 build 스텝의 ci-dummy-key 를 그대로 사용한다.
 *
 * 외부 서비스(운영 Supabase·카카오·SMS)에는 접근하지 않는다 —
 * 기본 프로필은 Supabase 미설정(데모 분기·server_not_configured)으로 돌고,
 * DB 가 필요한 시나리오는 E2E_DB=1 + 로컬 Supabase 가 있을 때만 실행된다.
 */
const PORT = Number(process.env.E2E_PORT ?? 3199);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/delivery`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // 서버 컴포넌트는 런타임에도 이 값을 읽는다 — 빌드에 쓴 값과 동일해야 함
      NEXT_PUBLIC_INVITATION_KEY:
        process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key",
      NEXT_PUBLIC_SITE_URL:
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.invalid",
    },
  },
});
