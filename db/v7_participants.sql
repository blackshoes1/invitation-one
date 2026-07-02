-- Supabase SQL Editor 에서 실행. (v6_reviews_tracking.sql 이후)
-- ★ 참여 시스템 개편 ★
--   deliveries = 주문(모임) 단위 / participants = 참여자 단위 (직접배달 + 마음배송 통합)
--   합류 = 행 추가 / 갈아타기 = delivery_id 변경 / 나가기 = 행 삭제
--   마음↔직접 전환 = type 변경. 참여자 0명 주문은 자동 취소 + 슬롯 해제.
--   non-destructive: 기존 deliveries.name/phone/review_* 컬럼과 messages 는 남겨두고
--   데이터만 participants 로 복사. 신규 로직은 participants 만 사용.

/* ------------------------------------------------------------------ *
 * 1) participants 테이블
 * ------------------------------------------------------------------ */
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid references public.deliveries(id) on delete cascade, -- 마음배송은 null
  group_id uuid references public.groups(id) on delete set null,       -- 마음배송 소속 그룹
  type text not null check (type in ('직접배달', '마음배송')),
  name text not null,
  phone text,                       -- 마음배송은 선택
  region text,                      -- 마음배송 필수(앱단) — "부산 해운대구" / "해외 프랑스"
  is_owner boolean not null default false,
  stamp text,                       -- 마음배송용
  message text,                     -- 마음배송용
  review_rating int check (review_rating is null or review_rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_delivery_shape
    check (type = '마음배송' or (delivery_id is not null and phone is not null))
);

create index if not exists participants_delivery_idx on public.participants (delivery_id);
create index if not exists participants_group_idx on public.participants (group_id);

alter table public.participants enable row level security;
-- anon 직접 접근 없음. 모든 공개 조회/쓰기는 아래 security definer RPC 로만.

-- 기존 deliveries 의 name/phone 은 legacy 로 전환 (신규 주문은 participants 에만 기록)
alter table public.deliveries alter column name drop not null;
alter table public.deliveries alter column phone drop not null;

/* ------------------------------------------------------------------ *
 * 2) 데이터 마이그레이션 (participants 가 비어있을 때 1회만)
 * ------------------------------------------------------------------ */
do $$
begin
  if not exists (select 1 from public.participants limit 1) then
    -- 기존 직접배달 신청자 → 주문 대표 참여자
    insert into public.participants
      (delivery_id, group_id, type, name, phone, is_owner, review_rating, review_text, created_at)
    select id, group_id, '직접배달', name, phone, true, review_rating, review_text, created_at
    from public.deliveries
    where name is not null and phone is not null;

    -- 기존 마음배송(messages) → 마음배송 참여자 (region 은 legacy null 허용)
    insert into public.participants
      (delivery_id, group_id, type, name, is_owner, stamp, message, created_at)
    select null, group_id, '마음배송', name, false, stamp, message, created_at
    from public.messages;
  end if;
end $$;

/* ------------------------------------------------------------------ *
 * 3) 내부 헬퍼 — 참여자 이탈 후 대표 승계 / 빈 주문 자동 취소
 * ------------------------------------------------------------------ */
create or replace function public._after_leave(p_delivery uuid)
  returns void language plpgsql security definer set search_path = public
as $$
declare cnt int; new_owner uuid;
begin
  if p_delivery is null then return; end if;

  select count(*) into cnt
  from public.participants where delivery_id = p_delivery;

  if cnt = 0 then
    -- 참여자 0명 → 주문 자동 취소 + 슬롯 해제
    update public.deliveries set status = '취소', updated_at = now()
    where id = p_delivery and status <> '취소';
    return;
  end if;

  -- 대표가 없으면 가장 먼저 합류한 사람이 승계
  if not exists (
    select 1 from public.participants where delivery_id = p_delivery and is_owner
  ) then
    select id into new_owner from public.participants
    where delivery_id = p_delivery order by created_at asc limit 1;
    update public.participants set is_owner = true, updated_at = now()
    where id = new_owner;
  end if;
end $$;

/* ------------------------------------------------------------------ *
 * 4) 새 주문 생성 — 주문 + 대표 참여자 동시 생성
 *    p_convert: 마음배송 참여자를 직접배달로 전환하며 주문 생성할 때 그 참여자 id
 * ------------------------------------------------------------------ */
drop function if exists public.create_delivery_v2(uuid, text, text, text, date, text, text, uuid);
create or replace function public.create_delivery_v2(
  p_group_id uuid, p_name text, p_phone text, p_location text,
  p_date date, p_time text, p_message text, p_convert uuid default null
) returns table (delivery_id uuid, participant_id uuid)
  language plpgsql security definer set search_path = public
