-- 문제 1·2 — 관리자 그룹 주문 생성을 하나의 트랜잭션으로 (원자성 + 멱등성)
--            + 명단 재신청 판정 교정 (취소·마음배송 이력이 새 신청을 막지 않도록)
--
-- 배경 (문제 1): 관리자 주문 생성은 지금 앱에서 4단계로 쪼개져 있다.
--   ① create_delivery_v2 로 주문+대표자 → ② 대표자 outbox 를 skipped 로 update
--   → ③ 명단 참여자 insert → ④ 그 outbox 행들을 skipped 로 update
-- 각 단계가 별도 트랜잭션이라 중간에 실패하면 **빈 주문**이나 **명단 일부만 등록된
-- 주문**이 남는다. 게다가 ③ 의 insert 오류를 앱이 `{added:0, skipped:전원}` 으로
-- 반환해서, 등록 실패가 "전원 이미 신청됨"과 구분되지 않았다.
-- ④ 도 별도 트랜잭션이라 그 사이에 드레인이 돌면 **관리자가 직접 만든 주문의 알림이
-- 실제로 발송**된다.
--
-- 배경 (문제 2): 명단 제외 판정이 `participants.group_member_id` 존재만 봤다.
--   - 직접배달을 **취소**한 사람 → 연결이 남아 있어 새 주문에 다시 못 넣었다
--   - **마음배송**만 한 사람 → 같은 이유로 직접배달 등록이 조용히 건너뛰어졌다
--   - 이름만 같으면 제외 → 동명이인이 통째로 누락됐다
--
-- 해결: 전부를 서버 전용 RPC 한 번(= 한 트랜잭션)으로 옮긴다. 실패하면 이 요청이
--       만든 것 전부가 롤백되고, 기존 주문·참여자는 손대지 않는다. outbox 를
--       skipped 로 표시하는 것도 같은 트랜잭션 안이라 드레인이 pending 상태를
--       **볼 수 있는 구간 자체가 없다** (커밋 시점엔 이미 skipped).
--
-- 추가 전용(additive). 기존 create_delivery_v2 는 하객 경로가 그대로 쓰므로 유지한다.
-- 앱 배포와 순서 무관: 구 앱은 이 함수를 호출하지 않고 기존 경로로 계속 동작한다.
-- 파괴적 변경 없음 — 기존 행을 지우거나 덮어쓰지 않는다.

