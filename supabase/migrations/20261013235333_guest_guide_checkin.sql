-- 사전 안내 확인은 현장 도착(checkins)과 별개이며 RSVP 파기 시 함께 삭제된다.
alter table public.rsvp
  add column guide_token_hash text,
  add column guide_issued_at timestamptz,
  add column guide_confirmed_at timestamptz,
  add column guide_sms_status text check(guide_sms_status in ('sending','accepted','failed','unknown')),
  add column guide_sms_request_id uuid,
  add column guide_sms_attempted_at timestamptz,
  add column guide_sms_sent_at timestamptz;
create unique index rsvp_guide_token_hash_uniq on public.rsvp(guide_token_hash) where guide_token_hash is not null;

create function public.issue_guest_guide_v1(
  p_id uuid,p_name text,p_phone text,p_expected_hash text,p_expected_request uuid,
  p_hash text,p_issued_at timestamptz,p_request uuid default null,p_resend boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare r rsvp;
begin
  if now()>=(select retention_until from privacy_state) then raise exception 'collection_closed'; end if;
  select * into r from rsvp where id=p_id for update;
  if not found or not r.attending then raise exception 'not_attending'; end if;
  if r.name is distinct from p_name or regexp_replace(coalesce(r.phone,''),'\D','','g') is distinct from coalesce(p_phone,'')
     or r.guide_token_hash is distinct from p_expected_hash or r.guide_sms_request_id is distinct from p_expected_request then
    raise exception 'targets_changed';
  end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_issued_at is null
    or (r.guide_token_hash is not null and r.guide_token_hash<>p_hash) then raise exception 'invalid_token'; end if;
  if p_request is not null then
    if coalesce(p_phone,'') !~ '^01[0-9]{8,9}$' then raise exception 'phone_required'; end if;
    if (r.guide_sms_status is not null or r.guide_confirmed_at is not null) and not coalesce(p_resend,false) then raise exception 'resend_confirmation_required'; end if;
    if r.guide_sms_status='sending' and r.guide_sms_attempted_at>now()-interval '15 minutes' then raise exception 'send_in_progress'; end if;
  end if;
  update rsvp set guide_token_hash=p_hash,guide_issued_at=p_issued_at,
    guide_sms_status=case when p_request is not null then 'sending' else guide_sms_status end,
    guide_sms_request_id=coalesce(p_request,guide_sms_request_id),
    guide_sms_attempted_at=case when p_request is not null then now() else guide_sms_attempted_at end
    where id=p_id;
end $$;

create function public.complete_guest_guide_sms_v1(p_id uuid,p_request uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status is null or p_status not in ('accepted','failed','unknown') then raise exception 'invalid_status'; end if;
  update rsvp set guide_sms_status=p_status,
    guide_sms_sent_at=case when p_status='accepted' then now() else guide_sms_sent_at end
    where id=p_id and guide_sms_request_id=p_request and guide_sms_status='sending';
  if not found then raise exception 'request_changed'; end if;
end $$;

create function public.confirm_guest_guide_v1(p_hash text) returns timestamptz
language plpgsql security definer set search_path=public as $$
declare v_time timestamptz;
begin
  if now()<'2026-10-15 00:00:00+09'::timestamptz then raise exception 'guide_not_open'; end if;
  if now()>=(select retention_until from privacy_state) then raise exception 'collection_closed'; end if;
  update rsvp set guide_confirmed_at=coalesce(guide_confirmed_at,now())
    where guide_token_hash=p_hash and attending returning guide_confirmed_at into v_time;
  if not found then raise exception 'invalid_token'; end if;
  return v_time;
end $$;

create function public.invalidate_guest_guide_v1() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.name is distinct from old.name or new.attending is distinct from old.attending
     or regexp_replace(coalesce(new.phone,''),'\D','','g') is distinct from regexp_replace(coalesce(old.phone,''),'\D','','g') then
    new.guide_token_hash:=null; new.guide_issued_at:=null; new.guide_confirmed_at:=null;
    new.guide_sms_status:=null; new.guide_sms_request_id:=null;
    new.guide_sms_attempted_at:=null; new.guide_sms_sent_at:=null;
  end if;
  return new;
end $$;
create trigger rsvp_guide_identity_changed before update on public.rsvp for each row execute function public.invalidate_guest_guide_v1();

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('issue_guest_guide_v1','complete_guest_guide_sms_v1','confirm_guest_guide_v1','invalidate_guest_guide_v1') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;
