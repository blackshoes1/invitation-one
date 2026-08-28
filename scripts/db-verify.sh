#!/usr/bin/env bash
# =============================================================================
# P1-6 마이그레이션·권한 스모크 테스트 (CI/로컬 공용 — 로컬 Supabase 필요)
#
#   빈 DB → 레거시(db/*.sql, README 순서) → supabase/migrations 전체
#   → supabase/tests/permission_check.sql (권한·시그니처 단언)
#
# 사용 (일반 Postgres 컨테이너 — supabase CLI 불필요):
#   docker run -d -p 54322:5432 -e POSTGRES_PASSWORD=postgres postgres:17
#   bash scripts/db-verify.sh
# 환경변수:
#   DB_URL (기본: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
#
# ※ supabase CLI(supabase db start)는 시작 시 supabase/migrations 를 자동
#   적용하는데 이 저장소는 레거시(db/*.sql) 선행이 필요해 실패한다 — 그래서
#   일반 Postgres 에 Supabase 환경(롤·extensions·storage 스텁)을 직접 만든다.
# ⚠️ 운영 DB 를 향해 실행하지 말 것 — 레거시 스키마 재적용은 새 DB 전용이다.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q)

echo "== 사전 준비: Supabase 롤·extensions·storage 스텁 =="
"${PSQL[@]}" <<'SQL'
-- Supabase 가 기본 제공하는 롤 (권한 검증의 주체)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

-- pgcrypto 는 Supabase 처럼 extensions 스키마에
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- storage-api 가 없으므로 레거시 v17/v19 의 buckets insert 용 최소 스텁
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false
);
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
