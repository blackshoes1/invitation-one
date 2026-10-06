-- Fresh CI database only; the main-page form reuses the existing heart transaction.
begin;
do $$
declare r record; private_r record;
begin
  select * into r from public.send_heart_v3(null,'방명록실명','지역 미입력','💌','지역 없이 축하',
    p_display_mode=>'anon',p_show_region=>false);
  if not exists(select 1 from public.get_celebrations() where id=r.participant_id and area is null
    and name <> '방명록실명' and message='지역 없이 축하') then raise exception 'anonymous guestbook visibility failed'; end if;
  if not exists(select 1 from public.participants where id=r.participant_id and group_id is null
    and delivery_id is null and phone is null and attendance is null) then raise exception 'guestbook changed order data'; end if;
  select * into private_r from public.send_heart_v3(null,'비공개실명','서울 강남구','💌','두 사람에게만',
    p_display_mode=>'anon',p_is_private=>true,p_show_region=>true);
  if exists(select 1 from public.get_celebrations() where id=private_r.participant_id) then
    raise exception 'private guestbook message leaked'; end if;
end;
$$;
rollback;
