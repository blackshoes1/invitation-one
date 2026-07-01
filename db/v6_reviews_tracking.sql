-- Supabase SQL Editor 에서 실행. (v5_rsvp.sql 이후)
-- 배송 추적 4단계(tracking_stage) + 배송 완료 후 리뷰(별점/한줄).
-- + 모바일 청첩장 "축하해준 사람들" 공개 피드/지도/본인확인 RPC.

/* ------------------------------------------------------------------ *
 * 1) 컬럼 추가
 *  - tracking_stage: status 와 별개인 "재미" 추적 단계 (Admin 이 수동 전환)
 *      주문접수 → 준비중 → 배송출발 → 배송완료
 *  - review_rating / review_text: 배송 완료 후 하객이 남기는 공개 리뷰
 * ------------------------------------------------------------------ */
alter table public.deliveries
  add column if not exists tracking_stage text not null default '주문접수',
  add column if not exists review_rating int,
  add column if not exists review_text text;

alter table public.deliveries drop constraint if exists deliveries_tracking_stage_check;
alter table public.deliveries
  add constraint deliveries_tracking_stage_check
  check (tracking_stage in ('주문접수', '준비중', '배송출발', '배송완료'));

alter table public.deliveries drop constraint if exists deliveries_review_rating_check;
alter table public.deliveries
  add constraint deliveries_review_rating_check
  check (review_rating is null or review_rating between 1 and 5);

/* ------------------------------------------------------------------ *
 * 2) get_delivery 확장 — 취소/변경·추적·리뷰 페이지가 한 번에 사용
 * ------------------------------------------------------------------ */
create or replace function public.get_delivery(p_id uuid)
  returns table (
    id uuid, group_id uuid, name text, location text,
    date date, time_slot text, party_size int, status text,
    tracking_stage text, review_rating int, review_text text
  )
  language sql security definer set search_path = public
as $$
  select id, group_id, name, location, date, time_slot, party_size, status,
         tracking_stage, review_rating, review_text
  from public.deliveries where id = p_id;
$$;
grant execute on function public.get_delivery(uuid) to anon;

/* ------------------------------------------------------------------ *
 * 3) 리뷰 등록 — 배송 완료(status='완료') 건에 대해서만 허용
 *   반환: 'ok' | 'rating'(별점 범위 오류) | 'not_ready'(완료 전/없음)
 * ------------------------------------------------------------------ */
create or replace function public.submit_review(
  p_id uuid, p_rating int, p_text text
) returns text
  language plpgsql security definer set search_path = public
as $$
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return 'rating';
  end if;

  update public.deliveries
     set review_rating = p_rating,
         review_text   = nullif(btrim(coalesce(p_text, '')), ''),
         updated_at    = now()
   where id = p_id and status = '완료';

  if not found then
    return 'not_ready';
  end if;
  return 'ok';
end;
$$;
grant execute on function public.submit_review(uuid, int, text) to anon;

/* ------------------------------------------------------------------ *
 * 4) 공개 리뷰 피드 — 청첩장 "축하해준 사람들"(메시지 뷰) + 배달 페이지 리뷰
 *   연락처·정확한 주소는 노출하지 않음. 이름/별점/한줄/시각만.
 * ------------------------------------------------------------------ */
create or replace function public.get_public_reviews()
  returns table (name text, review_rating int, review_text text, created_at timestamptz)
  language sql security definer set search_path = public
as $$
  select name, review_rating, review_text, created_at
  from public.deliveries
  where review_rating is not null and status = '완료'
  order by created_at desc
  limit 100;
$$;
grant execute on function public.get_public_reviews() to anon;

/* ------------------------------------------------------------------ *
 * 5) 배송 여정 지도 핀 — 배송 완료 건. 주소는 앞 2토막(시/구·동)까지만.
 *   예: "서울 용산구 서빙고로 137 101동" → "서울 용산구"
 * ------------------------------------------------------------------ */
create or replace function public.get_journey_pins()
  returns table (name text, date date, area text, created_at timestamptz)
  language sql security definer set search_path = public
as $$
  select
    name,
    date,
    (regexp_split_to_array(btrim(location), '\s+'))[1]
      || coalesce(' ' || (regexp_split_to_array(btrim(location), '\s+'))[2], '') as area,
    created_at
  from public.deliveries
  where status = '완료'
  order by created_at asc
  limit 200;
$$;
grant execute on function public.get_journey_pins() to anon;

/* ------------------------------------------------------------------ *
 * 6) 본인 확인 — QR 로 들어온 하객이 (이름 + 전화 끝4)로 조회.
 *   - 1건 매칭: 바로 인증. rank = 배송 완료 순서(N번째 손님, 미완료면 null)
 *   - 2건 이상(동명이인+끝4 우연 일치): p_ymd(청모 날짜)로 추가 구분
 *   반환 rows: 매칭된 건들. 프론트에서 개수로 분기.
 * ------------------------------------------------------------------ */
create or replace function public.verify_guest(
  p_name text, p_last4 text, p_ymd date default null
) returns table (
  name text, date date, time_slot text, status text,
  tracking_stage text, review_rating int, guest_no int
)
  language sql security definer set search_path = public
as $$
  with completed as (
    select id, row_number() over (order by created_at asc) as guest_no
    from public.deliveries
    where status = '완료'
  )
  select d.name, d.date, d.time_slot, d.status,
         d.tracking_stage, d.review_rating,
         c.guest_no::int
  from public.deliveries d
  left join completed c on c.id = d.id
  where d.status <> '취소'
    and btrim(d.name) = btrim(p_name)
    and right(regexp_replace(d.phone, '\D', '', 'g'), 4) = p_last4
    and (p_ymd is null or d.date = p_ymd)
  order by d.date;
$$;
grant execute on function public.verify_guest(text, text, date) to anon;
