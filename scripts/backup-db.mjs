#!/usr/bin/env node
/**
 * 전체 DB 백업 — 모든 테이블을 backups/<날짜시각>/<테이블>.json 으로 덤프.
 *
 * 사용법:  npm run backup
 * 필요:    .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * ※ Storage 파일(사진 원본)은 포함하지 않음 — guest-photos 는 NAS Cloud Sync
 *   (docs/NAS_SYNC.md), invitation-media(갤러리/앨범)는 필요 시 Supabase
 *   대시보드 → Storage 에서 수동 다운로드.
 * ※ 새 테이블을 만들면 아래 TABLES 에 추가할 것.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// .env.local 간단 파싱 (dotenv 의존성 없이)
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

const TABLES = [
  "rsvp",
  "deliveries",
  "participants",
  "groups",
  "group_members",
  "group_attendance",
  "waiting_list",
  "blocked_dates",
  "site_settings",
  "guest_photos",
  "checkins",
  "seating_tables",
  "notification_outbox", // P1-3 카카오 알림 아웃박스 (발송 이력)
  // rate_limits · admin_sessions 는 휘발성(제한 창·세션) — 백업 대상 아님
];

const supabase = createClient(url, key);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = path.join(root, "backups", stamp);
fs.mkdirSync(dir, { recursive: true });

let total = 0;
let failed = 0;
for (const table of TABLES) {
  // 1000행 페이지네이션 (기본 반환 상한 대비)
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) {
      console.error(`❌ ${table}: ${error.message}`);
      failed++;
      break;
    }
    rows.push(...data);
    if (data.length < 1000) {
      fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
      console.log(`✅ ${table}: ${rows.length}행`);
      total += rows.length;
      break;
    }
  }
}

console.log(`\n${failed === 0 ? "🎉" : "⚠️"} 백업 ${failed === 0 ? "완료" : `일부 실패(${failed}개 테이블)`} — 총 ${total}행 → ${path.relative(root, dir)}/`);
process.exit(failed === 0 ? 0 : 1);
