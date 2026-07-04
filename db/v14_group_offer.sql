-- Supabase SQL Editor 에서 실행. (v13_reschedule_consent.sql 이후)
-- ★ 그룹 제안 일정 (관리자 오퍼) ★
--   관리자가 그룹 생성 시 만남 일정(날짜/시간대/장소)을 제안 → 그룹 링크 공유 →
--   하객은 이름+연락처만 입력하고 승낙하면 끝.
--   · 첫 승낙자: 제안 내용으로 주문 생성 + 본인이 대표(is_owner)
--   · 이후 승낙자: 그 주문에 합류 (기존 join_delivery 재사용)
--   기존 불변식 유지: 주문은 항상 참여자와 함께 생성 (참여자 0명 주문 없음)

/* ------------------------------------------------------------------ *
 * 1) groups 에 제안 일정 컬럼
 * ------------------------------------------------------------------ */
alter table public.groups
  add column if not exists offer_date date,
  add column if not exists offer_time text
    check (offer_time is null or offer_time in ('오전', '오후', '저녁')),
  add column if not exists offer_location text,
  add column if not exists offer_delivery_id uuid
    references public.deliveries(id) on delete set null;

/* ------------------------------------------------------------------ *
 * 2) get_group 확장 — 제안 정보 포함 (그룹 페이지에서 제안 카드 표시용)
 * ------------------------------------------------------------------ */
drop function if exists public.get_group(text);
create or replace function public.get_group(p_slug text)
  returns table (
    id uuid, name text, slug text,
    offer_date date, offer_time text, offer_location text, offer_delivery_id uuid
  )
  language sql security definer set search_path = public
as $$
  select id, name, slug, offer_date, offer_time, offer_location, offer_delivery_id
  from public.groups where slug = p_slug;
$$;
grant execute on function public.get_group(text) to anon;

/* ------------------------------------------------------------------ *
 * 3) 제안 승낙 — 첫 승낙은 주문 생성(대표), 이후는 합류
 *    result: 'ok' | 'dup' | 'full' | 'closed' | 'blocked' | 'no_offer'
 *    · blocked = 제안 날짜가 마감(blocked_dates)됐거나 신청 기간 밖
 *    · 그룹 행 잠금(for update)으로 동시 첫 승낙 직렬화 (주문 중복 생성 방지)
 * ------------------------------------------------------------------ */
create or replace function public.accept_group_offer(
  p_slug text, p_name text, p_phone text, p_convert uuid default null
) returns table (result text, participant_id uuid, delivery_id uuid, member_count int)
  language plpgsql security definer set search_path = public
as $$
declare g record; d record; jr record; d_id uuid; pt_id uuid; cnt int;
begin
  select * into g from public.groups gg where gg.slug = p_slug for update;
  if g is null or g.offer_date is null or g.offer_time is null then
    return query select 'no_offer'::text, null::uuid, null::uuid, null::int; return;
  end if;

  -- 이미 제안 주문이 생성돼 있고 활성 상태면 → 합류
  if g.offer_delivery_id is not null then
    select * into d from public.deliveries dd where dd.id = g.offer_delivery_id;
    if d is not null and d.status not in ('취소', '완료') then
      select * into jr from public.join_delivery(g.offer_delivery_id, p_name, p_phone, p_convert);
      if jr.result = 'ok' then
        select count(*)::int into cnt from public.participants pp
        where pp.delivery_id = g.offer_delivery_id;
        return query select 'ok'::text, jr.participant_id, g.offer_delivery_id, cnt;
      else
        return query select jr.result, null::uuid, null::uuid, null::int;
      end if;
      return;
    end if;
    -- 제안 주문이 취소/완료됐으면 아래에서 새로 생성
  end if;

  -- 첫 승낙 → 주문 생성 (기간·마감일 검사)
  if g.offer_date < date '2026-07-06' or g.offer_date > date '2026-10-16'
     or exists (select 1 from public.blocked_dates b where b.date = g.offer_date) then
    return query select 'blocked'::text, null::uuid, null::uuid, null::int; return;
  end if;

  insert into public.deliveries (group_id, location, date, time_slot, message)
  values (
    g.id,
    coalesce(nullif(btrim(coalesce(g.offer_location, '')), ''), '단톡방에서 상의해요'),
    g.offer_date, g.offer_time, null
  )
  returning id into d_id;

  if p_convert is not null and exists (
    select 1 from public.participants pp where pp.id = p_convert and pp.type = '마음배송'
  ) then
    -- 마음배송 → 직접배달 전환하며 첫 승낙
    update public.participants
       set type = '직접배달', delivery_id = d_id, group_id = g.id,
           name = p_name, phone = p_phone, is_owner = true, updated_at = now()
     where id = p_convert
     returning id into pt_id;
  else
    insert into public.participants (delivery_id, group_id, type, name, phone, is_owner)
    values (d_id, g.id, '직접배달', p_name, p_phone, true)
    returning id into pt_id;
  end if;

  update public.groups set offer_delivery_id = d_id where id = g.id;
  return query select 'ok'::text, pt_id, d_id, 1;
end $$;
grant execute on function public.accept_group_offer(text, text, text, uuid) to anon;
