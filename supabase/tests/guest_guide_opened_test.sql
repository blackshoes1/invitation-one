-- Disposable test database only: all fixture data and clock controls roll back.
begin;
do $$
declare v_id uuid; unopened_id uuid; hash text:=repeat('8',64); unopened_hash text:=repeat('9',64);
  guest record; first_open timestamptz; confirmation timestamptz; before_logs bigint;
begin
  update privacy_state set retention_until=now()+interval '1 day';
  insert into rsvp(name,phone,side,attending,checkin_token)
    values('Guide Open Test','010-9191-8383','groom',true,gen_random_uuid()) returning id into v_id;
  perform issue_guest_guide_v1(v_id,'Guide Open Test','01091918383',null,null,hash,now());
  set local role service_role;
  select * into guest from public.open_guest_guide_v1(hash);
  reset role;
  if guest.name<>'Guide Open Test' or guest.opened_at is null or guest.confirmed_at is not null then
    raise exception 'opening did not record only the link opening';
  end if;
  if exists(select 1 from checkins where rsvp_id=v_id) then raise exception 'opening created arrival'; end if;

  -- Force a distinct timestamp to prove repeat opens preserve the first value.
  first_open:=guest.opened_at-interval '1 hour';
  update rsvp set guide_opened_at=first_open where id=v_id;
  select count(*) into before_logs from privacy_access_log where action='data_update' and resource='rsvp';
  select * into guest from open_guest_guide_v1(hash);
  if guest.opened_at<>first_open or guest.confirmed_at is not null then raise exception 'repeat opening changed state'; end if;
  if (select count(*) from privacy_access_log where action='data_update' and resource='rsvp')<>before_logs then
    raise exception 'repeat opening emitted a data update';
  end if;

  -- Only replace the uncontrollable confirmation opening date inside this fixture.
  execute replace(pg_get_functiondef('confirm_guest_guide_v1(text)'::regprocedure),'2026-10-15 00:00:00+09','2000-01-01 00:00:00+09');
  confirmation:=confirm_guest_guide_v1(hash);
  select * into guest from open_guest_guide_v1(hash);
  if guest.opened_at<>first_open or guest.confirmed_at<>confirmation then raise exception 'confirmation changed first opening'; end if;
  if exists(select 1 from checkins where rsvp_id=v_id) then raise exception 'guide events created arrival'; end if;

  -- Confirmation remains independent: it does not invent an opening timestamp.
  insert into rsvp(name,phone,side,attending) values('Guide Confirm Test','010-9191-8484','bride',true) returning id into unopened_id;
  perform issue_guest_guide_v1(unopened_id,'Guide Confirm Test','01091918484',null,null,unopened_hash,now());
  perform confirm_guest_guide_v1(unopened_hash);
  if (select guide_opened_at from rsvp where id=unopened_id) is not null then raise exception 'confirmation backfilled opening'; end if;

  -- Anonymous/public and signed-in client roles cannot use the new RPC.
  if has_function_privilege('anon','public.open_guest_guide_v1(text)','execute')
     or has_function_privilege('authenticated','public.open_guest_guide_v1(text)','execute') then raise exception 'client can open guide RPC'; end if;
  if not has_function_privilege('service_role','public.open_guest_guide_v1(text)','execute') then raise exception 'service cannot open guide RPC'; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid='public.open_guest_guide_v1(text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'public can open guide RPC'; end if;

  update rsvp set phone='01091918383' where id=v_id;
  if (select guide_opened_at from rsvp where id=v_id)<>first_open then raise exception 'phone formatting reset opening'; end if;
  update rsvp set name='Guide Renamed Test' where id=v_id;
  if not exists(select 1 from rsvp where id=v_id and guide_token_hash is null and guide_opened_at is null and guide_confirmed_at is null) then raise exception 'name change did not revoke opening'; end if;
  begin perform open_guest_guide_v1(hash); raise exception 'revoked link accepted';
  exception when raise_exception then if sqlerrm<>'invalid_token' then raise; end if; end;

  perform issue_guest_guide_v1(v_id,'Guide Renamed Test','01091918383',null,null,hash,now());
  perform open_guest_guide_v1(hash);
  update rsvp set phone='010-9191-8585' where id=v_id;
  if (select guide_opened_at from rsvp where id=v_id) is not null then raise exception 'phone change did not reset opening'; end if;
  perform issue_guest_guide_v1(v_id,'Guide Renamed Test','01091918585',null,null,hash,now());
  perform open_guest_guide_v1(hash);
  update rsvp set attending=false where id=v_id;
  if (select guide_opened_at from rsvp where id=v_id) is not null then raise exception 'attendance change did not reset opening'; end if;
  -- Even a stale hash on a non-attending row cannot be used.
  update rsvp set guide_token_hash=hash where id=v_id;
  begin perform open_guest_guide_v1(hash); raise exception 'non-attendee link accepted';
  exception when raise_exception then if sqlerrm<>'invalid_token' then raise; end if; end;
  begin perform open_guest_guide_v1(repeat('0',64)); raise exception 'invalid link accepted';
  exception when raise_exception then if sqlerrm<>'invalid_token' then raise; end if; end;
  begin perform open_guest_guide_v1(null); raise exception 'null link accepted';
  exception when raise_exception then if sqlerrm<>'invalid_token' then raise; end if; end;

  update privacy_state set retention_until=now();
  begin perform open_guest_guide_v1(unopened_hash); raise exception 'opening after retention accepted';
  exception when raise_exception then if sqlerrm<>'collection_closed' then raise; end if; end;
end $$;
rollback;
