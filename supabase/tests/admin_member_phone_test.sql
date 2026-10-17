-- Disposable test database only. Fixtures and retention settings roll back together.
\set ON_ERROR_STOP on
begin;
-- The plain PostgreSQL test harness omits Supabase's standard service-role grants.
grant select,update on public.group_members,public.rsvp to service_role;
alter role service_role bypassrls;
do $$
declare
  g uuid; other_g uuid; scope uuid; prefix text; initial_phone text; changed_phone text; conflict_phone text;
  v_member uuid; unlinked_id uuid; peer_id uuid; rv uuid; blocker uuid; arrival_id uuid; challenge_id uuid;
  ticket text; guide_hash text; response public.group_members; before_member jsonb; before_rsvp jsonb;
  before_peer jsonb; before_arrival jsonb; before_attendance jsonb; before_count bigint;
  mutable_rsvp text[]:=array['phone','updated_at','guide_token_hash','guide_issued_at','guide_opened_at','guide_confirmed_at',
    'guide_sms_status','guide_sms_request_id','guide_sms_attempted_at','guide_sms_sent_at'];
begin
  update public.privacy_state set retention_until=now()+interval '1 day';
  insert into public.groups(name,slug) values('Member Phone Test','tst-member-phone') returning id into g;
  insert into public.groups(name,slug) values('Other Phone Test','tst-member-phone-other') returning id into other_g;

  foreach scope in array array[g,null::uuid] loop
    prefix:=case when scope is null then 'Solo Phone' else 'Group Phone' end;
    initial_phone:=case when scope is null then '010-7777-1001' else '010-7777-1002' end;
    changed_phone:=case when scope is null then '010-7777-2001' else '010-7777-2002' end;
    conflict_phone:=case when scope is null then '010-7777-3001' else '010-7777-3002' end;
    guide_hash:=case when scope is null then repeat('1',64) else repeat('2',64) end;
    ticket:=case when scope is null then repeat('3',64) else repeat('4',64) end;
    insert into public.rsvp(name,phone,side,attending,companion_count,companion_names,children,eating,memo,
      checkin_token,checkin_token_active,qr_issued_at,guide_token_hash,guide_issued_at,guide_opened_at,guide_confirmed_at,
      guide_sms_status,guide_sms_request_id,guide_sms_attempted_at,guide_sms_sent_at)
      values(prefix,regexp_replace(initial_phone,'\D','','g'),'bride',true,1,array['Saved Companion'],1,'yes','Saved RSVP',
        gen_random_uuid(),true,now()-interval '2 days',guide_hash,now()-interval '1 day',now()-interval '2 hours',now()-interval '1 hour',
        'accepted',gen_random_uuid(),now()-interval '1 day',now()-interval '1 day') returning id into rv;
    insert into public.group_members(group_id,name,phone,rsvp_id)
      values(scope,prefix,regexp_replace(initial_phone,'\D','','g'),rv) returning id into v_member;
    insert into public.group_members(group_id,name) values(scope,prefix||' Unlinked') returning id into unlinked_id;
    insert into public.group_members(group_id,name,phone) values(scope,prefix||' Peer',initial_phone) returning id into peer_id;
    insert into public.checkins(rsvp_id,name,party_size,actual_party_size,meal_count,source,checked_in_by)
      values(rv,prefix,2,2,1,'admin','test') returning id into arrival_id;
    if scope is not null then
      insert into public.group_attendance(member_id,group_id,attendance,share_with_group) values(v_member,g,'maybe',true);
    end if;
    insert into public.guest_identity_challenges(id,purpose,name_hash,phone_hash,code_hash,rsvp_id,eligible)
      values(gen_random_uuid(),'checkin',repeat('a',64),repeat('b',64),repeat('c',64),rv,true) returning id into challenge_id;
    insert into public.guest_identity_tickets(token_hash,purpose,name_hash,phone_hash,rsvp_id)
      values(ticket,'checkin',repeat('a',64),repeat('b',64),rv);
    select to_jsonb(m) into before_member from public.group_members m where m.id=v_member;
    select to_jsonb(r) into before_rsvp from public.rsvp r where r.id=rv;
    select to_jsonb(m) into before_peer from public.group_members m where m.id=peer_id;
    select to_jsonb(c) into before_arrival from public.checkins c where c.id=arrival_id;
    select jsonb_agg(to_jsonb(a) order by a.member_id) into before_attendance from public.group_attendance a
      where a.member_id in(v_member,unlinked_id,peer_id);

    if exists(select 1 from public.admin_update_member_phone_v1(other_g,v_member,changed_phone))
      or exists(select 1 from public.admin_update_member_phone_v1(case when scope is null then g else null end,v_member,changed_phone))
      or exists(select 1 from public.admin_update_member_phone_v1(scope,gen_random_uuid(),changed_phone))
      or (select to_jsonb(m) from public.group_members m where m.id=v_member) is distinct from before_member
      or (select to_jsonb(r) from public.rsvp r where r.id=rv) is distinct from before_rsvp then
      raise exception 'unknown member or wrong scope changed phone';
    end if;

    -- Formatting the same digits keeps guide history and existing identity proofs.
    set local role service_role;
    select * into response from public.admin_update_member_phone_v1(scope,v_member,initial_phone);
    reset role;
    if response.id is distinct from v_member or response.phone is distinct from initial_phone or response.rsvp_id is distinct from rv
      or (select to_jsonb(m)-'phone' from public.group_members m where m.id=v_member) is distinct from before_member-'phone'
      or not exists(select 1 from public.rsvp where id=rv and phone=initial_phone)
      or (select to_jsonb(r)-array['phone','updated_at'] from public.rsvp r where r.id=rv) is distinct from before_rsvp-array['phone','updated_at']
      or not exists(select 1 from public.guest_identity_tickets where token_hash=ticket)
      or not exists(select 1 from public.guest_identity_challenges where id=challenge_id) then
      raise exception 'format-only edit changed identity, guide history or linked RSVP';
    end if;

    -- Unlinked invitations update only their own roster row and create no RSVP.
    select count(*) into before_count from public.rsvp;
    select to_jsonb(m) into before_member from public.group_members m where m.id=v_member;
    select to_jsonb(r) into before_rsvp from public.rsvp r where r.id=rv;
    select * into response from public.admin_update_member_phone_v1(scope,unlinked_id,changed_phone);
    if response.id is distinct from unlinked_id or response.phone is distinct from changed_phone or response.rsvp_id is not null
      or (select count(*) from public.rsvp)<>before_count
      or (select to_jsonb(m) from public.group_members m where m.id=v_member) is distinct from before_member
      or (select to_jsonb(r) from public.rsvp r where r.id=rv) is distinct from before_rsvp
      or (select to_jsonb(m) from public.group_members m where m.id=peer_id) is distinct from before_peer then
      raise exception 'unlinked edit changed another invitation or created RSVP';
    end if;

    select * into response from public.admin_update_member_phone_v1(scope,v_member,changed_phone);
    if response.id is distinct from v_member or response.phone is distinct from changed_phone or response.rsvp_id is distinct from rv
      or not exists(select 1 from public.rsvp where id=rv and phone=changed_phone)
      or (select to_jsonb(r)-mutable_rsvp from public.rsvp r where r.id=rv) is distinct from before_rsvp-mutable_rsvp
      or exists(select 1 from public.rsvp where id=rv and (guide_token_hash is not null or guide_issued_at is not null
        or guide_opened_at is not null or guide_confirmed_at is not null or guide_sms_status is not null
        or guide_sms_request_id is not null or guide_sms_attempted_at is not null or guide_sms_sent_at is not null))
      or exists(select 1 from public.guest_identity_tickets where token_hash=ticket)
      or exists(select 1 from public.guest_identity_challenges where id=challenge_id) then
      raise exception 'real phone edit did not synchronize and invalidate only identity-dependent records';
    end if;

    -- Conflicts must roll back both phones and the invalidation triggers, without merging RSVPs.
    perform public.issue_guest_guide_v1(rv,prefix,regexp_replace(changed_phone,'\D','','g'),null,null,guide_hash,now());
    insert into public.guest_identity_challenges(id,purpose,name_hash,phone_hash,code_hash,rsvp_id,eligible)
      values(gen_random_uuid(),'checkin',repeat('a',64),repeat('b',64),repeat('c',64),rv,true) returning id into challenge_id;
    insert into public.guest_identity_tickets(token_hash,purpose,name_hash,phone_hash,rsvp_id)
      values(ticket,'checkin',repeat('a',64),repeat('b',64),rv);
    insert into public.rsvp(name,phone,side,attending) values(prefix,conflict_phone,'groom',true) returning id into blocker;
    select to_jsonb(m) into before_member from public.group_members m where m.id=v_member;
    select to_jsonb(r) into before_rsvp from public.rsvp r where r.id=rv;
    for before_count in 1..2 loop
      if before_count=2 then update public.rsvp set phone=regexp_replace(conflict_phone,'\D','','g') where id=blocker; end if;
      begin
        perform public.admin_update_member_phone_v1(scope,v_member,conflict_phone);
        raise exception 'same-name phone collision accepted';
      exception when unique_violation then null; end;
      if (select to_jsonb(m) from public.group_members m where m.id=v_member) is distinct from before_member
        or (select to_jsonb(r) from public.rsvp r where r.id=rv) is distinct from before_rsvp
        or not exists(select 1 from public.guest_identity_tickets where token_hash=ticket and rsvp_id=rv)
        or not exists(select 1 from public.guest_identity_challenges where id=challenge_id and rsvp_id=rv)
        or (select count(*) from public.rsvp where name=prefix)<>2 then
        raise exception 'phone collision partially changed or merged records';
      end if;
    end loop;

    select * into response from public.admin_update_member_phone_v1(scope,v_member,null);
    if response.id is distinct from v_member or response.phone is not null or response.rsvp_id is distinct from rv
      or not exists(select 1 from public.rsvp where id=rv and phone is null and guide_token_hash is null)
      or exists(select 1 from public.guest_identity_tickets where token_hash=ticket)
      or exists(select 1 from public.guest_identity_challenges where id=challenge_id) then
      raise exception 'blank edit did not clear both phones and invalidate old identity';
    end if;
    if (select to_jsonb(c) from public.checkins c where c.id=arrival_id) is distinct from before_arrival
      or (select count(*) from public.checkins where rsvp_id=rv)<>1
      or (select jsonb_agg(to_jsonb(a) order by a.member_id) from public.group_attendance a
        where a.member_id in(v_member,unlinked_id,peer_id)) is distinct from before_attendance
      or (select to_jsonb(m) from public.group_members m where m.id=peer_id) is distinct from before_peer then
      raise exception 'phone edit changed arrival, attendance sharing or another invitation';
    end if;
  end loop;

  if has_function_privilege('anon','public.admin_update_member_phone_v1(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.admin_update_member_phone_v1(uuid,uuid,text)','execute')
    or not has_function_privilege('service_role','public.admin_update_member_phone_v1(uuid,uuid,text)','execute') then
    raise exception 'phone update RPC is not service-only';
  end if;
end $$;
rollback;