-- ---------------------------------------------------------------------------
-- 멱등성 대장(臺帳) — 같은 제출의 중복 클릭·네트워크 재시도를 흡수한다.
--
-- 그룹 단위로 잠그지 않는 이유: 한 그룹에 정상적으로 여러 주문(날짜별 등)을 만드는
-- 것은 막으면 안 된다. 잠그는 단위는 **한 번의 제출**이고, 그 신원은 클라이언트가
-- 만든 request_key 다. 서로 다른 제출은 서로 다른 키를 갖는다.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_order_requests (
  request_key text primary key,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.admin_order_requests enable row level security;
revoke all on public.admin_order_requests from anon, authenticated;
grant all on public.admin_order_requests to service_role;

-- ---------------------------------------------------------------------------
-- 관리자 주문 생성 (주문 + 대표자 + 명단 일괄 + 알림 제외) — 전부 한 트랜잭션
--
-- 반환 jsonb:
--   { delivery_id, with_owner, reused,
--     roster: { added, linked, skipped:[{member_id,name,reason}],
--                                review:[{member_id,name,reason}] } }
--
-- skipped/review 의 reason (UI 가 사유별로 설명할 수 있게 코드로 내려준다):
--   owner              대표자로 이미 이 주문에 등록됨
--   already_on_order   이 주문에 이미 참여자로 있음
--   already_ordered    다른 유효한 직접배달 주문에 이미 신청함 (조용히 옮기지 않는다)
--   linked_existing    명단 연결이 없던 과거 신청을 유일하게 특정해 연결만 함
--   ambiguous_existing 이름이 같은 과거 신청이 있으나 사람을 특정할 수 없음
--                      → 새로 등록은 하되 관리자 확인이 필요하다고 표시
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_order_v1(
  p_request_key    text,
  p_group_id       uuid,
  p_owner_name     text,
  p_owner_phone    text,
  p_location       text,
  p_date           date,
  p_time           text,
  p_message        text,
  p_rider          text,
  p_include_roster boolean
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_prev      jsonb;
  v_delivery  uuid;
  v_rider     text;
  v_owner_pid uuid;
  v_owner_mid uuid;
  v_new_ids   uuid[] := '{}';
  v_added     int := 0;
  v_linked    int := 0;
  v_skipped   jsonb := '[]'::jsonb;
  v_review    jsonb := '[]'::jsonb;
  v_result    jsonb;
  v_owner     text := btrim(coalesce(p_owner_name, ''));
  v_phone_d   text := nullif(regexp_replace(coalesce(p_owner_phone, ''), '\D', '', 'g'), '');
  v_cnt       int;
  v_pid       uuid;
  v_did       uuid;
  m           record;
begin
  if p_request_key is null or length(p_request_key) < 8 then
    raise exception 'request_key_required';
  end if;

  -- 멱등: 같은 키가 이미 처리됐으면 그때 결과를 그대로 돌려준다 (새로 만들지 않는다).
  -- 동시에 들어온 두 번째 요청은 아래 insert 의 PK 대기로 첫 요청 커밋까지 막혔다가
  -- 여기 걸린다 — 그래서 동시 중복 클릭에도 주문이 하나만 생긴다.
  select r.result into v_prev
    from public.admin_order_requests r where r.request_key = p_request_key;
  if v_prev is not null then
    return v_prev || jsonb_build_object('reused', true);
  end if;

  -- 기존 검증 규칙 유지 (기간 · 마감일)
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    raise exception 'out_of_range';
  end if;
  if exists (select 1 from public.blocked_dates b where b.date = p_date) then
    raise exception 'date_blocked' using errcode = '23505';
  end if;

  v_rider := case when p_rider in ('신랑', '신부', '신랑+신부') then p_rider else '신랑' end;

  insert into public.deliveries (group_id, location, date, time_slot, message, rider)
  values (p_group_id, p_location, p_date, p_time, p_message, v_rider)
  returning id into v_delivery;

  -- ── 대표자 ───────────────────────────────────────────────────────────────
  if v_owner <> '' then
    -- 명단에서 대표자를 **확실히** 특정할 수 있을 때만 연결한다.
    -- 번호가 유일하게 일치하거나, 번호가 없는 동명 구성원이 딱 하나일 때만.
    -- (이름만 같은 여러 사람을 합치지 않기 위한 조건이다)
    if p_group_id is not null then
      if v_phone_d is not null then
        select count(*), (array_agg(gm.id))[1] into v_cnt, v_owner_mid
          from public.group_members gm
         where gm.group_id = p_group_id
           and regexp_replace(coalesce(gm.phone, ''), '\D', '', 'g') = v_phone_d;
        if v_cnt <> 1 then v_owner_mid := null; end if;
      end if;
      if v_owner_mid is null then
        select count(*), (array_agg(gm.id))[1] into v_cnt, v_owner_mid
          from public.group_members gm
         where gm.group_id = p_group_id
           and btrim(gm.name) = v_owner
           and gm.phone is null;
        if v_cnt <> 1 then v_owner_mid := null; end if;
      end if;
    end if;

    insert into public.participants
      (delivery_id, group_id, type, name, phone, is_owner, group_member_id)
    values (v_delivery, p_group_id, '직접배달', v_owner, p_owner_phone, true, v_owner_mid)
    returning id into v_owner_pid;
    v_new_ids := v_new_ids || v_owner_pid;
  end if;

  -- ── 명단 일괄 등록 ───────────────────────────────────────────────────────
  if coalesce(p_include_roster, false) and p_group_id is not null then
    for m in
      select gm.id, btrim(gm.name) as name, gm.phone
        from public.group_members gm
       where gm.group_id = p_group_id
       order by gm.created_at
    loop
      -- 대표자로 이미 이 주문에 들어간 구성원
      if v_owner_mid is not null and m.id = v_owner_mid then
        v_skipped := v_skipped || jsonb_build_object(
          'member_id', m.id, 'name', m.name, 'reason', 'owner');
        continue;
      end if;

      -- 명단 연결로 확인되는 **유효한 직접배달** 신청.
      -- 취소된 직접배달과 마음배송은 유효 신청이 아니다 → 새 등록을 막지 않는다.
      select p.id, p.delivery_id into v_pid, v_did
        from public.participants p
        join public.deliveries d on d.id = p.delivery_id
       where p.group_member_id = m.id
         and p.type = '직접배달'
         and d.status <> '취소'
       order by p.created_at desc
       limit 1;
      if v_pid is not null then
        v_skipped := v_skipped || jsonb_build_object(
          'member_id', m.id, 'name', m.name,
          'reason', case when v_did = v_delivery then 'already_on_order'
                         else 'already_ordered' end);
        v_pid := null; v_did := null;
        continue;
      end if;

      -- 명단 연결이 없는 과거 신청 — 이름만으로는 사람을 특정할 수 없다.
      -- 같은 이름의 명단 구성원이 하나뿐이고, 매칭되는 과거 신청도 하나뿐일 때만
      -- 연결한다. 그 외에는 **연결하지 않고 새로 등록**한 뒤 확인 필요로 표시한다
      -- (조용히 빠뜨리는 것보다 관리자가 보고 판단하는 편이 낫다).
      select count(*) into v_cnt
        from public.group_members gm2
       where gm2.group_id = p_group_id and btrim(gm2.name) = m.name;

      if v_cnt = 1 then
        select count(*), (array_agg(p.id))[1] into v_cnt, v_pid
          from public.participants p
          join public.deliveries d on d.id = p.delivery_id
         where p.group_id = p_group_id
           and p.group_member_id is null
           and p.type = '직접배달'
           and d.status <> '취소'
           and btrim(p.name) = m.name;
        if v_cnt = 1 then
          update public.participants set group_member_id = m.id, updated_at = now()
           where id = v_pid;
          v_linked := v_linked + 1;
          v_skipped := v_skipped || jsonb_build_object(
            'member_id', m.id, 'name', m.name, 'reason', 'linked_existing');
          v_pid := null;
          continue;
        elsif v_cnt > 1 then
          v_review := v_review || jsonb_build_object(
            'member_id', m.id, 'name', m.name, 'reason', 'ambiguous_existing');
        end if;
        v_pid := null;
      else
        -- 동명이인 — 이름만 같다는 이유로 제외하지 않는다. 등록하고 표시만 한다.
        if exists (
          select 1 from public.participants p
            join public.deliveries d on d.id = p.delivery_id
           where p.group_id = p_group_id
             and p.group_member_id is null
             and p.type = '직접배달'
             and d.status <> '취소'
             and btrim(p.name) = m.name
        ) then
          v_review := v_review || jsonb_build_object(
            'member_id', m.id, 'name', m.name, 'reason', 'ambiguous_existing');
        end if;
      end if;

      insert into public.participants
        (delivery_id, group_id, type, name, phone, is_owner, group_member_id)
      values (v_delivery, p_group_id, '직접배달', m.name, m.phone, false, m.id)
      returning id into v_pid;
      v_new_ids := v_new_ids || v_pid;
      v_added := v_added + 1;
      v_pid := null;
    end loop;
  end if;

  -- ── 관리자 생성 건은 알림을 보내지 않는다 ────────────────────────────────
  -- 트리거가 같은 트랜잭션 안에서 적재한 행을 여기서 바로 skipped 로 만든다.
  -- 커밋 전에는 드레인이 이 행들을 볼 수 없으므로 "발송 가능한 상태로 노출되는
  -- 구간"이 존재하지 않는다 (기존의 별도 update 는 그 구간이 있었다).
  if array_length(v_new_ids, 1) is not null then
    update public.notification_outbox
       set status = 'skipped', last_error = 'admin_created', updated_at = now()
     where participant_id = any (v_new_ids)
       and status = 'pending';
  end if;

  v_result := jsonb_build_object(
    'delivery_id', v_delivery,
    'with_owner', v_owner_pid is not null,
    'reused', false,
    'roster', jsonb_build_object(
      'added', v_added,
      'linked', v_linked,
      'skipped', v_skipped,
      'review', v_review
    )
  );

  insert into public.admin_order_requests (request_key, delivery_id, result)
  values (p_request_key, v_delivery, v_result);

  return v_result;
end;
$fn$;

revoke all on function public.admin_create_order_v1(
  text, uuid, text, text, text, date, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_order_v1(
  text, uuid, text, text, text, date, text, text, text, boolean
) to service_role;
