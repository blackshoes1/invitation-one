#!/usr/bin/env bash
# =============================================================================
# P1-5 DB E2E 준비 (CI/로컬 공용 — Docker + supabase CLI 필요)
#
# supabase start 는 supabase/migrations 만 자동 적용하므로, 레거시(db/*.sql)를
# 2000-01-01 타임스탬프 사본으로 복사해 순서를 보장한 뒤 스택을 띄우고 시드한다.
# 생성물(config.toml·사본)은 커밋하지 않는다 (.gitignore).
#
# 이후 단계(빌드·playwright)는 이 스크립트가 $GITHUB_ENV 로 넘긴 env 를 사용.
# 로컬: eval "$(bash scripts/e2e-db-ci.sh | tail -n +0)" 대신 출력 안내를 참고.
# ⚠️ 운영 Supabase 를 향하지 않는다 — 전부 로컬 스택.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

E2E_INVITE_TOKEN="1234567890abcdef1234567890abcdef"
E2E_ADMIN_PASSWORD="e2e-admin-pass"
E2E_EVENT_KEY="e2e-event-key"

echo "== 1) CLI 설정 생성 =="
cat > supabase/config.toml <<'EOF'
project_id = "invitation-one-ci"
EOF

# (supabase 로컬 DB 이미지에는 storage 스키마·buckets 가 이미 포함돼 있어
#  별도 스텁이 필요 없다 — 오히려 storage 스키마에 create 권한이 없어 실패함)

echo "== 2) 레거시 → 타임스탬프 사본 (README 순서) =="
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
i=0
for f in "${LEGACY[@]}"; do
  i=$((i + 1))
  cp "$f" "$(printf 'supabase/migrations/200001010000%02d_legacy_%s' "$i" "$(basename "$f")")"
done

echo "== 4) supabase start (studio/storage 등 제외, migrations 자동 적용) =="
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,storage-api,realtime,inbucket

echo "== 5) 시드 =="
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<EOF
insert into public.groups (name, slug) values ('E2E그룹', 'e2e-group')
  on conflict (slug) do nothing;
insert into public.group_members (group_id, name, phone, invite_token_hash)
select g.id, '초대손님', '010-9876-5432', public._token_hash('${E2E_INVITE_TOKEN}')
  from public.groups g
 where g.slug = 'e2e-group'
   and not exists (
     select 1 from public.group_members m
      where m.invite_token_hash = public._token_hash('${E2E_INVITE_TOKEN}')
   );
EOF

echo "== 6) 앱/테스트 env 내보내기 =="
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
ENV_LINES=(
  "NEXT_PUBLIC_SUPABASE_URL=${API_URL}"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}"
  "SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}"
  "ADMIN_PASSWORD=${E2E_ADMIN_PASSWORD}"
  "CHECKIN_EVENT_KEY=${E2E_EVENT_KEY}"
  "E2E_DB=1"
  "E2E_INVITE_TOKEN=${E2E_INVITE_TOKEN}"
  "E2E_CHECKIN_EVENT_KEY=${E2E_EVENT_KEY}"
)
if [ -n "${GITHUB_ENV:-}" ]; then
  printf '%s\n' "${ENV_LINES[@]}" >> "$GITHUB_ENV"
  echo "(GITHUB_ENV 에 기록됨)"
else
  echo "다음 env 로 빌드·테스트를 실행하세요:"
  printf '  export %s\n' "${ENV_LINES[@]}"
fi
echo "✔ e2e-db 준비 완료"
