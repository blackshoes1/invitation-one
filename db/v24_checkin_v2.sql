-- Supabase SQL Editor 에서 실행. (v23_drop_messages.sql 이후)
-- ★ 현장 체크인 v2 — 개인 QR + 좌석 관리 ★ (docs/CHECKIN_SEATING_SPEC.md)
--   스펙 개발 순서 1~6단계를 한 파일로 묶어 실행 순서를 보장한다.
--   보안 경계: 원문 UUID 토큰 + 서버 API(service role) + 공개 쓰기 표면 회수.

/* ------------------------------------------------------------------ *
 * 1) seating_tables — 연회장 테이블
 * ------------------------------------------------------------------ */
create table if not exists public.seating_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone text,
  side text check (side in ('groom', 'bride', 'common')),
  capacity int not null check (capacity between 1 and 50),
  floor text,
  location_note text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.seating_tables enable row level security;
-- anon 직접 접근 없음. 조회/쓰기 모두 관리자 API(service role) 경유.

/* ------------------------------------------------------------------ *
 * 2) rsvp — 좌석 배정 + 체크인 토큰 컬럼
 *    FK 기본 NO ACTION: 배정된 RSVP 가 있는 테이블 삭제를 DB 가 차단.
 * ------------------------------------------------------------------ */
alter table public.rsvp
  add column if not exists table_id uuid
    references public.seating_tables(id),
  add column if not exists checkin_token uuid,
  add column if not exists checkin_token_active boolean not null default false,
  add column if not exists qr_issued_at timestamptz;

create unique index if not exists rsvp_checkin_token_uniq
  on public.rsvp(checkin_token)
  where checkin_token is not null;

-- 토큰 없이 active=true 불가
alter table public.rsvp
  drop constraint if exists rsvp_active_token_shape;
alter table public.rsvp
  add constraint rsvp_active_token_shape
  check (checkin_token_active = false or checkin_token is not null);

/* ------------------------------------------------------------------ *
 * 3) 기존 참석 RSVP 전건 토큰 백필
 *    (관리자 링크 복사 · QR 발송 목록 CSV · 후속 SMS 발송에 사용)
 * ------------------------------------------------------------------ */
update public.rsvp
set checkin_token = gen_random_uuid(),
    checkin_token_active = true,
    qr_issued_at = now()
where attending = true
  and checkin_token is null;

/* ------------------------------------------------------------------ *
 * 4) checkins v2 — 컬럼 확장 + side 영문 통일
 * ------------------------------------------------------------------ */
alter table public.checkins
  add column if not exists rsvp_id uuid references public.rsvp(id),
  add column if not exists expected_party_size int,
  add column if not exists actual_party_size int,
  add column if not exists meal_count int,
  add column if not exists source text,
  add column if not exists status text not null default 'active',
  add column if not exists checked_in_by text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists canceled_at timestamptz,
  add column if not exists admin_memo text;

-- 한글 side → 영문 코드 (v22 인라인 check 는 자동 명명: checkins_side_check)
alter table public.checkins
  drop constraint if exists checkins_side_check;
update public.checkins
set side = case side
  when '신랑' then 'groom'
  when '신부' then 'bride'
  else side
end;
alter table public.checkins
  add constraint checkins_side_check
  check (side is null or side in ('groom', 'bride'));

/* ------------------------------------------------------------------ *
 * 5) 기존 체크인 legacy 백필 (제약 추가 전에 실행해야 함)
 * ------------------------------------------------------------------ */
update public.checkins
set actual_party_size = party_size,
    expected_party_size = null,
    meal_count = null,
    source = 'legacy',
    status = 'active',
    checked_in_by = 'legacy'
where source is null;

alter table public.checkins
  drop constraint if exists checkins_source_check;
alter table public.checkins
  add constraint checkins_source_check
  check (source in ('personal_qr', 'common_qr', 'admin', 'walk_in', 'legacy'));

alter table public.checkins
  drop constraint if exists checkins_status_check;
alter table public.checkins
  add constraint checkins_status_check
  check (status in ('active', 'canceled', 'merged'));

-- meal_count 는 0..actual_party_size
alter table public.checkins
  drop constraint if exists checkins_meal_count_range;
alter table public.checkins
  add constraint checkins_meal_count_range
  check (
    meal_count is null
    or (meal_count >= 0
        and (actual_party_size is null or meal_count <= actual_party_size))
  );

-- 동일 RSVP 활성 체크인 최대 1건 — 동시 요청도 DB 가 보장 (멱등 처리의 근거)
create unique index if not exists checkins_active_rsvp_uniq
  on public.checkins(rsvp_id)
  where rsvp_id is not null and status = 'active';

-- ※ 기존 party_size 컬럼은 호환성을 위해 유지. 앱 전환 완료 후 별도 마이그레이션에서 제거.

/* ------------------------------------------------------------------ *
 * 5-1) get_checkin_summary 갱신 — side 영문화·status 반영
 *      (기존 함수는 '신랑'/'신부' 필터라 마이그레이션 후 0 이 됨)
 *      공개 조회는 유지 (합계만 노출 — 개인정보 없음)
 * ------------------------------------------------------------------ */
create or replace function public.get_checkin_summary()
  returns table (total_checkins int, total_people int, groom int, bride int)
  language sql security definer set search_path = public
