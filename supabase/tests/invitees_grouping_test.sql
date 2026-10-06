-- Fresh test DB only. No fixtures or notification rows survive this transaction.
\set ON_ERROR_STOP on
begin;
do $t$
declare
  a uuid; b uuid; c uuid; other_g uuid; new_g uuid := gen_random_uuid();
  failed_g uuid := gen_random_uuid(); token text := repeat('d', 32);
  result jsonb; original record; retried record;
begin
  insert into public.groups(name,slug) values ('다른 그룹','tst-grouping-other') returning id into other_g;
  insert into public.group_members(name,phone,invite_token_hash,invited_at)
    values ('그룹화 본인','010-1111-2222',public._token_hash(token),'2026-09-01') returning id into a;
  insert into public.group_members(name) values ('그룹화 동료') returning id into b;
  insert into public.group_members(name,group_id) values ('이미 소속됨',other_g) returning id into c;
  select * into original from public.create_delivery_v3(null,'그룹화 본인','','서울 강남구','2026-09-23','오후',null,p_invite_token=>token);

  -- A stale batch must not leave a new empty group or partially move anyone.
  begin
    perform public.admin_group_invitees(array[a,c],failed_g,'실패 그룹');
    raise exception 'expected stale selection failure';
  exception when others then if sqlerrm <> 'invitees_changed' then raise; end if; end;
  if exists(select 1 from public.groups where id=failed_g)
    or (select group_id from public.group_members where id=a) is not null then
    raise exception 'partial stale batch survived';
  end if;
  begin
    perform public.admin_group_invitees(array[a,gen_random_uuid()],failed_g,'실패 그룹');
    raise exception 'expected missing member failure';
  exception when others then if sqlerrm <> 'invitees_changed' then raise; end if; end;
  if exists(select 1 from public.groups where id=failed_g) then raise exception 'empty group survived'; end if;

  result := public.admin_group_invitees(array[a,b],new_g,' 친구들 ');
  if result->>'moved_count' <> '2' or result->'group'->>'name' <> '친구들' then
    raise exception 'incorrect grouping result: %', result;
  end if;
  if not exists(select 1 from public.group_members where id=a and group_id=new_g
    and name='그룹화 본인' and phone='010-1111-2222'
    and invite_token_hash=public._token_hash(token) and invited_at='2026-09-01'::timestamptz) then
    raise exception 'identity or issued link altered';
  end if;
  if not exists(select 1 from public.participants where id=original.participant_id
    and group_member_id=a and group_id is null and phone='010-1111-2222') then
    raise exception 'existing personal order altered';
  end if;
  if not exists(select 1 from public.deliveries d join public.participants p on p.delivery_id=d.id
    where p.id=original.participant_id and d.group_id is null) then
    raise exception 'existing delivery became a group order';
  end if;

  -- Retry safely after a lost response; existing-group mode also supports retry.
  result := public.admin_group_invitees(array[a,b],new_g,'친구들');
  if result->>'moved_count' <> '0' or result->>'assigned_count' <> '2' then raise exception 'retry duplicated move'; end if;
  result := public.admin_group_invitees(array[a,b],new_g);
  if result->>'moved_count' <> '0' then raise exception 'existing-group retry failed'; end if;
  insert into public.group_members(name) values ('추가 동료') returning id into b;
  result := public.admin_group_invitees(array[b],other_g);
  if (select group_id from public.group_members where id=b) <> other_g then raise exception 'existing group assignment failed'; end if;

  -- The already issued token still creates a personal order with the same identity.
  select * into retried from public.create_delivery_v3(null,'그룹화 본인','','서울 강남구','2026-09-24','오후',null,p_invite_token=>token);
  if not exists(select 1 from public.participants where id=retried.participant_id and group_member_id=a and group_id is null) then
    raise exception 'existing personal invite stopped working';
  end if;
  begin
    perform public.admin_group_invitees(array[a],failed_g);
    raise exception 'expected missing group failure';
  exception when others then if sqlerrm <> 'group_not_found' then raise; end if; end;
  begin
    perform public.admin_group_invitees(array[a,a],new_g);
    raise exception 'expected duplicate selection failure';
  exception when others then if sqlerrm <> 'invalid_grouping_request' then raise; end if; end;

  if has_function_privilege('anon','public.admin_group_invitees(uuid[],uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.admin_group_invitees(uuid[],uuid,text)','EXECUTE')
    or not has_function_privilege('service_role','public.admin_group_invitees(uuid[],uuid,text)','EXECUTE') then
    raise exception 'incorrect grouping permissions';
  end if;
end;
$t$;
rollback;
