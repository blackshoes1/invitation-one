begin;
create or replace function public.admin_remove_order_member_v1(p_delivery uuid, p_participant uuid)
returns text language plpgsql security invoker set search_path = ''
as $$
declare v_deleted uuid; v_owner uuid;
begin
  perform 1 from public.deliveries where id = p_delivery for update;
  if not found then raise exception 'order_not_found'; end if;
  delete from public.participants where id = p_participant and delivery_id = p_delivery
    returning id into v_deleted;
  if v_deleted is null then return 'already_removed'; end if;
  if not exists(select 1 from public.participants where delivery_id = p_delivery) then
    update public.deliveries set status = '취소', updated_at = now()
      where id = p_delivery and status in ('대기중', '확정');
  elsif not exists(select 1 from public.participants where delivery_id = p_delivery and is_owner) then
    select id into v_owner from public.participants where delivery_id = p_delivery
      order by created_at, id limit 1;
    update public.participants set is_owner = true, updated_at = now() where id = v_owner;
  end if;
  return 'removed';
end;
$$;
revoke all on function public.admin_remove_order_member_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_order_member_v1(uuid, uuid) to service_role;
commit;
