-- Disposable test database only. Every fixture and retention adjustment rolls back.
\set ON_ERROR_STOP on
begin;
do $$
declare
  g uuid; other_g uuid; scope uuid; prefix text; v_phone text; typed_phone text; roster_phone text; guide_hash text;
  new_member uuid; fallback_member uuid; attending_member uuid; declined_member uuid;
  new_rsvp uuid; fallback_rsvp uuid; attending_rsvp uuid; declined_rsvp uuid; arrival_id uuid; declined_arrival_id uuid;
  entry_token uuid; response record; saved_rsvp jsonb; saved_arrival jsonb; saved_declined_arrival jsonb;
  saved_attendance jsonb; arrivals_before bigint;
begin
  update public.privacy_state set retention_until=now()+interval '1 day';
  insert into public.groups(name,slug) values ('Admin Attend Test','tst-admin-attend') returning id into g;
  insert into public.groups(name,slug) values ('Other Attend Test','tst-admin-attend-other') returning id into other_g;

  -- The same contract applies to group members and individual invitations.
  foreach scope in array array[g,null::uuid] loop
    prefix:=case when scope is null then 'Solo Attend' else 'Group Attend' end;
    v_phone:=case when scope is null then '010-8080-1001' else '010-8080-1002' end;
    typed_phone:=case when scope is null then '010-8080-2001' else '010-8080-2002' end;
    roster_phone:=case when scope is null then '010-8080-3001' else '010-8080-3002' end;
    guide_hash:=case when scope is null then repeat('a',64) else repeat('b',64) end;
    insert into public.group_members(group_id,name) values(scope,prefix||' New') returning id into new_member;
    insert into public.group_members(group_id,name,phone)
      values(scope,prefix||' Fallback',roster_phone) returning id into fallback_member;
    insert into public.group_members(group_id,name,phone)
      values(scope,prefix||' Existing',v_phone) returning id into attending_member;
    insert into public.group_members(group_id,name,phone)
      values(scope,prefix||' Declined',v_phone) returning id into declined_member;
    if scope is not null then
      insert into public.group_attendance(member_id,group_id,attendance,share_with_group)
        values(new_member,g,'maybe',true);
    end if;
    select jsonb_agg(to_jsonb(a) order by a.member_id) into saved_attendance
      from public.group_attendance a where a.member_id in(new_member,fallback_member,attending_member,declined_member);

    -- A group id cannot target another group or a group-free invitation.
    begin
      perform public.admin_attend_member_v1(other_g,new_member,'groom',null,0,'{}');
      raise exception 'wrong group accepted';
    exception when raise_exception then if sqlerrm<>'member_not_found' then raise; end if; end;
    begin
      perform public.admin_attend_member_v1(case when scope is null then g else null end,new_member,'groom',null,0,'{}');
      raise exception 'group and solo scopes crossed';
    exception when raise_exception then if sqlerrm<>'member_not_found' then raise; end if; end;
    if (select rsvp_id from public.group_members where id=new_member) is not null then
      raise exception 'rejected scope changed member';
    end if;

    select count(*) into arrivals_before from public.checkins;
    select * into response from public.admin_attend_member_v1(scope,new_member,'groom',typed_phone,1,array['New Companion']);
    new_rsvp:=response.rsvp_id;
    if response.result<>'created' or not exists(select 1 from public.rsvp r
      where r.id=new_rsvp and r.name=prefix||' New' and r.attending and r.phone=typed_phone
        and r.side='groom' and r.companion_count=1 and r.companion_names=array['New Companion'])
      or not exists(select 1 from public.group_members where id=new_member and rsvp_id=new_rsvp and phone=typed_phone) then
      raise exception 'new attendee missing from guide-eligible RSVP list';
    end if;
    begin
      perform public.admin_attend_member_v1(scope,new_member,'bride',null,0,'{}');
      raise exception 'linked attendee registered twice';
    exception when raise_exception then if sqlerrm<>'already_registered' then raise; end if; end;
    if (select count(*) from public.rsvp where name=prefix||' New')<>1 then raise exception 'new attendee duplicated'; end if;
    if (select count(*) from public.checkins)<>arrivals_before then raise exception 'registration created arrival'; end if;
    select * into response from public.admin_attend_member_v1(scope,fallback_member,'bride',null,0,'{}');
    fallback_rsvp:=response.rsvp_id;
    if response.result<>'created' or not exists(select 1 from public.rsvp
      where id=fallback_rsvp and attending and phone=roster_phone)
      or not exists(select 1 from public.group_members where id=fallback_member and rsvp_id=fallback_rsvp and phone=roster_phone) then
      raise exception 'registration without a typed phone ignored the roster contact';
    end if;

    -- Linking an existing attendee preserves their reply, guide and arrival records.
    insert into public.rsvp(name,phone,side,attending,companion_count,companion_names,children,kids_meal,eating,memo,
      checkin_token,checkin_token_active,qr_issued_at,guide_token_hash,guide_issued_at,guide_opened_at,guide_confirmed_at,
      guide_sms_status,guide_sms_request_id,guide_sms_attempted_at,guide_sms_sent_at)
      values(prefix||' Existing',v_phone,'bride',true,2,array['Original A','Original B'],1,true,'no','Original reply',
        gen_random_uuid(),true,now()-interval '2 days',guide_hash,now()-interval '1 day',now()-interval '2 hours',now()-interval '1 hour',
        'accepted',gen_random_uuid(),now()-interval '1 day',now()-interval '1 day') returning id into attending_rsvp;
    insert into public.checkins(rsvp_id,name,party_size,actual_party_size,meal_count,source,checked_in_by)
      values(attending_rsvp,prefix||' Existing',3,3,2,'admin','test') returning id into arrival_id;
    select to_jsonb(r)-'updated_at' into saved_rsvp from public.rsvp r where r.id=attending_rsvp;
    select to_jsonb(c) into saved_arrival from public.checkins c where c.id=arrival_id;
    select count(*) into arrivals_before from public.checkins;
    select * into response from public.admin_attend_member_v1(scope,attending_member,'groom',v_phone,0,'{}');
    if response.result<>'linked' or response.rsvp_id is distinct from attending_rsvp
      or (select rsvp_id from public.group_members where id=attending_member) is distinct from attending_rsvp
      or (select to_jsonb(r)-'updated_at' from public.rsvp r where r.id=attending_rsvp) is distinct from saved_rsvp
      or (select to_jsonb(c) from public.checkins c where c.id=arrival_id) is distinct from saved_arrival then
      raise exception 'existing attendee details changed while linking';
    end if;

    -- A declined matching RSVP is restored in place and becomes a guide recipient.
    entry_token:=gen_random_uuid();
    insert into public.rsvp(name,phone,side,attending,companion_count,companion_names,children,kids_meal,eating,memo,
      checkin_token,checkin_token_active,qr_issued_at)
      values(prefix||' Declined',v_phone,'bride',false,2,array['Saved A','Saved B'],1,true,'no','Saved declined reply',
        entry_token,false,now()-interval '3 days') returning id into declined_rsvp;
    insert into public.checkins(rsvp_id,name,party_size,actual_party_size,meal_count,source,status,canceled_at,checked_in_by)
      values(declined_rsvp,prefix||' Declined',3,3,2,'admin','canceled',now()-interval '1 day','test') returning id into declined_arrival_id;
    select to_jsonb(c) into saved_declined_arrival from public.checkins c where c.id=declined_arrival_id;
    select count(*) into arrivals_before from public.checkins;
    select to_jsonb(r)-array['updated_at','attending','side','companion_count','companion_names'] into saved_rsvp
      from public.rsvp r where r.id=declined_rsvp;
    select * into response from public.admin_attend_member_v1(scope,declined_member,'groom',v_phone,1,array['New Saved Companion']);
    if response.rsvp_id is distinct from declined_rsvp
      or (select rsvp_id from public.group_members where id=declined_member) is distinct from declined_rsvp
      or not exists(select 1 from public.rsvp where id=declined_rsvp and attending and side='groom'
        and companion_count=1 and companion_names=array['New Saved Companion'])
      or (select to_jsonb(r)-array['updated_at','attending','side','companion_count','companion_names']
        from public.rsvp r where r.id=declined_rsvp) is distinct from saved_rsvp then
      raise exception 'matching declined RSVP was not restored with the submitted attendance details';
    end if;
    perform public.issue_guest_guide_v1(declined_rsvp,prefix||' Declined',regexp_replace(v_phone,'\D','','g'),null,null,
      case when scope is null then repeat('c',64) else repeat('d',64) end,now());
    if not exists(select 1 from public.rsvp where id=declined_rsvp and attending and guide_token_hash is not null
      and guide_opened_at is null and guide_confirmed_at is null) then
      raise exception 'restored attendee cannot prepare a guide';
    end if;

    -- Only an explicit registration restores a linked decline; stale count edits cannot.
    update public.rsvp set attending=false where id=declined_rsvp;
    update public.group_members set phone=roster_phone where id=declined_member;
    if exists(select 1 from public.rsvp where id=declined_rsvp and guide_token_hash is not null) then
      raise exception 'attendance change did not revoke the previous guide';
    end if;
    begin
      perform public.admin_update_attend_v1(scope,declined_member,'groom',0,'{}');
      raise exception 'ordinary count update restored a decline';
    exception when raise_exception then if sqlerrm<>'not_attending' then raise; end if; end;
    begin
      perform public.admin_attend_member_v1(other_g,declined_member,'groom',v_phone,0,'{}');
      raise exception 'wrong group accepted attendance restoration';
    exception when raise_exception then if sqlerrm<>'member_not_found' then raise; end if; end;
    select to_jsonb(r)-array['updated_at','attending','side','companion_count','companion_names','phone'] into saved_rsvp
      from public.rsvp r where r.id=declined_rsvp;
    select * into response from public.admin_attend_member_v1(scope,declined_member,'bride','010-9999-9999',2,array['Changed A','Changed B']);
    if response.rsvp_id is distinct from declined_rsvp
      or not exists(select 1 from public.rsvp where id=declined_rsvp and attending and checkin_token=entry_token
        and side='bride' and companion_count=2 and companion_names=array['Changed A','Changed B'] and phone=roster_phone)
      or not exists(select 1 from public.group_members where id=declined_member and rsvp_id=declined_rsvp and phone=roster_phone)
      or (select to_jsonb(r)-array['updated_at','attending','side','companion_count','companion_names','phone']
        from public.rsvp r where r.id=declined_rsvp) is distinct from saved_rsvp then
      raise exception 'linked declined RSVP identity or details changed';
    end if;
    perform public.issue_guest_guide_v1(declined_rsvp,prefix||' Declined',regexp_replace(roster_phone,'\D','','g'),null,null,
      case when scope is null then repeat('e',64) else repeat('f',64) end,now());
    begin
      perform public.admin_attend_member_v1(scope,declined_member,'groom',v_phone,0,'{}');
      raise exception 'restored attendee registered twice';
    exception when raise_exception then if sqlerrm<>'already_registered' then raise; end if; end;

    if (select count(*) from public.rsvp where name=prefix||' Declined')<>1
      or (select count(*) from public.rsvp where name=prefix||' Existing' and phone=v_phone)<>1 then
      raise exception 'existing RSVP duplicated';
    end if;
    if (select count(*) from public.checkins)<>arrivals_before
      or (select to_jsonb(c) from public.checkins c where c.id=arrival_id) is distinct from saved_arrival
      or (select to_jsonb(c) from public.checkins c where c.id=declined_arrival_id) is distinct from saved_declined_arrival
      or exists(select 1 from public.checkins where rsvp_id in(new_rsvp,fallback_rsvp)) then
      raise exception 'attendance registration changed arrival records';
    end if;
    if (select jsonb_agg(to_jsonb(a) order by a.member_id) from public.group_attendance a
      where a.member_id in(new_member,fallback_member,attending_member,declined_member)) is distinct from saved_attendance then
      raise exception 'registration fabricated attendance responses or group sharing';
    end if;
  end loop;
end $$;
rollback;
