-- Service-only, atomic addition. No order reassignment or notification delivery.
begin;
create or replace function public.admin_add_order_member_v1(p_delivery uuid, p_member uuid)
returns text language plpgsql security invoker set search_path = ''
as $$
declare
  d public.deliveries;
  m public.group_members;
  v_pid uuid;
begin
  -- Serializes additions for a member; same-order retries are idempotent.
  select * into m from public.group_members where id = p_member for update;
  if not found then raise exception 'member_not_found'; end if;
  select * into d from public.deliveries where id = p_delivery for update;
  if not found then raise exception 'order_not_found'; end if;
  if d.status not in ('대기중', '확정') then raise exception 'invalid_status'; end if;
  if m.group_id is null or (d.group_id is not null and d.group_id <> m.group_id) then
    raise exception 'group_mismatch';
  end if;
  if exists(select 1 from public.participants where delivery_id = d.id and group_member_id = m.id) then
    return 'already_on_order';
  end if;
  if exists(select 1 from public.participants p join public.deliveries other on other.id = p.delivery_id
    where p.group_member_id = m.id and p.type = '직접배달' and other.status <> '취소') then
    raise exception 'already_ordered';
  end if;
  -- Old rows without roster linkage: never silently merge identities or duplicate them.
  if exists(select 1 from public.participants p join public.deliveries other on other.id = p.delivery_id
    where p.type = '직접배달' and other.status <> '취소'
      and (p.delivery_id = d.id or p.group_id = m.group_id)
      and btrim(p.name) = btrim(m.name)
      and (nullif(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), '') is null
        or nullif(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), '') is null
        or regexp_replace(p.phone, '\D', '', 'g') = regexp_replace(m.phone, '\D', '', 'g'))
  ) then raise exception 'identity_conflict'; end if;

  insert into public.participants(delivery_id, group_id, type, name, phone, is_owner, group_member_id)
    values(d.id, d.group_id, '직접배달', btrim(m.name), m.phone, false, m.id) returning id into v_pid;
  update public.notification_outbox set status = 'skipped', last_error = 'admin_added_member', updated_at = now()
    where participant_id = v_pid and status = 'pending';
  return 'added';
end;
$$;
revoke all on function public.admin_add_order_member_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_add_order_member_v1(uuid, uuid) to service_role;
commit;
