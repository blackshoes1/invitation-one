-- Apply before the application update. Existing delivery signatures and heart v2 remain compatible.
-- Public writes still go through the validated Next API; only service_role can execute wrappers.
begin;

-- Internal helpers run with their caller's privileges (the existing service-only wrappers).
-- FOR SHARE prevents token rotation/member changes between validation and participant linking.
create or replace function public._lock_submission_invite(p_token text, p_group_id uuid)
returns public.group_members language plpgsql security invoker set search_path = ''
as $$
declare m public.group_members;
begin
  if p_token is null then return null; end if;
  if p_token !~ '^[0-9a-f]{32}$' then raise exception 'invite_invalid'; end if;
  select gm.* into m from public.group_members gm
    where gm.invite_token_hash = public._token_hash(p_token) for share;
  if m.id is null then raise exception 'invite_invalid'; end if;
  if p_group_id is not null and m.group_id is distinct from p_group_id then
    raise exception 'invite_group_mismatch';
  end if;
  return m;
end;
$$;
revoke all on function public._lock_submission_invite(text, uuid) from public, anon, authenticated, service_role;

create or replace function public._link_submission_member(p_participant uuid, p_member uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if p_member is null then return; end if;
  update public.participants set group_member_id = p_member
    where id = p_participant and (group_member_id is null or group_member_id = p_member);
  if not found then raise exception 'invite_identity_mismatch'; end if;
end;
$$;
revoke all on function public._link_submission_member(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.create_delivery_v3(
  p_group_id uuid, p_name text, p_phone text, p_location text,
  p_date date, p_time text, p_message text,
  p_convert_token text default null, p_rider text default '신랑',
  p_invite_token text default null)
returns table(delivery_id uuid, participant_id uuid, manage_token text)
language plpgsql security definer set search_path = ''
as $$
declare r record; m public.group_members; v_conv uuid; tok text; v_phone text;
begin
  m := public._lock_submission_invite(p_invite_token, p_group_id);
  v_phone := coalesce(nullif(trim(p_phone), ''), nullif(trim(m.phone), ''));
  if v_phone is null then raise exception 'phone_required'; end if;
  if p_convert_token is not null then
    select p.id into v_conv from public.participants p
      where p.manage_token_hash = public._token_hash(p_convert_token) and p.type = '마음배송' for update;
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.create_delivery_v2(
    p_group_id, p_name, v_phone, p_location, p_date, p_time, p_message, v_conv, p_rider);
  perform public._link_submission_member(r.participant_id, m.id);
  tok := public._issue_manage_token(r.participant_id);
  return query select r.delivery_id, r.participant_id, tok;
end;
$$;
revoke all on function public.create_delivery_v3(uuid,text,text,text,date,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_delivery_v3(uuid,text,text,text,date,text,text,text,text,text) to service_role;

create or replace function public.join_delivery_v2(
  p_delivery uuid, p_name text, p_phone text, p_convert_token text default null,
  p_invite_token text default null)
returns table(result text, participant_id uuid, manage_token text)
language plpgsql security definer set search_path = ''
as $$
declare r record; m public.group_members; v_group uuid; v_conv uuid; tok text; v_phone text;
begin
  select d.group_id into v_group from public.deliveries d where d.id = p_delivery for update;
  m := public._lock_submission_invite(p_invite_token, v_group);
  v_phone := coalesce(nullif(trim(p_phone), ''), nullif(trim(m.phone), ''));
  if v_phone is null then raise exception 'phone_required'; end if;
  if p_convert_token is not null then
    select p.id into v_conv from public.participants p
      where p.manage_token_hash = public._token_hash(p_convert_token) and p.type = '마음배송' for update;
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.join_delivery(p_delivery, p_name, v_phone, v_conv);
  if r.participant_id is not null then
    perform public._link_submission_member(r.participant_id, m.id);
    tok := public._issue_manage_token(r.participant_id);
  elsif r.result = 'ok' then
    raise exception 'invite_identity_mismatch';
  end if;
  return query select r.result, r.participant_id, tok;
end;
$$;
revoke all on function public.join_delivery_v2(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.join_delivery_v2(uuid,text,text,text,text) to service_role;

create or replace function public.accept_group_offer_v2(
  p_slug text, p_name text, p_phone text, p_convert_token text default null,
  p_invite_token text default null)
returns table(result text, participant_id uuid, delivery_id uuid, member_count integer, manage_token text)
language plpgsql security definer set search_path = ''
as $$
declare r record; m public.group_members; v_group uuid; v_conv uuid; tok text; v_phone text;
begin
  select g.id into v_group from public.groups g where g.slug = p_slug for update;
  m := public._lock_submission_invite(p_invite_token, v_group);
  if p_invite_token is not null and v_group is null then raise exception 'invite_group_mismatch'; end if;
  v_phone := coalesce(nullif(trim(p_phone), ''), nullif(trim(m.phone), ''));
  if v_phone is null then raise exception 'phone_required'; end if;
  if p_convert_token is not null then
    select p.id into v_conv from public.participants p
      where p.manage_token_hash = public._token_hash(p_convert_token) and p.type = '마음배송' for update;
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.accept_group_offer(p_slug, p_name, v_phone, v_conv);
  if r.participant_id is not null then
    perform public._link_submission_member(r.participant_id, m.id);
    tok := public._issue_manage_token(r.participant_id);
  elsif r.result = 'ok' then
    raise exception 'invite_identity_mismatch';
  end if;
  return query select r.result, r.participant_id, r.delivery_id, r.member_count, tok;
end;
$$;
revoke all on function public.accept_group_offer_v2(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.accept_group_offer_v2(text,text,text,text,text) to service_role;

-- New signature without overloading v2: old application instances keep working during rollout.
-- SECURITY DEFINER is the same service-only write boundary as v2, never a public browser RPC.
create or replace function public.send_heart_v3(
  p_group_id uuid, p_name text, p_region text, p_stamp text, p_message text,
  p_phone text default null,
  p_display_mode text default 'anon', p_is_private boolean default false,
  p_show_region boolean default true, p_attendance text default null,
  p_anon_alias text default null, p_invite_token text default null)
returns table(participant_id uuid, manage_token text)
language plpgsql security definer set search_path = ''
as $$
declare r record; m public.group_members; v_phone text;
begin
  m := public._lock_submission_invite(p_invite_token, p_group_id);
  v_phone := coalesce(nullif(trim(p_phone), ''), nullif(trim(m.phone), ''));
  select * into r from public.send_heart_v2(
    p_group_id, case when m.id is not null then m.name else p_name end,
    p_region, p_stamp, p_message, v_phone,
    p_display_mode, p_is_private, p_show_region, p_attendance, p_anon_alias);
  perform public._link_submission_member(r.participant_id, m.id);
  return query select r.participant_id, r.manage_token;
end;
$$;
revoke all on function public.send_heart_v3(uuid,text,text,text,text,text,text,boolean,boolean,text,text,text) from public, anon, authenticated;
grant execute on function public.send_heart_v3(uuid,text,text,text,text,text,text,boolean,boolean,text,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
