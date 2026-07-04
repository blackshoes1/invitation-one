-- Supabase SQL Editor 에서 실행. (v12_join_offer.sql 이후)
-- 1) 합석 제안 보완 — 본인(연락처) 주문 제외 + 정원(10명) 이상 주문 제외
-- 2) 정원 상한 10명 — 합석(join)/갈아타기(switch) 시 초과 차단
-- 3) 대표 일정 변경 → 동의/사양 방식
--    · 대표만 새 날짜의 '새 주문'으로 즉시 이동
--    · 함께 받던 분들은 기존 날짜에 남은 채 '동의 대기' 상태 (pending_delivery_id)
--    · 문자 링크로 각자 수락 → 새 주문으로 이동 / 사양 → 기존 날짜 잔류
--    · 혼자였던 주문은 예전처럼 즉시 변경(solo)

-- 앱 상수 PARTY_MAX(=10) 와 일치. 여기서는 하드코딩.

/* ------------------------------------------------------------------ *
 * 1) 합석 제안 — 본인 주문 제외 + 정원 미만만 노출
 *    p_phone: 신청 중인 사람의 연락처. 같은 연락처가 이미 낀 주문은 숨김.
 * ------------------------------------------------------------------ */
drop function if exists public.get_orders_on_date(date);
drop function if exists public.get_orders_on_date(date, text);
create or replace function public.get_orders_on_date(p_date date, p_phone text default null)
  returns table (id uuid, time_slot text, member_count int, owner_masked text)
  language sql security definer set search_path = public
as $$
  select d.id, d.time_slot,
         (select count(*)::int from public.participants x where x.delivery_id = d.id) as member_count,
         (select case
                   when length(btrim(p.name)) <= 1 then btrim(p.name)
                   when length(btrim(p.name)) = 2
                     then substr(btrim(p.name), 1, 1) || '*'
                   else substr(btrim(p.name), 1, 1)
                        || repeat('*', length(btrim(p.name)) - 2)
                        || substr(btrim(p.name), length(btrim(p.name)), 1)
                 end
          from public.participants p
          where p.delivery_id = d.id
          order by p.is_owner desc, p.created_at asc
          limit 1) as owner_masked
  from public.deliveries d
  where d.date = p_date and d.status in ('대기중', '확정')
    -- 정원(10명) 미만인 주문만 합석 제안
    and (select count(*) from public.participants x where x.delivery_id = d.id) < 10
    -- 본인 연락처가 이미 낀 주문은 제안하지 않음 (자기 주문에 합석 방지)
    and (
      p_phone is null
      or not exists (
        select 1 from public.participants pp
        where pp.delivery_id = d.id
          and regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g')
              = regexp_replace(p_phone, '\D', '', 'g')
      )
    )
  order by d.created_at asc;
$$;
grant execute on function public.get_orders_on_date(date, text) to anon;

/* ------------------------------------------------------------------ *
 * 2) 합류 — 정원(10명) 상한 추가. result 에 'full' 추가.
 *    result: 'ok' | 'dup' | 'closed' | 'full'
 * ------------------------------------------------------------------ */
drop function if exists public.join_delivery(uuid, text, text, uuid);
create or replace function public.join_delivery(
  p_delivery uuid, p_name text, p_phone text, p_convert uuid default null
) returns table (result text, participant_id uuid)
  language plpgsql security definer set search_path = public
as $$
declare d record; pt_id uuid; cnt int;
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

  select count(*) into cnt from public.participants where delivery_id = p_delivery;
  if cnt >= 10 then
    return query select 'full'::text, null::uuid; return;
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
 * 3) 갈아타기 — 정원(10명) 상한 추가. result 에 'full' 추가.
 *    result: 'ok' | 'closed' | 'dup' | 'same' | 'full'
 * ------------------------------------------------------------------ */
create or replace function public.switch_participant(p_id uuid, p_target uuid)
  returns text language plpgsql security definer set search_path = public
as $$
declare me record; t record; old_delivery uuid; cnt int;
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

  select count(*) into cnt from public.participants where delivery_id = p_target;
  if cnt >= 10 then return 'full'; end if;

  old_delivery := me.delivery_id;
  update public.participants
     set delivery_id = p_target, group_id = t.group_id,
         type = '직접배달', is_owner = false, pending_delivery_id = null,
         updated_at = now()
   where id = p_id;

  perform public._after_leave(old_delivery);
  return 'ok';
end $$;
grant execute on function public.switch_participant(uuid, uuid) to anon;

/* ------------------------------------------------------------------ *
 * 4) 동의 대기 포인터 — 대표 일정 변경 제안 시, 이동 대상 새 주문 id
 * ------------------------------------------------------------------ */
alter table public.participants
  add column if not exists pending_delivery_id uuid
    references public.deliveries(id) on delete set null;

/* ------------------------------------------------------------------ *
 * 5) 참여자 상세 — 대기 중 제안(날짜/시간/제안자) 포함
 * ------------------------------------------------------------------ */
drop function if exists public.get_participant(uuid);
create or replace function public.get_participant(p_id uuid)
  returns table (
    id uuid, type text, name text, region text, stamp text, message text,
    is_owner boolean, review_rating int, review_text text,
    delivery_id uuid, group_slug text,
    location text, date date, time_slot text, status text, tracking_stage text,
    member_count int, member_names text[],
    pending_delivery_id uuid, pending_date date, pending_time text, pending_by text
  )
  language sql security definer set search_path = public
