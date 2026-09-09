-- Fresh test DB only (scripts/db-verify.sh). Fixtures and failure trigger are rolled back.
\set ON_ERROR_STOP on
begin;

create function pg_temp.reject_member_link() returns trigger language plpgsql as $$
begin
  if current_setting('test.reject_member_link', true) = 'on' then
    raise exception 'forced_member_link_failure';
  end if;
  return new;
end;
$$;
create trigger test_reject_member_link before update of group_member_id on public.participants
for each row execute function pg_temp.reject_member_link();

do $t$
declare
  g uuid; other_g uuid; member_a uuid; member_b uuid; join_id uuid;
  token_a text := repeat('a',32); token_b text := repeat('b',32);
  r record; converted record; op text; n_participants int; n_deliveries int; n_outbox int;
begin
  insert into public.groups(name,slug,offer_date,offer_time,offer_location)
    values ('원자성검증','tst-invite-atomic','2026-09-25','오후','서울 강남구') returning id into g;
  insert into public.groups(name,slug) values ('다른모임','tst-invite-other') returning id into other_g;
  insert into public.group_members(group_id,name,phone,invite_token_hash)
    values(g,'초대본인','010-1111-2222',public._token_hash(token_a)) returning id into member_a;
  insert into public.group_members(group_id,name,phone,invite_token_hash)
    values(g,'다른사람','010-3333-4444',public._token_hash(token_b)) returning id into member_b;
  insert into public.deliveries(group_id,location,date,time_slot)
    values(g,'서울 강남구','2026-09-24','오후') returning id into join_id;

  -- Every path must roll back the participant, order and notification when linking fails.
  foreach op in array array['create','join','accept','heart'] loop
    select count(*) into n_participants from public.participants;
    select count(*) into n_deliveries from public.deliveries;
    select count(*) into n_outbox from public.notification_outbox;
    perform set_config('test.reject_member_link','on',true);
    begin
      case op
        when 'create' then perform public.create_delivery_v3(null,'초대본인','','서울 강남구','2026-09-23','오후',null,p_invite_token=>token_a);
        when 'join' then perform public.join_delivery_v2(join_id,'초대본인','',p_invite_token=>token_a);
        when 'accept' then perform public.accept_group_offer_v2('tst-invite-atomic','초대본인','',p_invite_token=>token_a);
        when 'heart' then perform public.send_heart_v3(null,'위조이름','서울 강남구','💌','축하',p_invite_token=>token_a);
      end case;
      raise exception 'expected link failure for %',op;
    exception when others then
      if sqlerrm <> 'forced_member_link_failure' then raise; end if;
    end;
    if (select count(*) from public.participants) <> n_participants
       or (select count(*) from public.deliveries) <> n_deliveries
       or (select count(*) from public.notification_outbox) <> n_outbox
       or (select offer_delivery_id from public.groups where id=g) is not null then
      raise exception 'partial save survived: %',op;
    end if;
    perform set_config('test.reject_member_link','off',true);
  end loop;

  -- Successful retries create linked records, with no duplicate left by failed attempts.
  select * into r from public.create_delivery_v3(null,'초대본인','','서울 강남구','2026-09-23','오후',null,p_invite_token=>token_a);
  if not exists(select 1 from public.participants where id=r.participant_id and group_member_id=member_a and group_id is null and phone='010-1111-2222') then
    raise exception 'personal delivery identity/phone/order kind lost';
  end if;
  select * into r from public.join_delivery_v2(join_id,'초대본인','010-9999-8888',p_invite_token=>token_a);
  if not exists(select 1 from public.participants where id=r.participant_id and group_member_id=member_a and phone='010-9999-8888') then
    raise exception 'join link or explicit phone lost';
  end if;
  select * into r from public.accept_group_offer_v2('tst-invite-atomic','초대본인','',p_invite_token=>token_a);
  if not exists(select 1 from public.participants where id=r.participant_id and group_member_id=member_a and group_id=g) then
    raise exception 'offer link lost';
  end if;
  select * into r from public.send_heart_v3(null,'위조이름','서울 강남구','💌','축하',p_is_private=>true,p_show_region=>false,p_invite_token=>token_a);
  if not exists(select 1 from public.participants where id=r.participant_id and group_member_id=member_a and name='초대본인' and phone='010-1111-2222' and is_private and not show_region and display_mode='anon') then
    raise exception 'heart identity/privacy lost';
  end if;

  -- A different invite must not steal a heart record when converting it into a delivery.
  begin
    perform public.create_delivery_v3(null,'다른사람','','서울 강남구','2026-09-26','오후',null,r.manage_token,p_invite_token=>token_b);
    raise exception 'expected conversion identity rejection';
  exception when others then
    if sqlerrm <> 'invite_identity_mismatch' then raise; end if;
  end;
  if not exists(select 1 from public.participants where id=r.participant_id and type='마음배송' and group_member_id=member_a) then
    raise exception 'failed conversion altered the original heart';
  end if;
  select * into converted from public.create_delivery_v3(null,'초대본인','','서울 강남구','2026-09-26','오후',null,r.manage_token,p_invite_token=>token_a);
  if converted.participant_id <> r.participant_id then raise exception 'conversion duplicated participant'; end if;

  -- Revoked and mismatched tokens are rechecked inside the database, even with a supplied phone.
  update public.group_members set invite_token_hash=public._token_hash(repeat('c',32)) where id=member_a;
  begin
    perform public.create_delivery_v3(null,'초대본인','010-1111-2222','서울 강남구','2026-09-27','오후',null,p_invite_token=>token_a);
    raise exception 'revoked token accepted';
  exception when others then if sqlerrm <> 'invite_invalid' then raise; end if; end;
  begin
    perform public.send_heart_v3(other_g,'다른사람','서울 강남구','💌',null,p_invite_token=>token_b);
    raise exception 'wrong group accepted';
  exception when others then if sqlerrm <> 'invite_group_mismatch' then raise; end if; end;

  -- Groupless invites and ordinary guests remain supported; heart phone remains optional.
  update public.group_members set group_id=null where id=member_b;
  select * into r from public.send_heart_v3(null,'ignored','서울 강남구','💌',null,p_invite_token=>token_b);
  if not exists(select 1 from public.participants where id=r.participant_id and group_member_id=member_b and group_id is null) then raise exception 'groupless invite failed'; end if;
  select * into r from public.send_heart_v3(null,'일반하객','서울 강남구','💌',null);
  if not exists(select 1 from public.participants where id=r.participant_id and group_member_id is null and phone is null) then raise exception 'ordinary heart failed'; end if;
  select * into r from public.create_delivery_v3(null,'일반하객','010-5555-6666','서울 강남구','2026-09-27','오후',null);
  if not exists(select 1 from public.participants where id=r.participant_id and group_member_id is null) then raise exception 'ordinary delivery failed'; end if;

  if has_function_privilege('anon','public.send_heart_v3(uuid,text,text,text,text,text,text,boolean,boolean,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.send_heart_v3(uuid,text,text,text,text,text,text,boolean,boolean,text,text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.send_heart_v3(uuid,text,text,text,text,text,text,boolean,boolean,text,text,text)','EXECUTE')
    or has_function_privilege('service_role','public._link_submission_member(uuid,uuid)','EXECUTE') then
    raise exception 'incorrect RPC privileges';
  end if;
end;
$t$;
rollback;
