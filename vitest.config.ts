import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // 외부 서비스(Supabase·SMS·카카오)에 절대 접근하지 않는다 — 순수 로직만.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