as $$
  select p.id, p.type, p.name, p.region, p.stamp, p.message,
         p.is_owner, p.review_rating, p.review_text,
         p.delivery_id, g.slug as group_slug,
         d.location, d.date, d.time_slot, d.status, d.tracking_stage,
         (select count(*)::int from public.participants x where x.delivery_id = d.id) as member_count,
         (select array_agg(x.name order by x.created_at)
          from public.participants x where x.delivery_id = d.id) as member_names,
         p.pending_delivery_id,
         pd.date as pending_date, pd.time_slot as pending_time,
         (select x.name from public.participants x
          where x.delivery_id = p.pending_delivery_id
          order by x.is_owner desc, x.created_at asc limit 1) as pending_by
  from public.participants p
  left join public.deliveries d on d.id = p.delivery_id
  left join public.deliveries pd on pd.id = p.pending_delivery_id
  left join public.groups g on g.id = coalesce(d.group_id, p.group_id)
  where p.id = p_id;
$$;
grant execute on function public.get_participant(uuid) to anon;

/* ------------------------------------------------------------------ *
 * 6) 대표 일정 변경 제안
 *    result: 'solo'(혼자 → 즉시 변경) | 'proposed'(동의 대기 발송 대상 생김)
 *          | 'not_owner' | 'range' | 'taken' | 'not_found'
 *    proposed 시 new_delivery = 대표가 옮겨간 새 주문 id (서버가 pending 인원에게 SMS)
 *    ※ anon 직접 호출 금지 — 서버 라우트(service_role)에서만 호출해 SMS 를 함께 발송.
 * ------------------------------------------------------------------ */
create or replace function public.propose_reschedule(
  p_participant uuid, p_date date, p_time text, p_location text default null
) returns table (result text, moved_count int, new_delivery uuid)
  language plpgsql security definer set search_path = public
as $$
declare me record; cnt int; new_id uuid;
begin
  select * into me from public.participants where id = p_participant;
  if me is null or me.delivery_id is null then
    return query select 'not_found'::text, 0, null::uuid; return;
  end if;
  if not me.is_owner then
    return query select 'not_owner'::text, 0, null::uuid; return;
  end if;
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    return query select 'range'::text, 0, null::uuid; return;
  end if;
  if exists (select 1 from public.blocked_dates b where b.date = p_date) then
    return query select 'taken'::text, 0, null::uuid; return;
  end if;

  select count(*) into cnt from public.participants where delivery_id = me.delivery_id;

  -- 혼자면 예전처럼 즉시 변경
  if cnt <= 1 then
    update public.deliveries
       set date = p_date, time_slot = p_time,
           location = coalesce(nullif(btrim(coalesce(p_location, '')), ''), location),
           updated_at = now()
     where id = me.delivery_id;
    return query select 'solo'::text, 0, me.delivery_id; return;
  end if;

  -- 여러 명 → 대표만 새 날짜의 새 주문으로 이동, 나머지는 기존 날짜에서 동의 대기
  insert into public.deliveries (group_id, location, date, time_slot, message, status)
  select d.group_id,
         coalesce(nullif(btrim(coalesce(p_location, '')), ''), d.location),
         p_date, p_time, d.message, '대기중'
  from public.deliveries d where d.id = me.delivery_id
  returning id into new_id;

  -- 대표 이동
  update public.participants
     set delivery_id = new_id, is_owner = true, pending_delivery_id = null, updated_at = now()
   where id = p_participant;

  -- 남은 인원: 동의 대기 표시 (기존 날짜 잔류)
  update public.participants
     set pending_delivery_id = new_id, updated_at = now()
   where delivery_id = me.delivery_id and id <> p_participant;

  -- 대표가 빠진 기존 주문 대표 승계
  perform public._after_leave(me.delivery_id);

  select count(*) into cnt
  from public.participants where delivery_id = me.delivery_id;

  return query select 'proposed'::text, cnt, new_id;
end $$;
grant execute on function public.propose_reschedule(uuid, date, text, text) to service_role;

/* ------------------------------------------------------------------ *
 * 7) 일정 변경 제안에 응답 — 수락(이동) / 사양(잔류)
 *    result: 'accepted' | 'declined' | 'none'(대기 없음)
 *          | 'closed'(새 주문 마감) | 'full'(정원) | 'not_found'
 * ------------------------------------------------------------------ */
create or replace function public.respond_reschedule(p_participant uuid, p_accept boolean)
  returns text language plpgsql security definer set search_path = public
as $$
declare me record; t record; cnt int; old_delivery uuid;
begin
  select * into me from public.participants where id = p_participant;
  if me is null then return 'not_found'; end if;
  if me.pending_delivery_id is null then return 'none'; end if;

  -- 사양 → 기존 날짜에 잔류
  if not p_accept then
    update public.participants set pending_delivery_id = null, updated_at = now()
     where id = p_participant;
    return 'declined';
  end if;

  -- 수락 → 새 주문으로 이동
  select * into t from public.deliveries where id = me.pending_delivery_id;
  if t is null or t.status in ('취소', '완료') then
    update public.participants set pending_delivery_id = null, updated_at = now()
     where id = p_participant;
    return 'closed';
  end if;

  select count(*) into cnt from public.participants where delivery_id = t.id;
  if cnt >= 10 then return 'full'; end if;  -- 대기 유지 → 사양은 가능

  old_delivery := me.delivery_id;
  update public.participants
     set delivery_id = me.pending_delivery_id, group_id = t.group_id,
         is_owner = false, pending_delivery_id = null, updated_at = now()
   where id = p_participant;

  perform public._after_leave(old_delivery);
  return 'accepted';
end $$;
grant execute on function public.respond_reschedule(uuid, boolean) to anon;
