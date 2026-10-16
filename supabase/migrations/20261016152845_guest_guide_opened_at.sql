-- Link opening and explicit guide confirmation are separate events.
-- Existing confirmations do not establish a historical opening time.
alter table public.rsvp add column guide_opened_at timestamptz;

create function public.open_guest_guide_v1(p_hash text)
returns table (name text, opened_at timestamptz, confirmed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare r public.rsvp;
begin
  if now()>=(select retention_until from public.privacy_state) then raise exception 'collection_closed'; end if;
  select * into r from public.rsvp g
    where g.guide_token_hash=p_hash and g.attending for update;
  if not found then raise exception 'invalid_token'; end if;
  if r.guide_opened_at is null then
    update public.rsvp g set guide_opened_at=now() where g.id=r.id returning g.* into r;
  end if;
  return query select r.name,r.guide_opened_at,r.guide_confirmed_at;
end $$;

revoke all on function public.open_guest_guide_v1(text) from public,anon,authenticated;
grant execute on function public.open_guest_guide_v1(text) to service_role;

create or replace function public.invalidate_guest_guide_v1() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.name is distinct from old.name or new.attending is distinct from old.attending
     or regexp_replace(coalesce(new.phone,''),'\D','','g') is distinct from regexp_replace(coalesce(old.phone,''),'\D','','g') then
    new.guide_token_hash:=null; new.guide_issued_at:=null; new.guide_opened_at:=null; new.guide_confirmed_at:=null;
    new.guide_sms_status:=null; new.guide_sms_request_id:=null;
    new.guide_sms_attempted_at:=null; new.guide_sms_sent_at:=null;
  end if;
  return new;
end $$;
