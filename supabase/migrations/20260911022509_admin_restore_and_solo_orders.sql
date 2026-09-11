-- Admin-only, additive RPCs. No existing orders or invitation tokens are rewritten.
create or replace function public.admin_create_solo_order_v1(
  p_request_key text, p_member uuid, p_location text, p_date date,
  p_time text, p_message text, p_rider text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare m public.group_members; r jsonb; key text := 'solo:' || p_request_key;
begin
  if p_request_key is null or length(p_request_key) < 8 then raise exception 'request_key_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(key,0));
  select * into m from public.group_members where id=p_member for update;
  if m.id is null then raise exception 'member_invalid'; end if;
  select result into r from public.admin_order_requests where request_key=key;
  if r is not null then
    if not exists(select 1 from public.participants where delivery_id=(r->>'delivery_id')::uuid and group_member_id=m.id) then
      raise exception 'request_key_conflict';
    end if;
    return r || jsonb_build_object('reused',true);
  end if;
  if m.group_id is not null then raise exception 'member_invalid'; end if;
  if exists(select 1 from public.participants p join public.deliveries d on d.id=p.delivery_id
    where p.group_member_id=m.id and p.type='직접배달' and d.status<>'취소') then
    raise exception 'already_ordered';
  end if;
  r := public.admin_create_order_v1(key,null,m.name,m.phone,p_location,p_date,p_time,p_message,p_rider,false);
  update public.participants set group_member_id=m.id
    where delivery_id=(r->>'delivery_id')::uuid and is_owner;
  if not found then raise exception 'owner_missing'; end if;
  return r;
end $$;
revoke all on function public.admin_create_solo_order_v1(text,uuid,text,date,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_create_solo_order_v1(text,uuid,text,date,text,text,text) to service_role;

create or replace function public.admin_restore_order_v1(p_delivery uuid)
returns text language plpgsql security invoker set search_path = ''
as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id=p_delivery for update;
  if d.id is null then return 'not_found'; end if;
  if d.status='대기중' then return 'already_restored'; end if;
  if d.status<>'취소' then return 'not_cancelled'; end if;
  -- Serialize against submissions using these invitations and roster regrouping.
  perform gm.id from public.group_members gm
    where gm.id in (select group_member_id from public.participants where delivery_id=d.id)
    order by gm.id for update;
  if exists(select 1 from public.blocked_dates where date=d.date) then return 'blocked'; end if;
  if exists(
    select 1 from public.participants old
    join public.participants other on other.delivery_id<>d.id and other.type='직접배달'
      and ((old.group_member_id is not null and old.group_member_id=other.group_member_id)
        or (old.name=other.name and nullif(regexp_replace(coalesce(old.phone,''),'[^0-9]','','g'),'') =
          nullif(regexp_replace(coalesce(other.phone,''),'[^0-9]','','g'),'')))
    join public.deliveries active on active.id=other.delivery_id and active.status<>'취소'
    where old.delivery_id=d.id
  ) then return 'conflict'; end if;
  update public.deliveries set status='대기중',hidden=false,tracking_stage='주문접수',updated_at=now() where id=d.id;
  return 'ok';
end $$;
revoke all on function public.admin_restore_order_v1(uuid) from public,anon,authenticated;
grant execute on function public.admin_restore_order_v1(uuid) to service_role;
