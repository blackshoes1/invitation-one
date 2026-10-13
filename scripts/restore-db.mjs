#!/usr/bin/env node
/**
 * DB 복원 — scripts/backup-db.mjs 가 만든 backups/<스탬프>/<테이블>.json.enc 을
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
import { backupKey, decryptBackup } from "./backup-crypto.mjs";
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
const encryptionKey = backupKey(process.env.BACKUP_ENCRYPTION_KEY ?? env.BACKUP_ENCRYPTION_KEY);
const [dirArg, tablesArg] = process.argv.slice(2);
if (!dirArg) {
  console.error("사용법: npm run restore -- backups/<스탬프> [table1,table2]");
  process.exit(1);
}
const dir = path.resolve(root, dirArg);
const ORDER = ["rsvp", "groups", "group_members", "group_attendance", "deliveries", "participants", "seating_tables", "checkins"];
const all = fs.readdirSync(dir).filter((f) => f.endsWith(".json.enc")).map((f) => f.replace(/\.json\.enc$/, ""));
const want = tablesArg ? tablesArg.split(",").map((s) => s.trim()) : all;
const tables = [...ORDER.filter((t) => want.includes(t)), ...want.filter((t) => !ORDER.includes(t))];

const supabase = createClient(url, key);
const { data: privacy, error: privacyError } = await supabase.from("privacy_state").select("retention_until,purged_at").single();
if (privacyError || !privacy) throw new Error("Privacy state unavailable: restore blocked");
const safeAfterPurge = new Set(["guest_photos", "guest_memories", "site_settings", "blocked_dates", "seating_tables"]);
if (tables.some(t => ["privacy_state", "privacy_access_log", "privacy_consents", "guest_identity_challenges", "guest_identity_tickets", "admin_sessions", "manage_recovery_tokens", "notification_outbox"].includes(t) || ((privacy.purged_at || Date.now() >= Date.parse(privacy.retention_until)) && !safeAfterPurge.has(t)))) {
  throw new Error("Restore blocked: expired operational records and authentication state cannot be restored");
}
// Validate every encrypted file before the first database write.
const restoredRows = new Map(tables.map(t => {
  const file = path.join(dir, `${t}.json.enc`);
  if (!/^[a-z_]+$/.test(t)) throw new Error("Invalid table name");
  const rows = decryptBackup(fs.readFileSync(file, "utf8"), t, encryptionKey);
  if ((privacy.purged_at || Date.now() >= Date.parse(privacy.retention_until)) && t === "guest_photos") for (const row of rows) row.name = null;
  return [t, rows];
}));
for (const t of tables) {
  const file = path.join(dir, `${t}.json.enc`);
  if (!fs.existsSync(file)) { console.warn(`⚠️  ${t}: 파일 없음, 건너뜀`); continue; }
  const rows = restoredRows.get(t);
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
