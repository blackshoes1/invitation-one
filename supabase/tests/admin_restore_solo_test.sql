\set ON_ERROR_STOP on
begin;
do $$
declare m uuid; r jsonb; retry jsonb; d uuid; next_d uuid; token_hash text := public._token_hash(repeat('8',32));
begin
  insert into public.group_members(name,phone,invite_token_hash)
    values('개인검증',null,token_hash) returning id into m;
  r := public.admin_create_solo_order_v1('test-solo-create',m,'서울 강남구','2026-09-28','저녁',null,'신부');
  d := (r->>'delivery_id')::uuid;
  retry := public.admin_create_solo_order_v1('test-solo-create',m,'서울 강남구','2026-09-28','저녁',null,'신부');
  if retry->>'delivery_id' <> d::text or not (retry->>'reused')::boolean then raise exception 'retry duplicated'; end if;
  if not exists(select 1 from public.participants where delivery_id=d and group_member_id=m and group_id is null and is_owner)
    or not exists(select 1 from public.notification_outbox o join public.participants p on p.id=o.participant_id
      where p.delivery_id=d and o.status='skipped') then raise exception 'identity or notification suppression failed'; end if;
  begin
    perform public.admin_create_solo_order_v1('test-solo-duplicate',m,'서울 강남구','2026-09-28','저녁',null,'신부');
    raise exception 'duplicate allowed';
  exception when others then if sqlerrm <> 'already_ordered' then raise; end if; end;
  update public.deliveries set status='취소',hidden=true,tracking_stage='배송출발' where id=d;
  if public.admin_restore_order_v1(d) <> 'ok' then raise exception 'restore failed'; end if;
  if not exists(select 1 from public.deliveries where id=d and status='대기중' and not hidden and tracking_stage='주문접수')
    or public.admin_restore_order_v1(d) <> 'already_restored' then raise exception 'restore state/idempotency failed'; end if;
  update public.deliveries set status='취소' where id=d;
  insert into public.blocked_dates(date) values('2026-09-28') on conflict do nothing;
  if public.admin_restore_order_v1(d) <> 'blocked' then raise exception 'blocked date restored'; end if;
  delete from public.blocked_dates where date='2026-09-28';
  r := public.admin_create_solo_order_v1('test-solo-reorder',m,'서울 서초구','2026-09-29','저녁',null,'신랑');
  next_d := (r->>'delivery_id')::uuid;
  if public.admin_restore_order_v1(d) <> 'conflict' then raise exception 'reapplication conflict ignored'; end if;
  if (select invite_token_hash from public.group_members where id=m) <> token_hash then raise exception 'invitation changed'; end if;
  if has_function_privilege('anon','public.admin_restore_order_v1(uuid)','execute')
    or has_function_privilege('authenticated','public.admin_create_solo_order_v1(text,uuid,text,date,text,text,text)','execute') then
    raise exception 'public admin access';
  end if;
end $$;
rollback;
