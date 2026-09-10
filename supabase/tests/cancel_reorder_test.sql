-- Local CI database only. Preserve cancellation history while accepting the same invite again.
\set ON_ERROR_STOP on
begin;
do $$
declare
  g uuid; m uuid; first_order record; second_order record;
  token text := repeat('e', 32); before_count int;
begin
  insert into public.groups(name,slug) values ('재신청검증','tst-cancel-reorder') returning id into g;
  insert into public.group_members(group_id,name,phone,invite_token_hash)
    values(g,'재신청하객','010-1111-2222',public._token_hash(token)) returning id into m;
  before_count := public.get_delivery_guest_count();
  select * into first_order from public.create_delivery_v3(null,'재신청하객','','서울 강남구','2026-09-28','저녁',null,p_invite_token=>token);
  -- Same mutation as the admin status endpoint, including hidden history.
  update public.deliveries set status='취소', hidden=true where id=first_order.delivery_id;
  if public.get_delivery_guest_count() <> before_count then raise exception 'cancelled order still consumes capacity'; end if;
  select * into second_order from public.create_delivery_v3(null,'재신청하객','','서울 강남구','2026-09-28','저녁',null,p_invite_token=>token);
  if second_order.delivery_id = first_order.delivery_id
     or second_order.participant_id = first_order.participant_id
     or second_order.manage_token is null then raise exception 'reorder did not create a fresh order'; end if;
  if not exists(select 1 from public.participants where id=second_order.participant_id and group_member_id=m and group_id is null and phone='010-1111-2222')
     or not exists(select 1 from public.participants where id=first_order.participant_id) then
    raise exception 'identity or cancellation history lost';
  end if;
  if public.get_delivery_guest_count() <> before_count+1 then raise exception 'reorder capacity incorrect'; end if;
end $$;
rollback;
