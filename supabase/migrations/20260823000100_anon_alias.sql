-- 익명 별명: 공개 피드에서 '익명의 하객' 대신 "수줍은 펭귄" 같은 랜덤 별명 표시
-- - participants.anon_alias: 저장된 별명 (하객이 폼에서 고른 값 또는 id 기반 결정적 생성)
-- - 기존 마음배송 글은 전부 익명(display_mode='anon') + 별명 부여 (관리자는 실명 계속 확인)
-- - send_heart_v2 에 p_anon_alias 추가 (형식만 검증, 아니면 결정적 생성)

alter table public.participants add column if not exists anon_alias text;

create or replace function public._anon_alias(p_id uuid)
  returns text language sql immutable
as $$
  select (array['수줍은','용감한','행복한','다정한','느긋한','씩씩한','반짝이는','포근한','명랑한','상냥한',
                '든든한','조용한','설레는','유쾌한','귀여운','늠름한','사랑스러운','총총한','싱그러운','따뜻한'])
           [1 + ((('x' || substr(md5(p_id::text), 1, 8))::bit(32)::int) & 2147483647) % 20]
         || ' ' ||
         (array['펭귄','수달','다람쥐','고래','판다','코알라','토끼','고슴도치','사슴','여우',
                '햄스터','물개','부엉이','돌고래','알파카','거북이','오리','강아지','고양이','양'])
           [1 + ((('x' || substr(md5(p_id::text), 9, 8))::bit(32)::int) & 2147483647) % 20];
$$;

update public.participants set anon_alias = public._anon_alias(id)
 where type = '마음배송' and anon_alias is null;
update public.participants set display_mode = 'anon' where type = '마음배송';

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
             else coalesce(p.anon_alias, public._anon_alias(p.id))
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

drop function if exists public.send_heart_v2(uuid, text, text, text, text, text, text, boolean, boolean, text);
create or replace function public.send_heart_v2(
  p_group_id uuid, p_name text, p_region text, p_stamp text, p_message text,
  p_phone text default null,
  p_display_mode text default 'anon', p_is_private boolean default false,
  p_show_region boolean default true, p_attendance text default null,
  p_anon_alias text default null)
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
         attendance = p_attendance,
         anon_alias = case when p_anon_alias ~ '^[가-힣]{2,8} [가-힣]{1,6}$' then p_anon_alias
                           else public._anon_alias(pid) end
   where id = pid;
  tok := public._issue_manage_token(pid);
  return query select pid, tok;
end;
$$;
grant execute on function public.send_heart_v2(uuid, text, text, text, text, text, text, boolean, boolean, text, text) to anon;
