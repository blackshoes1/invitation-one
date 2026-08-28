#!/usr/bin/env bash
# =============================================================================
# P1-6 마이그레이션·권한 스모크 테스트 (CI/로컬 공용 — 로컬 Supabase 필요)
#
#   빈 DB → 레거시(db/*.sql, README 순서) → supabase/migrations 전체
#   → supabase/tests/permission_check.sql (권한·시그니처 단언)
#
# 사용:
#   supabase db start            # 로컬 Postgres (docker)
#   bash scripts/db-verify.sh
# 환경변수:
#   DB_URL (기본: supabase db start 의 로컬 주소)
#
# ⚠️ 운영 DB 를 향해 실행하지 말 것 — 레거시 스키마 재적용은 새 DB 전용이다.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q)

echo "== 사전 준비: storage 스텁·pgcrypto (db-only 스택 대비) =="
"${PSQL[@]}" <<'SQL'
-- supabase 'db-only' 스택에는 storage-api 가 없어 storage.buckets 가 없을 수 있다.
-- 레거시 v17/v19 의 insert 를 통과시키기 위한 최소 스텁 (스키마 검증 목적에 충분).
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false
);
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL

echo "== 레거시 적용 (supabase/migrations/README.md 순서) =="
LEGACY=(
  db/rsvp.sql db/deliveries.sql db/groups.sql db/group_members.sql
  db/v2_updates.sql db/v3_create_delivery.sql db/v4_messages.sql db/v5_rsvp.sql
  db/v6_reviews_tracking.sql db/v7_participants.sql db/v8_blocked_dates.sql
  db/v9_guest_count.sql db/v10_multi_orders.sql db/v11_find_by_date.sql
  db/v12_join_offer.sql db/v13_reschedule_consent.sql db/v14_group_offer.sql
  db/v15_rider.sql db/v16_rider_bride.sql db/v17_site_settings.sql
  db/v18_album_setting.sql db/v19_guest_photos.sql db/v20_delivery_geo.sql
  db/v21_reply.sql db/v22_checkin.sql db/v23_drop_messages.sql
  db/v24_checkin_v2.sql db/v24_notify_once.sql db/v25_merge_deliveries.sql
)
for f in "${LEGACY[@]}"; do
  echo "  -> $f"
  "${PSQL[@]}" -f "$f"
done

echo "== 표준 마이그레이션 적용 (파일명 순) =="
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "  -> $f"
  "${PSQL[@]}" -f "$f"
done

echo "== 권한·시그니처 검증 =="
"${PSQL[@]}" -f supabase/tests/permission_check.sql

echo "✔ db-verify 통과"
