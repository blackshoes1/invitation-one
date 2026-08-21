-- 개인 초대 링크 (B안)
-- 관리자가 명단(group_members)에 연락처를 넣고 사람별 초대 토큰을 발급하면
-- 하객은 /delivery/group/<slug>?i=<토큰> 으로 들어와 이름이 채워지고 연락처는 마스킹만 보인다.
-- 제출 시 클라이언트는 p_phone 을 비우고 p_invite_token 을 보내며, 서버(RPC)가 토큰 해시로
-- 실제 연락처를 채운다 → 연락처가 브라우저로 내려가지 않는다. DB 에는 토큰 해시만 저장.
-- 추가 전용: 컬럼 3개 + 래퍼 RPC 재정의(p_invite_token 기본값 null 추가 — 기존 호출 호환).

alter table public.group_members add column if not exists phone text;
alter table public.group_members add column if not exists invite_token_hash text;
alter table public.group_members add column if not exists invited_at timestamptz;
create unique index if not exists group_members_invite_hash_idx
  on public.group_members (invite_token_hash) where invite_token_hash is not null;

-- 토큰 → 연락처 (서버/정의자 전용)
create or replace function public._invite_phone(p_token text)
  returns text language sql stable security definer set search_path = public
as $$
  select gm.phone from public.group_members gm
   where p_token is not null and gm.invite_token_hash = public._token_hash(p_token)
   limit 1;
$$;
revoke all on function public._invite_phone(text) from public, anon, authenticated;

-- 래퍼 재정의 (구 시그니처 제거 후 p_invite_token 추가 — PostgREST 오버로드 모호성 방지)
drop function if exists public.create_delivery_v3(uuid, text, text, text, date, text, text, text, text);
create or replace function public.create_delivery_v3(
  p_group_id uuid, p_name text, p_phone text, p_location text,
  p_date date, p_time text, p_message text,
  p_convert_token text default null, p_rider text default '신랑',
  p_invite_token text default null)
  returns table(delivery_id uuid, participant_id uuid, manage_token text)
  language plpgsql security definer set search_path = public
as $$
declare r record; v_conv uuid; tok text; v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_phone is null and p_invite_token is not null then
    v_phone := public._invite_phone(p_invite_token);
  end if;
  if v_phone is null then raise exception 'phone_required'; end if;
  if p_convert_token is not null then
    select id into v_conv from public.participants
     where manage_token_hash = public._token_hash(p_convert_token) and type = '마음배송';
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.create_delivery_v2(
    p_group_id, p_name, v_phone, p_location, p_date, p_time, p_message, v_conv, p_rider);
  tok := public._issue_manage_token(r.participant_id);
  return query select r.delivery_id, r.participant_id, tok;
end;
$$;
grant execute on function public.create_delivery_v3(uuid, text, text, text, date, text, text, text, text, text) to anon;

drop function if exists public.join_delivery_v2(uuid, text, text, text);
create or replace function public.join_delivery_v2(
  p_delivery uuid, p_name text, p_phone text, p_convert_token text default null,
  p_invite_token text default null)
  returns table(result text, participant_id uuid, manage_token text)
  language plpgsql security definer set search_path = public
as $$
declare r record; v_conv uuid; tok text; v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_phone is null and p_invite_token is not null then
    v_phone := public._invite_phone(p_invite_token);
  end if;
  if v_phone is null then raise exception 'phone_required'; end if;
  if p_convert_token is not null then
    select id into v_conv from public.participants
     where manage_token_hash = public._token_hash(p_convert_token) and type = '마음배송';
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.join_delivery(p_delivery, p_name, v_phone, v_conv);
  if r.participant_id is not null then
    tok := public._issue_manage_token(r.participant_id);
  end if;
  return query select r.result, r.participant_id, tok;
end;
$$;
grant execute on function public.join_delivery_v2(uuid, text, text, text, text) to anon;

drop function if exists public.accept_group_offer_v2(text, text, text, text);
create or replace function public.accept_group_offer_v2(
  p_slug text, p_name text, p_phone text, p_convert_token text default null,
  p_invite_token text default null)
  returns table(result text, participant_id uuid, delivery_id uuid, member_count integer, manage_token text)
  language plpgsql security definer set search_path = public
as $$
declare r record; v_conv uuid; tok text; v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_phone is null and p_invite_token is not null then
    v_phone := public._invite_phone(p_invite_token);
  end if;
  if v_phone is null then raise exception 'phone_required'; end if;
  if p_convert_token is not null then
    select id into v_conv from public.participants
     where manage_token_hash = public._token_hash(p_convert_token) and type = '마음배송';
    if v_conv is null then raise exception 'convert_invalid'; end if;
  end if;
  select * into r from public.accept_group_offer(p_slug, p_name, v_phone, v_conv);
  if r.participant_id is not null then
    tok := public._issue_manage_token(r.participant_id);
  end if;
  return query select r.result, r.participant_id, r.delivery_id, r.member_count, tok;
end;
$$;
grant execute on function public.accept_group_offer_v2(text, text, text, text, text) to anon;