as $$
declare d_id uuid; pt_id uuid;
begin
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    raise exception 'out_of_range';
  end if;
  if exists (select 1 from public.deliveries dd where dd.date = p_date and dd.status <> '취소') then
    raise exception 'date_taken' using errcode = '23505';
  end if;

  insert into public.deliveries (group_id, location, date, time_slot, message)
  values (p_group_id, p_location, p_date, p_time, p_message)
  returning id into d_id;

  if p_convert is not null and exists (
    select 1 from public.participants pp where pp.id = p_convert and pp.type = '마음배송'
  ) then
    -- 마음배송 → 직접배달 전환 (스탬프/메시지는 방명록 기록으로 유지하지 않고 배달로 재탄생)
    update public.participants
       set type = '직접배달', delivery_id = d_id, group_id = p_group_id,
           name = p_name, phone = p_phone, is_owner = true, updated_at = now()
     where id = p_convert
     returning id into pt_id;
  else
    insert into public.participants (delivery_id, group_id, type, name, phone, is_owner)
    values (d_id, p_group_id, '직접배달', p_name, p_phone, true)
    returning id into pt_id;
  end if;

  return query select d_id, pt_id;
end $$;
grant execute on function public.create_delivery_v2(uuid, text, text, text, date, text, text, uuid) to anon;

/* ------------------------------------------------------------------ *
 * 5) 합류 — 기존 주문에 참여자 추가 (초경량)
 *    result: 'ok' | 'dup'(같은 이름+연락처 이미 합류) | 'closed'(취소/완료 주문)
 * ------------------------------------------------------------------ */
drop function if exists public.join_delivery(uuid, text, text, uuid);
create or replace function public.join_delivery(
  p_delivery uuid, p_name text, p_phone text, p_convert uuid default null
) returns table (result text, participant_id uuid)
  language plpgsql security definer set search_path = public
as $$
declare d record; pt_id uuid;
begin
  select * into d from public.deliveries dd where dd.id = p_delivery;
  if d is null or d.status in ('취소', '완료') then
    return query select 'closed'::text, null::uuid; return;
  end if;

  if exists (
    select 1 from public.participants pp
    where pp.delivery_id = p_delivery
      and btrim(pp.name) = btrim(p_name)
      and regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g')
          = regexp_replace(p_phone, '\D', '', 'g')
      and (p_convert is null or pp.id <> p_convert)
  ) then
    return query select 'dup'::text, null::uuid; return;
  end if;

  if p_convert is not null and exists (
    select 1 from public.participants pp where pp.id = p_convert and pp.type = '마음배송'
  ) then
    update public.participants
       set type = '직접배달', delivery_id = p_delivery, group_id = d.group_id,
           name = p_name, phone = p_phone, is_owner = false, updated_at = now()
     where id = p_convert
     returning id into pt_id;
  else
    insert into public.participants (delivery_id, group_id, type, name, phone, is_owner)
    values (p_delivery, d.group_id, '직접배달', p_name, p_phone, false)
    returning id into pt_id;
  end if;

  return query select 'ok'::text, pt_id;
end $$;
grant execute on function public.join_delivery(uuid, text, text, uuid) to anon;

/* ------------------------------------------------------------------ *
 * 6) 마음 배송 — 참여자로 기록 (지역 필수, 연락처 선택)
 * ------------------------------------------------------------------ */
