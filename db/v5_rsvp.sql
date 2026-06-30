-- Supabase SQL Editor 에서 실행. (이전 db 파일들 이후)
-- 참석 의사 전하기(RSVP) 개편 + 중복 방지/수정

alter table public.rsvp
  add column if not exists phone text,
  add column if not exists children int not null default 0,
  add column if not exists kids_meal boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- (이름 + 연락처) 중복 방지
create unique index if not exists rsvp_name_phone_uniq
  on public.rsvp (name, phone);

-- 삽입 또는 (이름,연락처) 충돌 시 수정. 'inserted' / 'updated' 반환
create or replace function public.submit_rsvp(
  p_name text,
  p_phone text,
  p_side text,
  p_attending boolean,
  p_companions int,
  p_children int,
  p_kids_meal boolean,
  p_meal text,
  p_memo text
) returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare existed boolean;
begin
  select exists(
    select 1 from public.rsvp where name = p_name and phone = p_phone
  ) into existed;

  insert into public.rsvp(
    name, phone, side, attending, companion_count, children, kids_meal, eating, memo
  ) values (
    p_name, p_phone, p_side, p_attending, p_companions, p_children, p_kids_meal, p_meal, p_memo
  )
  on conflict (name, phone) do update set
    side = excluded.side,
    attending = excluded.attending,
    companion_count = excluded.companion_count,
    children = excluded.children,
    kids_meal = excluded.kids_meal,
    eating = excluded.eating,
    memo = excluded.memo,
    updated_at = now();

  return case when existed then 'updated' else 'inserted' end;
end;
$$;
grant execute on function public.submit_rsvp(
  text, text, text, boolean, int, int, boolean, text, text
) to anon;

-- (후순위) 당일 전달 기록용 컬럼
alter table public.deliveries
  add column if not exists met_photo_url text,
  add column if not exists met_at timestamptz;
