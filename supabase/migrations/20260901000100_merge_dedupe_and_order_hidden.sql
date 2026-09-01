-- 관리자 주문 관리 보완
-- 1) 주문 합치기: 동일인(이름 + 연락처 숫자 동일)이 양쪽에 있으면 한 건으로 합친다.
--    기존에는 source 참여자를 전부 옮겨서 target 에 같은 사람이 2건으로 남았다.
--    → target 에 이미 있는 사람은 옮기지 않고 source 쪽 행을 제거(중복 해소).
--    연락처가 없는 참여자는 동일인 판정을 하지 않는다 (이름만으로는 단정 불가).
-- 2) deliveries.hidden: DB 는 보존하고 관리자 UI 목록에서만 감추는 플래그.
--    (테스트·중복 주문 정리용 — 삭제가 아니므로 언제든 되돌릴 수 있다)
-- 추가 전용·멱등. 앱 배포 순서와 무관하게 먼저 적용해도 안전
-- (구 앱은 hidden 을 모르고, 새 RPC 는 반환 컬럼만 늘어난다).

/* ------------------------------------------------------------------ *
 * 1) 주문 합치기 — 동일인 중복 제거
 * ------------------------------------------------------------------ */
-- 반환 타입이 integer → table 로 바뀌므로 먼저 제거 (PostgREST 오버로드 모호성 방지)
drop function if exists public.admin_merge_deliveries(uuid, uuid);

create or replace function public.admin_merge_deliveries(p_source uuid, p_target uuid)
  returns table (moved integer, deduped integer)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_source deliveries%rowtype;
  v_target deliveries%rowtype;
  v_moved  integer;
  v_dedup  integer;
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

  -- (1) 동일인 제거: target 에 같은 사람(이름 + 연락처 숫자)이 이미 있으면 source 쪽 행 삭제
  delete from participants s
   where s.delivery_id = p_source
     and s.phone is not null
     and exists (
       select 1 from participants t
        where t.delivery_id = p_target
          and t.phone is not null
          and btrim(t.name) = btrim(s.name)
          and regexp_replace(t.phone, '\D', '', 'g')
              = regexp_replace(s.phone, '\D', '', 'g')
     );
  get diagnostics v_dedup = row_count;

  -- (2) 남은 참여자만 target 으로 이동
  update participants
     set delivery_id = p_target, is_owner = false, updated_at = now()
   where delivery_id = p_source;
  get diagnostics v_moved = row_count;

  update deliveries
     set status = '취소', updated_at = now()
   where id = p_source;

  return query select v_moved, v_dedup;
end;
$$;

revoke execute on function public.admin_merge_deliveries(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.admin_merge_deliveries(uuid, uuid) to service_role;

/* ------------------------------------------------------------------ *
 * 2) 주문 숨김 플래그 (표시 전용 — 데이터는 보존)
 * ------------------------------------------------------------------ */
alter table public.deliveries
  add column if not exists hidden boolean not null default false;

create index if not exists deliveries_hidden_idx
  on public.deliveries (hidden) where hidden;
