-- Supabase SQL Editor 에서 실행. (v24 이후)
-- 주문 합치기를 단일 트랜잭션으로 (참여자 이동 + source 취소).
--
-- 배경: /api/admin/merge 가 참여자 이동과 source 취소를 별개 쿼리로 실행해
--       두 번째 쿼리 실패 시 "참여자는 없는데 살아있는 주문"이 남을 수 있었다.
--       행 잠금(FOR UPDATE)으로 동시 요청 race 도 방지한다.
-- 관리자 전용: service_role 로만 실행 (anon 실행 권한 제거).

create or replace function public.admin_merge_deliveries(p_source uuid, p_target uuid)
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_source deliveries%rowtype;
  v_target deliveries%rowtype;
  v_moved  integer;
begin
  if p_source = p_target then
    raise exception 'same_order';
  end if;

  select * into v_source from deliveries where id = p_source for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_target from deliveries where id = p_target for update;
  if not found then raise exception 'not_found'; end if;

  if v_source.status = '취소' or v_target.status in ('취소', '완료') then
    raise exception 'invalid_status';
  end if;

  update participants
     set delivery_id = p_target, is_owner = false, updated_at = now()
   where delivery_id = p_source;
  get diagnostics v_moved = row_count;

  update deliveries
     set status = '취소', updated_at = now()
   where id = p_source;

  return v_moved;
end;
$$;

revoke execute on function public.admin_merge_deliveries(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_merge_deliveries(uuid, uuid) to service_role;
