#!/usr/bin/env node
/**
 * DB 복원 — scripts/backup-db.mjs 가 만든 backups/<스탬프>/<테이블>.json 을
 * 기본키 기준 upsert 로 되돌려 넣는다 (기존 행은 덮어쓰고, 없는 행은 추가).
 *
 * 사용법:
 *   npm run restore -- backups/2026-08-20T09-00-00 [table1,table2,...]
 *   (테이블 목록을 생략하면 폴더 안의 모든 json)
 * 필요:    .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * ※ 삭제된 행을 "지우는" 동기화는 하지 않는다 (운영 데이터 보존).
 * ※ FK 순서: groups → deliveries → participants 처럼 부모 테이블을 먼저 넣어야
 *    한다. 아래 ORDER 에 있는 테이블은 그 순서대로, 나머지는 뒤에 처리한다.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}
const [dirArg, tablesArg] = process.argv.slice(2);
if (!dirArg) {
  console.error("사용법: npm run restore -- backups/<스탬프> [table1,table2]");
  process.exit(1);
}
const dir = path.resolve(root, dirArg);
const ORDER = ["rsvp", "groups", "group_members", "deliveries", "participants", "seating_tables", "checkins"];
const all = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const want = tablesArg ? tablesArg.split(",").map((s) => s.trim()) : all;
const tables = [...ORDER.filter((t) => want.includes(t)), ...want.filter((t) => !ORDER.includes(t))];

const supabase = createClient(url, key);
for (const t of tables) {
  const file = path.join(dir, `${t}.json`);
  if (!fs.existsSync(file)) { console.warn(`⚠️  ${t}: 파일 없음, 건너뜀`); continue; }
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows) || rows.length === 0) { console.log(`·  ${t}: 0행`); continue; }
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(t).upsert(rows.slice(i, i + 200));
    if (error) { console.error(`❌ ${t}: ${error.message}`); process.exit(1); }
    done += Math.min(200, rows.length - i);
  }
  console.log(`✅ ${t}: ${done}행 upsert`);
}
console.log("완료");
