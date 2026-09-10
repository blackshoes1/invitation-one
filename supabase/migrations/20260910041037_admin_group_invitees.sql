-- Move roster membership only: issued links and existing orders retain identity.
-- A caller-generated destination ID makes new-group retries idempotent.
create or replace function public.admin_group_invitees(
  p_member_ids uuid[],
  p_group_id uuid,
  p_new_group_name text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_count integer;
  v_moved integer;
begin
  if p_group_id is null or coalesce(cardinality(p_member_ids), 0) not between 1 and 500
     or array_position(p_member_ids, null) is not null
     or (select count(distinct x) from unnest(p_member_ids) x) <> cardinality(p_member_ids)
     or (p_new_group_name is not null and length(btrim(p_new_group_name)) not between 1 and 100) then
    raise exception 'invalid_grouping_request';
  end if;

  if p_new_group_name is not null then
    insert into public.groups (id, name, slug)
    values (p_group_id, btrim(p_new_group_name), replace(p_group_id::text, '-', ''))
    on conflict (id) do nothing;
  end if;

  select * into v_group from public.groups where id = p_group_id for update;
  if not found then raise exception 'group_not_found'; end if;
  if p_new_group_name is not null and v_group.name <> btrim(p_new_group_name) then
    raise exception 'group_conflict';
  end if;

  -- Same order for concurrent batches; serializes with invite submission locks.
  perform id from public.group_members where id = any(p_member_ids) order by id for update;
  select count(*) into v_count from public.group_members
    where id = any(p_member_ids) and (group_id is null or group_id = p_group_id);
  if v_count <> cardinality(p_member_ids) then raise exception 'invitees_changed'; end if;

  update public.group_members set group_id = p_group_id
    where id = any(p_member_ids) and group_id is null;
  get diagnostics v_moved = row_count;

  return jsonb_build_object(
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name, 'slug', v_group.slug),
    'member_ids', to_jsonb(p_member_ids), 'assigned_count', v_count, 'moved_count', v_moved
  );
end;
$$;

revoke all on function public.admin_group_invitees(uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.admin_group_invitees(uuid[], uuid, text) to service_role;
