-- =============================================================================
-- P0-2 참여자 관리 토큰 · 공용 rate limit
--
-- 배경: /delivery/manage/{participantId} 에서 participant UUID 가 사실상 인증
--       토큰 역할을 했고, anon RPC(get_participant/switch/leave/convert/
--       reschedule/review 등)가 UUID 만으로 조회·변경 가능했다.
--       UUID 는 get_celebrations 등으로 공개되는 식별자이므로 권한으로 쓰면 안 됨.
--
-- 설계:
--  - participants.manage_token_hash: 관리 링크용 랜덤 토큰(128bit hex)의 SHA-256 만 저장
--  - 생성 RPC 래퍼(v3/v2)가 DB 에서 gen_random_bytes 로 토큰을 발급해 1회 반환
--  - 관리 mutation RPC 들은 anon 실행권한 회수 → Next API 가 토큰 검증 후
--    service_role 로만 호출 (브라우저가 UUID 만으로 상태 변경 불가)
--  - 마음배송→직접배달 전환(p_convert)도 UUID 대신 관리 토큰으로
--  - rate_limits + rl_hit(): 서버리스 다중 인스턴스에서도 동작하는 DB 기반 제한
--    (업로드·로그인·조회 API 공용)
--
-- 기존 데이터: manage_token_hash 는 NULL 허용. 기존 참여자는 '내 신청 찾기'
--   (이름+연락처 뒷4자리+날짜) 로 토큰을 재발급받아 관리 링크를 얻는다.
--   (SOLAPI 미설정 상태로 운영돼 기존 SMS 링크는 발송된 적 없음 — 구 UUID 링크는
--    /delivery/manage/[token] 에서 안내 화면으로 처리)
-- =============================================================================

-- 1) 컬럼 + 유니크 인덱스
alter table public.participants
  add column if not exists manage_token_hash text;
create unique index if not exists participants_manage_token_hash_key
  on public.participants (manage_token_hash)
  where manage_token_hash is not null;

-- 2) 해시 헬퍼 (서버 Node 와 동일: sha256 hex)
--    ※ Supabase 의 pgcrypto 는 extensions 스키마 — search_path=public 함수에서도
--      찾을 수 있도록 스키마 한정자 사용
create or replace function public._token_hash(p_token text)
  returns text
  language sql
  immutable
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- 3) 토큰 발급 (내부/서버 전용) — 기존 토큰은 교체(회전)
create or replace function public._issue_manage_token(p_participant uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare tok text;
begin
  tok := encode(extensions.gen_random_bytes(16), 'hex');  -- 128bit
  update public.participants
     set manage_token_hash = public._token_hash(tok), updated_at = now()
   where id = p_participant;
  if not found then
    raise exception 'participant_not_found';
  end if;
  return tok;
end;
$$;
revoke execute on function public._issue_manage_token(uuid) from public, anon, authenticated;
grant  execute on function public._issue_manage_token(uuid) to service_role;

-- 4) 토큰 → 참여자 id (서버 전용)
create or replace function public._participant_by_token(p_token text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from public.participants
   where manage_token_hash = public._token_hash(p_token)
   limit 1;
$$;
revoke execute on function public._participant_by_token(text) from public, anon, authenticated;
grant  execute on function public._participant_by_token(text) to service_role;

-- 5) 생성 래퍼 — 토큰 동시 발급, 전환(p_convert)은 UUID 대신 관리 토큰
create or replace function public.create_delivery_v3(
  p_group_id uuid, p_name text, p_phone text, p_location text,
  p_date date, p_time text, p_message text,
  p_convert_token text default null, p_rider text default '신랑')
  returns table(delivery_id uuid, participant_id uuid, manage_token text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare r record; v_conv uuid; tok text;
begin
  if p_convert_token is not null then
    select id into v_conv from public.participants
     where manage_token_hash = public._token_hash(p_convert_token) and type = '마음배송';
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.create_delivery_v2(
    p_group_id, p_name, p_phone, p_location, p_date, p_time, p_message, v_conv, p_rider);
  tok := public._issue_manage_token(r.participant_id);
  return query select r.delivery_id, r.participant_id, tok;
end;
$$;

create or replace function public.join_delivery_v2(
  p_delivery uuid, p_name text, p_phone text, p_convert_token text default null)
  returns table(result text, participant_id uuid, manage_token text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare r record; v_conv uuid; tok text;
begin
  if p_convert_token is not null then
    select id into v_conv from public.participants
     where manage_token_hash = public._token_hash(p_convert_token) and type = '마음배송';
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.join_delivery(p_delivery, p_name, p_phone, v_conv);
  if r.participant_id is not null then
    tok := public._issue_manage_token(r.participant_id);
  end if;
  return query select r.result, r.participant_id, tok;
end;
$$;

create or replace function public.accept_group_offer_v2(
  p_slug text, p_name text, p_phone text, p_convert_token text default null)
  returns table(result text, participant_id uuid, delivery_id uuid, member_count integer, manage_token text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare r record; v_conv uuid; tok text;
begin
  if p_convert_token is not null then
    select id into v_conv from public.participants
     where manage_token_hash = public._token_hash(p_convert_token) and type = '마음배송';
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.accept_group_offer(p_slug, p_name, p_phone, v_conv);
  if r.participant_id is not null then
    tok := public._issue_manage_token(r.participant_id);
  end if;
  return query select r.result, r.participant_id, r.delivery_id, r.member_count, tok;
end;
$$;

create or replace function public.send_heart_v2(
  p_group_id uuid, p_name text, p_region text, p_stamp text, p_message text, p_phone text default null)
  returns table(participant_id uuid, manage_token text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare pid uuid; tok text;
begin
  pid := public.send_heart(p_group_id, p_name, p_region, p_stamp, p_message, p_phone);
  tok := public._issue_manage_token(pid);
  return query select pid, tok;
end;
$$;

grant execute on function public.create_delivery_v3(uuid,text,text,text,date,text,text,text,text) to anon;
grant execute on function public.join_delivery_v2(uuid,text,text,text) to anon;
grant execute on function public.accept_group_offer_v2(text,text,text,text) to anon;
grant execute on function public.send_heart_v2(uuid,text,text,text,text,text) to anon;

-- 6) DB 기반 rate limit (서버리스 다중 인스턴스 공용)
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);
alter table public.rate_limits enable row level security;  -- anon 접근 없음

create or replace function public.rl_hit(p_key text, p_limit integer, p_window_sec integer)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare c integer;
begin
  insert into public.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_sec)
                 then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_sec)
                        then now() else r.window_start end
  returning count into c;
  -- 가끔 오래된 키 정리 (테이블 비대화 방지)
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return c <= p_limit;
end;
$$;
revoke execute on function public.rl_hit(text,integer,integer) from public, anon, authenticated;
grant  execute on function public.rl_hit(text,integer,integer) to service_role;
