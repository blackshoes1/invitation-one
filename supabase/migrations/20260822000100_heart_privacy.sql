-- 마음 배송(축하 한마디) 공개 범위 + 참석 여부
-- - participants.display_mode: 공개 피드에서 이름 표시 방식 ('anon' 기본 · 'initial' 홍○동 · 'name' 실명)
-- - participants.is_private : true 면 방명록 피드·지도에서 제외 (신랑신부만 봄)
-- - participants.show_region: false 면 지역(핀) 비공개
-- - participants.attendance : 결혼식 참석 여부 (yes/maybe/no, 선택) — 공개 안 함, 관리자만
-- 관리자 화면은 항상 실명·원문. 공개 RPC(get_celebrations)에서만 마스킹/제외.
-- 기존 마음배송 행은 이전 규칙(실명 공개)으로 남긴 글이므로 display_mode='name' 으로 유지(관리자가 개별 전환 가능).

alter table public.participants
  add column if not exists display_mode text not null default 'anon'
    check (display_mode in ('name', 'initial', 'anon'));
alter table public.participants add column if not exists is_private boolean not null default false;
alter table public.participants add column if not exists show_region boolean not null default true;
alter table public.participants
  add column if not exists attendance text check (attendance in ('yes', 'maybe', 'no'));

update public.participants set display_mode = 'name' where type = '마음배송' and display_mode = 'anon';

-- 홍길동 → 홍○동, 김철 → 김○
create or replace function public._mask_name(n text)
  returns text language sql immutable
as $$
  select case
    when n is null or length(n) = 0 then '○'
    when length(n) = 1 then '○'
    when length(n) = 2 then left(n, 1) || '○'
    else left(n, 1) || repeat('○', length(n) - 2) || right(n, 1)
  end;
$$;

-- 공개 피드: 마음배송은 공개 설정 반영 (비공개 제외·이름 마스킹·지역 숨김). 직접배달 리뷰는 기존 그대로.
create or replace function public.get_celebrations()
  returns table (
    id uuid, kind text, name text, area text, date date,
    stamp text, message text, rating int, review text,
    reply text, replied_at timestamptz, created_at timestamptz
  )
  language sql security definer set search_path = public
as $$
  select p.id, p.type as kind,
         case when p.type = '마음배송' then
           case p.display_mode
             when 'name' then p.name
             when 'initial' then public._mask_name(p.name)
             else '익명의 하객'
           end
         else p.name end as name,
         case when p.type = '마음배송' then (case when p.show_region then p.region else null end)
              else (regexp_split_to_array(btrim(d.location), '\s+'))[1]
                   || coalesce(' ' || (regexp_split_to_array(btrim(d.location), '\s+'))[2], '')
         end as area,
         d.date,
         p.stamp, p.message, p.review_rating as rating, p.review_text as review,
         p.reply, p.replied_at,
         p.created_at
  from public.participants p
  left join public.deliveries d on d.id = p.delivery_id
  where (p.type = '마음배송' and not p.is_private)
     or (p.type = '직접배달' and d.status = '완료')
  order by p.created_at asc
  limit 300;
$$;
grant execute on function public.get_celebrations() to anon;

-- send_heart_v2: 공개 설정·참석 여부 인자 추가 (기본값 있음 → 기존 호출 호환). 구 시그니처 제거 후 재생성.
drop function if exists public.send_heart_v2(uuid, text, text, text, text, text);
create or replace function public.send_heart_v2(
  p_group_id uuid, p_name text, p_region text, p_stamp text, p_message text,
  p_phone text default null,
  p_display_mode text default 'anon', p_is_private boolean default false,
  p_show_region boolean default true, p_attendance text default null)
  returns table(participant_id uuid, manage_token text)
  language plpgsql security definer set search_path = public
as $$
declare pid uuid; tok text;
begin
  if coalesce(p_display_mode, 'anon') not in ('name', 'initial', 'anon') then raise exception 'display_mode_invalid'; end if;
  if p_attendance is not null and p_attendance not in ('yes', 'maybe', 'no') then raise exception 'attendance_invalid'; end if;
  pid := public.send_heart(p_group_id, p_name, p_region, p_stamp, p_message, p_phone);
  update public.participants
     set display_mode = coalesce(p_display_mode, 'anon'),
         is_private = coalesce(p_is_private, false),
         show_region = coalesce(p_show_region, true),
         attendance = p_attendance
   where id = pid;
  tok := public._issue_manage_token(pid);
  return query select pid, tok;
end;
$$;
grant execute on function public.send_heart_v2(uuid, text, text, text, text, text, text, boolean, boolean, text) to anon;