as $$
  select count(*)::int,
         coalesce(sum(coalesce(actual_party_size, party_size)), 0)::int,
         coalesce(sum(coalesce(actual_party_size, party_size))
                  filter (where side = 'groom'), 0)::int,
         coalesce(sum(coalesce(actual_party_size, party_size))
                  filter (where side = 'bride'), 0)::int
  from public.checkins
  where status = 'active';
$$;

/* ------------------------------------------------------------------ *
 * 6) 공개 쓰기 표면 회수
 *    - rsvp: 레거시 anon 직접 insert 정책 제거 + 권한 회수
 *    - submit_rsvp / submit_checkin: anon 실행 권한 회수 (함수는 히스토리 호환으로 보존)
 * ------------------------------------------------------------------ */
drop policy if exists "rsvp_anon_insert" on public.rsvp;
revoke insert, update, delete on public.rsvp from anon;

-- ※ 함수 EXECUTE 는 기본적으로 PUBLIC 에 부여되므로 anon 만 회수하면
--    PUBLIC 경유로 여전히 호출 가능하다. PUBLIC·authenticated 까지 회수.
--    (service_role 은 직접 grant 가 있어 유지됨 — 운영 DB 검증 완료)
revoke execute on function public.submit_rsvp(
  text, text, text, boolean, int, int, boolean, text, text
) from public, anon, authenticated;

revoke execute on function public.submit_checkin(text, int, text)
  from public, anon, authenticated;

/* ------------------------------------------------------------------ *
 * 7) submit_rsvp_v2 — 서버 전용 (anon grant 없음)
 *    신규 생성/기존 수정 + 참석 전환 판정 + 토큰 발급·비활성화·로테이션을 원자 처리.
 *    토큰 반환 정책: 신규(inserted)만 pass_token 반환. 기존 수정은 null.
 *    (이름+연락처는 인증 수단이 아니므로 저장된 토큰을 공개 경로로 노출하지 않는다)
 * ------------------------------------------------------------------ */
create or replace function public.submit_rsvp_v2(
  p_name text, p_phone text, p_side text, p_attending boolean,
  p_companions int, p_children int, p_kids_meal boolean,
  p_meal text, p_memo text
) returns table (result text, rsvp_id uuid, pass_token uuid)
  language plpgsql security definer set search_path = public
as $$
declare
  old record;
  new_token uuid;
  r_id uuid;
begin
  select * into old from public.rsvp
   where name = p_name and phone = p_phone
   for update;

  if old.id is null then
    -- 신규 제출: 참석이면 토큰 발급 후 일회 반환
    if p_attending then new_token := gen_random_uuid(); end if;
    begin
      insert into public.rsvp(
        name, phone, side, attending, companion_count, children,
        kids_meal, eating, memo,
        checkin_token, checkin_token_active, qr_issued_at
      ) values (
        p_name, p_phone, p_side, p_attending, p_companions, p_children,
        p_kids_meal, p_meal, p_memo,
        new_token, new_token is not null,
        case when new_token is not null then now() end
      ) returning id into r_id;
    exception when unique_violation then
      -- 동시 제출 경합: 이미 생긴 행에 대해 수정 경로로 재시도
      return query select * from public.submit_rsvp_v2(
        p_name, p_phone, p_side, p_attending, p_companions, p_children,
        p_kids_meal, p_meal, p_memo);
      return;
    end;
    return query select 'inserted'::text, r_id, new_token;
    return;
  end if;

  -- 기존 수정: 공통 필드 반영
  update public.rsvp set
    side = p_side, attending = p_attending,
    companion_count = p_companions, children = p_children,
    kids_meal = p_kids_meal, eating = p_meal, memo = p_memo,
    updated_at = now()
  where id = old.id;

  -- 참석 여부 전환에 따른 토큰 처리 (같은 트랜잭션)
  if old.attending and not p_attending then
    -- 참석 → 불참: 즉시 비활성화. 기존 활성 체크인은 삭제하지 않음(관리자 경고로 노출).
    update public.rsvp set checkin_token_active = false where id = old.id;
  elsif p_attending and (not old.attending or old.checkin_token is null) then
    -- 불참 → 참석(로테이션. 기존 토큰 재사용 금지) 또는 토큰 없는 참석 행 보정
    update public.rsvp set
      checkin_token = gen_random_uuid(),
      checkin_token_active = true,
      qr_issued_at = now()
    where id = old.id;
  end if;

  return query select 'updated'::text, old.id, null::uuid;
end $$;

-- 서버(service role) 전용 — 공개 실행 금지 (service_role 직접 grant 는 유지)
revoke execute on function public.submit_rsvp_v2(
  text, text, text, boolean, int, int, boolean, text, text
) from public, anon, authenticated;

/* ------------------------------------------------------------------ *
 * 8) site_settings — 체크인 운영 시간 (서버 전용 키)
 *    get_site_settings() 공개 화이트리스트에 추가하지 않는다.
 *    체크인 API 가 service role 로 직접 조회해 판정.
 *    키: checkin_enabled(boolean) / checkin_open_at / checkin_close_at (ISO 문자열)
 *    값은 관리자 화면에서 설정 — 여기서는 기본값만 시드.
 * ------------------------------------------------------------------ */
insert into public.site_settings (key, value)
values ('checkin_enabled', 'false'::jsonb)
on conflict (key) do nothing;