create or replace function public.send_heart(
  p_group_id uuid, p_name text, p_region text, p_stamp text, p_message text, p_phone text default null
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare pt_id uuid;
begin
  if nullif(btrim(coalesce(p_region, '')), '') is null then
    raise exception 'region_required';
  end if;
  insert into public.participants (group_id, type, name, phone, region, stamp, message)
  values (p_group_id, '마음배송', p_name, nullif(btrim(coalesce(p_phone, '')), ''), p_region, p_stamp, p_message)
  returning id into pt_id;
  return pt_id;
end $$;
grant execute on function public.send_heart(uuid, text, text, text, text, text) to anon;

/* ------------------------------------------------------------------ *
 * 7) 그룹 페이지 — 주문 단위 현황 (이름+날짜+배송단계만, 장소/연락처 비공개)
 * ------------------------------------------------------------------ */
create or replace function public.get_group_orders(p_slug text)
  returns table (
    id uuid, date date, time_slot text, status text, tracking_stage text,
    member_names text[]
  )
  language sql security definer set search_path = public
as $$
  select d.id, d.date, d.time_slot, d.status, d.tracking_stage,
         coalesce(
           (select array_agg(p.name order by p.created_at)
            from public.participants p where p.delivery_id = d.id),
           '{}'::text[]
         ) as member_names
  from public.deliveries d
  join public.groups g on g.id = d.group_id
  where g.slug = p_slug and d.status <> '취소'
  order by d.date;
$$;
grant execute on function public.get_group_orders(text) to anon;

/* ------------------------------------------------------------------ *
 * 8) 참여자 상세 — manage 페이지 (본인 링크로만 접근)
 * ------------------------------------------------------------------ */
create or replace function public.get_participant(p_id uuid)
  returns table (
    id uuid, type text, name text, region text, stamp text, message text,
    is_owner boolean, review_rating int, review_text text,
    delivery_id uuid, group_slug text,
    location text, date date, time_slot text, status text, tracking_stage text,
    member_count int, member_names text[]
  )
  language sql security definer set search_path = public
as $$
  select p.id, p.type, p.name, p.region, p.stamp, p.message,
         p.is_owner, p.review_rating, p.review_text,
         p.delivery_id, g.slug as group_slug,
         d.location, d.date, d.time_slot, d.status, d.tracking_stage,
         (select count(*)::int from public.participants x where x.delivery_id = d.id) as member_count,
         (select array_agg(x.name order by x.created_at)
          from public.participants x where x.delivery_id = d.id) as member_names
  from public.participants p
  left join public.deliveries d on d.id = p.delivery_id
  left join public.groups g on g.id = coalesce(d.group_id, p.group_id)
  where p.id = p_id;
$$;
grant execute on function public.get_participant(uuid) to anon;

/* ------------------------------------------------------------------ *
 * 9) 갈아타기 — 다른 주문으로 이동
 *    result: 'ok' | 'closed'(대상 주문 마감) | 'dup' | 'same'
 * ------------------------------------------------------------------ */
create or replace function public.switch_participant(p_id uuid, p_target uuid)
  returns text language plpgsql security definer set search_path = public
as $$
declare me record; t record; old_delivery uuid;
begin
  select * into me from public.participants where id = p_id;
  if me is null then return 'not_found'; end if;
  if me.delivery_id = p_target then return 'same'; end if;

  select * into t from public.deliveries where id = p_target;
  if t is null or t.status in ('취소', '완료') then return 'closed'; end if;

  if exists (
    select 1 from public.participants pp
    where pp.delivery_id = p_target and pp.id <> p_id
      and btrim(pp.name) = btrim(me.name)
      and regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g')
          = regexp_replace(coalesce(me.phone, ''), '\D', '', 'g')
  ) then return 'dup'; end if;

  old_delivery := me.delivery_id;
  update public.participants
     set delivery_id = p_target, group_id = t.group_id,
         type = '직접배달', is_owner = false, updated_at = now()
   where id = p_id;

  perform public._after_leave(old_delivery);
  return 'ok';
end $$;
grant execute on function public.switch_participant(uuid, uuid) to anon;

/* ------------------------------------------------------------------ *
 * 10) 나가기 — 참여 취소 (대표 승계 / 빈 주문 자동 취소)
 * ------------------------------------------------------------------ */
create or replace function public.leave_delivery(p_id uuid)
  returns text language plpgsql security definer set search_path = public
as $$
declare old_delivery uuid;
begin
  select delivery_id into old_delivery from public.participants where id = p_id;
  if old_delivery is null and not exists (select 1 from public.participants where id = p_id) then
    return 'not_found';
  end if;
  delete from public.participants where id = p_id;
  perform public._after_leave(old_delivery);
  return 'ok';
end $$;
grant execute on function public.leave_delivery(uuid) to anon;

/* ------------------------------------------------------------------ *
 * 11) 직접배달 → 마음배송 전환 (부드러운 이탈)
 * ------------------------------------------------------------------ */
create or replace function public.convert_to_heart(
  p_id uuid, p_region text, p_stamp text, p_message text
) returns text language plpgsql security definer set search_path = public
as $$
declare me record; old_delivery uuid;
begin
  select * into me from public.participants where id = p_id;
  if me is null then return 'not_found'; end if;
  if nullif(btrim(coalesce(p_region, '')), '') is null then return 'region_required'; end if;

  old_delivery := me.delivery_id;
  update public.participants
     set type = '마음배송', delivery_id = null, is_owner = false,
         region = p_region, stamp = p_stamp,
         message = nullif(btrim(coalesce(p_message, '')), ''),
         updated_at = now()
   where id = p_id;

  perform public._after_leave(old_delivery);
  return 'ok';
end $$;
grant execute on function public.convert_to_heart(uuid, text, text, text) to anon;

/* ------------------------------------------------------------------ *
 * 12) 주문 대표의 일정 변경 (참여자 전원 적용)
 *    result: 'ok' | 'taken' | 'range' | 'not_owner'
 * ------------------------------------------------------------------ */
create or replace function public.reschedule_delivery_v2(
  p_participant uuid, p_date date, p_time text, p_location text default null
) returns text language plpgsql security definer set search_path = public
as $$
declare me record;
begin
  select * into me from public.participants where id = p_participant;
  if me is null or me.delivery_id is null then return 'not_found'; end if;
  if not me.is_owner then return 'not_owner'; end if;
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then return 'range'; end if;
  if exists (
    select 1 from public.deliveries dd
    where dd.date = p_date and dd.status <> '취소' and dd.id <> me.delivery_id
  ) then return 'taken'; end if;

  update public.deliveries
     set date = p_date, time_slot = p_time,
         location = coalesce(nullif(btrim(coalesce(p_location, '')), ''), location),
         updated_at = now()
   where id = me.delivery_id;
  return 'ok';
end $$;
grant execute on function public.reschedule_delivery_v2(uuid, date, text, text) to anon;

/* ------------------------------------------------------------------ *
 * 13) 리뷰 — 참여자 개인별 (배송 완료 주문만)
 * ------------------------------------------------------------------ */
create or replace function public.submit_review_v2(
  p_participant uuid, p_rating int, p_text text
) returns text language plpgsql security definer set search_path = public
as $$
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then return 'rating'; end if;

  update public.participants p
     set review_rating = p_rating,
         review_text = nullif(btrim(coalesce(p_text, '')), ''),
         updated_at = now()
   where p.id = p_participant
     and p.type = '직접배달'
     and exists (select 1 from public.deliveries d where d.id = p.delivery_id and d.status = '완료');

  if not found then return 'not_ready'; end if;
  return 'ok';
end $$;
grant execute on function public.submit_review_v2(uuid, int, text) to anon;

/* ------------------------------------------------------------------ *
 * 14) 축하 피드 + 지도 핀 통합 조회 (공개)
 *   kind='마음배송': 신청 즉시. area=region, stamp/message.
 *   kind='직접배달': 배송 완료 시. area=배송지 앞 2토막, 리뷰(있으면).
 *   연락처·정확한 주소 비노출.
 * ------------------------------------------------------------------ */
create or replace function public.get_celebrations()
  returns table (
    id uuid, kind text, name text, area text, date date,
    stamp text, message text, rating int, review text, created_at timestamptz
  )
  language sql security definer set search_path = public
as $$
  select p.id, p.type as kind, p.name,
         case when p.type = '마음배송' then p.region
              else (regexp_split_to_array(btrim(d.location), '\s+'))[1]
                   || coalesce(' ' || (regexp_split_to_array(btrim(d.location), '\s+'))[2], '')
         end as area,
         d.date,
         p.stamp, p.message, p.review_rating as rating, p.review_text as review,
         p.created_at
  from public.participants p
  left join public.deliveries d on d.id = p.delivery_id
  where p.type = '마음배송'
     or (p.type = '직접배달' and d.status = '완료')
  order by p.created_at asc
  limit 300;
$$;
grant execute on function public.get_celebrations() to anon;

/* ------------------------------------------------------------------ *
 * 15) 본인 확인 v2 — 참여자 단위 (직접배달 + 연락처 남긴 마음배송)
 *   guest_no: 축하 참여자(마음배송 전체 + 직접배달 완료) 시간순 순번
 * ------------------------------------------------------------------ */
drop function if exists public.verify_guest_v2(text, text, date);
create or replace function public.verify_guest_v2(
  p_name text, p_last4 text, p_ymd date default null
) returns table (
  participant_id uuid, name text, type text, date date, time_slot text,
  status text, tracking_stage text, review_rating int, region text, guest_no int
)
  language sql security definer set search_path = public
as $$
  with celebrants as (
    select p.id, row_number() over (order by p.created_at asc) as guest_no
    from public.participants p
    left join public.deliveries d on d.id = p.delivery_id
    where p.type = '마음배송' or (p.type = '직접배달' and d.status = '완료')
  )
  select p.id as participant_id, p.name, p.type, d.date, d.time_slot,
         d.status, d.tracking_stage, p.review_rating, p.region,
         c.guest_no::int
  from public.participants p
  left join public.deliveries d on d.id = p.delivery_id
  left join celebrants c on c.id = p.id
  where (d.id is null or d.status <> '취소')
    and p.phone is not null
    and btrim(p.name) = btrim(p_name)
    and right(regexp_replace(p.phone, '\D', '', 'g'), 4) = p_last4
    and (p_ymd is null or d.date = p_ymd)
  order by p.created_at;
$$;
grant execute on function public.verify_guest_v2(text, text, date) to anon;
