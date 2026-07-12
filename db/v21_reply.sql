-- Supabase SQL Editor 에서 실행. (v20_delivery_geo.sql 이후)
-- ★ LC-3 방명록 공개 답글 ★
--   신랑·신부(관리자)가 축하 메시지에 남기는 공개 답글.
--   participants 에 reply/replied_at 컬럼을 추가하고, 공개 피드(get_celebrations)가
--   답글을 함께 내려주도록 확장. 답글 작성은 관리자 service_role 로만(직접 UPDATE),
--   anon 에게는 읽기(get_celebrations)만 노출.

/* ------------------------------------------------------------------ *
 * 1) 답글 컬럼
 * ------------------------------------------------------------------ */
alter table public.participants
  add column if not exists reply text,
  add column if not exists replied_at timestamptz;

/* ------------------------------------------------------------------ *
 * 2) 공개 피드 — 답글(reply/replied_at) 포함하도록 재정의
 *    (반환 컬럼이 늘어나므로 drop 후 재생성)
 * ------------------------------------------------------------------ */
drop function if exists public.get_celebrations();
create or replace function public.get_celebrations()
  returns table (
    id uuid, kind text, name text, area text, date date,
    stamp text, message text, rating int, review text,
    reply text, replied_at timestamptz, created_at timestamptz
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
         p.reply, p.replied_at,
         p.created_at
  from public.participants p
  left join public.deliveries d on d.id = p.delivery_id
  where p.type = '마음배송'
     or (p.type = '직접배달' and d.status = '완료')
  order by p.created_at asc
  limit 300;
$$;
grant execute on function public.get_celebrations() to anon;
