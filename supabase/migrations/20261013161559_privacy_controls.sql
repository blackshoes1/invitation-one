-- 1단계: 추가 전용. 운영 데이터의 파기는 관리자 재인증 후 별도 RPC로만 실행.
create table if not exists public.privacy_state (
  singleton boolean primary key default true check (singleton),
  retention_until timestamptz not null default '2026-11-17 11:00:00+09',
  purged_at timestamptz,
  receipt jsonb,
  external_checks jsonb not null default '{"local_copies":false,"provider_backups":false,"sms":false,"admin_messages":false}'
);
insert into public.privacy_state(singleton) values(true) on conflict do nothing;

create table if not exists public.privacy_access_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_hash text,
  ip_hash text,
  action text not null,
  outcome text not null check (outcome in ('allowed','denied','success','failure')),
  resource text not null,
  method text,
  row_id uuid
);
create index if not exists privacy_access_log_created_idx on public.privacy_access_log(created_at desc);

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  purpose text not null,
  name_hash text not null,
  phone_hash text not null,
  policy_version text not null
);

create table if not exists public.guest_identity_challenges (
  id uuid primary key,
  purpose text not null check(purpose in ('badge','rsvp','checkin')),
  name_hash text not null,
  phone_hash text not null,
  code_hash text not null,
  participant_id uuid references public.participants(id) on delete cascade,
  rsvp_id uuid references public.rsvp(id) on delete cascade,
  eligible boolean not null,
  attempts integer not null default 0 check(attempts between 0 and 5),
  expires_at timestamptz not null default now()+interval '5 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.guest_identity_tickets (
  token_hash text primary key,
  purpose text not null check(purpose in ('badge','rsvp','checkin')),
  name_hash text not null,
  phone_hash text not null,
  participant_id uuid references public.participants(id) on delete cascade,
  rsvp_id uuid references public.rsvp(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- 사진·축하 글은 기념용 보존. 연락처·배송지·신청 명단과 분리하고 작성자는 익명화.
create table if not exists public.guest_memories (
  id uuid primary key,
  kind text not null,
  name text not null default '하객',
  stamp text,
  message text,
  rating integer,
  review text,
  photo_url text,
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null,
  is_private boolean not null
);

do $$ declare t text; begin
  foreach t in array array['privacy_state','privacy_access_log','privacy_consents','guest_identity_challenges','guest_identity_tickets','guest_memories'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
revoke update,delete,truncate on public.privacy_access_log from service_role;

create or replace function public.create_guest_identity_challenge_v1(
  p_id uuid,p_purpose text,p_name text,p_phone text,p_name_hash text,p_phone_hash text,p_code_hash text,p_rsvp_id uuid default null
) returns text language plpgsql security definer set search_path=public as $$
declare v_pid uuid; v_rsvp uuid; v_phone text; v_eligible boolean;
begin
  if now()>=(select retention_until from privacy_state) then raise exception 'collection_closed'; end if;
  if p_purpose not in ('badge','rsvp','checkin') or p_phone !~ '^01[0-9]{8,9}$'
     or length(btrim(p_name)) not between 2 and 40 or p_name_hash !~ '^[a-f0-9]{64}$'
     or p_phone_hash !~ '^[a-f0-9]{64}$' or p_code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_identity';
  end if;
  if p_purpose='badge' then
    select id,phone into v_pid,v_phone from participants
      where btrim(name)=btrim(p_name) and regexp_replace(phone,'\D','','g')=p_phone
      order by created_at desc limit 1;
    v_eligible:=v_pid is not null;
  elsif p_purpose='checkin' then
    select id,phone into v_rsvp,v_phone from rsvp
      where (p_rsvp_id is null or id=p_rsvp_id) and attending
        and btrim(name)=btrim(p_name) and regexp_replace(phone,'\D','','g')=p_phone
      order by created_at desc limit 1;
    v_eligible:=v_rsvp is not null;
  else
    -- 신규 RSVP도 번호 소유를 확인해야 한다. 입력한 번호로 코드만 보낸다.
    v_phone:=p_phone; v_eligible:=true;
  end if;
  insert into guest_identity_challenges(id,purpose,name_hash,phone_hash,code_hash,participant_id,rsvp_id,eligible)
    values(p_id,p_purpose,p_name_hash,p_phone_hash,p_code_hash,v_pid,v_rsvp,v_eligible);
  return v_phone; -- service_role 서버 내부에서 SMS 수신자로만 사용, 브라우저에 반환 금지.
end $$;

create or replace function public.consume_guest_identity_code_v1(p_id uuid,p_code_hash text,p_ticket_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c guest_identity_challenges; v_result jsonb; v_name text; v_phone text;
begin
  if now()>=(select retention_until from privacy_state) then return jsonb_build_object('ok',false); end if;
  select * into c from guest_identity_challenges where id=p_id for update;
  if not found or c.used_at is not null or c.expires_at<=now() or c.attempts>=5 then
    return jsonb_build_object('ok',false);
  end if;
  if p_code_hash is null or not c.eligible or c.code_hash<>p_code_hash then
    update guest_identity_challenges set attempts=attempts+1 where id=p_id;
    return jsonb_build_object('ok',false);
  end if;
  if p_ticket_hash is null or p_ticket_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_ticket'; end if;
  update guest_identity_challenges set used_at=now() where id=p_id;
  insert into guest_identity_tickets(token_hash,purpose,name_hash,phone_hash,participant_id,rsvp_id)
    values(p_ticket_hash,c.purpose,c.name_hash,c.phone_hash,c.participant_id,c.rsvp_id);
  insert into privacy_consents(purpose,name_hash,phone_hash,policy_version)
    values(c.purpose,c.name_hash,c.phone_hash,'2026-10-14');
  if c.purpose='badge' then
    select name,phone into v_name,v_phone from participants where id=c.participant_id;
    select to_jsonb(r) into v_result from verify_guest_v2(v_name,right(regexp_replace(v_phone,'\D','','g'),4),null) r
      where r.participant_id=c.participant_id;
  end if;
  return jsonb_build_object('ok',true,'purpose',c.purpose,'result',v_result);
end $$;

create or replace function public.submit_rsvp_verified_v1(
  p_ticket_hash text,p_name_hash text,p_phone_hash text,
  p_name text,p_phone text,p_side text,p_attending boolean,p_companions integer,
  p_children integer,p_kids_meal boolean,p_meal text,p_memo text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare t guest_identity_tickets; v_result jsonb;
begin
  if now()>=(select retention_until from privacy_state) then raise exception 'collection_closed'; end if;
  select * into t from guest_identity_tickets where token_hash=p_ticket_hash for update;
  if not found or p_name_hash is null or p_phone_hash is null or t.purpose<>'rsvp' or t.used_at is not null or t.expires_at<=now()
     or t.name_hash<>p_name_hash or t.phone_hash<>p_phone_hash then raise exception 'identity_required'; end if;
  select to_jsonb(r) into v_result from submit_rsvp_v2(p_name,p_phone,p_side,p_attending,p_companions,p_children,p_kids_meal,p_meal,p_memo) r;
  update guest_identity_tickets set used_at=now() where token_hash=p_ticket_hash;
  return v_result;
end $$;

create or replace function public.invalidate_guest_identity_v1() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.name is distinct from old.name or regexp_replace(coalesce(new.phone,''),'\D','','g')
      is distinct from regexp_replace(coalesce(old.phone,''),'\D','','g') then
    if tg_table_name='participants' then
      delete from guest_identity_challenges where participant_id=old.id;
      delete from guest_identity_tickets where participant_id=old.id;
    else
      delete from guest_identity_challenges where rsvp_id=old.id;
      delete from guest_identity_tickets where rsvp_id=old.id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists participants_identity_changed on participants;
create trigger participants_identity_changed before update on participants for each row execute function invalidate_guest_identity_v1();
drop trigger if exists rsvp_identity_changed on rsvp;
create trigger rsvp_identity_changed before update on rsvp for each row execute function invalidate_guest_identity_v1();

create or replace function public.audit_personal_data_change_v1() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if current_setting('privacy.purging',true) is distinct from 'on' then
    insert into privacy_access_log(action,outcome,resource,row_id)
      values('data_'||lower(tg_op),'success',tg_table_name,case when tg_op='DELETE' then old.id else new.id end);
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['group_members','participants','deliveries','rsvp','waiting_list','checkins'] loop
    execute format('drop trigger if exists privacy_change_log on public.%I',t);
    execute format('create trigger privacy_change_log after insert or update or delete on public.%I for each row execute function public.audit_personal_data_change_v1()',t);
  end loop;
end $$;

-- 새 함수는 서버만 호출. 기존 공개 확인 RPC의 권한 회수는 앱 전환 후 2단계에서 진행.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_guest_identity_challenge_v1','consume_guest_identity_code_v1','submit_rsvp_verified_v1','invalidate_guest_identity_v1','audit_personal_data_change_v1') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;

create or replace function public.privacy_preview_v1() returns jsonb
language plpgsql security definer set search_path=public as $$
declare s privacy_state; v_counts jsonb; v_ids text; v_fingerprint text;
begin
  select * into s from privacy_state;
  select jsonb_build_object(
    'group_members',(select count(*) from group_members),'groups',(select count(*) from groups),
    'participants',(select count(*) from participants),'deliveries',(select count(*) from deliveries),
    'rsvp',(select count(*) from rsvp),'checkins',(select count(*) from checkins),
    'waiting_list',(select count(*) from waiting_list),
    'identity_challenges',(select count(*) from guest_identity_challenges),
    'identity_tickets',(select count(*) from guest_identity_tickets),
    'consents',(select count(*) from privacy_consents),
    'guest_photos_preserved',(select count(*) from guest_photos),
    'memories_preserved',(select count(*) from participants p left join deliveries d on d.id=p.delivery_id
      where p.message is not null or p.review_text is not null or p.reply is not null
        or (p.is_owner and (d.review_text is not null or d.met_photo_url is not null)))
      +(select count(*) from rsvp where nullif(btrim(memo),'') is not null)
      +(select count(*) from deliveries d where (d.review_text is not null or d.met_photo_url is not null)
         and not exists(select 1 from participants p where p.delivery_id=d.id and p.is_owner))
  ) into v_counts;
  select string_agg(kind||id::text,',' order by kind,id) into v_ids from (
    select 'member' as kind,id from group_members union all select 'participant',id from participants
    union all select 'delivery',id from deliveries union all select 'rsvp',id from rsvp
    union all select 'waiting',id from waiting_list union all select 'group',id from groups
  ) t;
  v_fingerprint:=encode(extensions.digest(v_counts::text||coalesce(v_ids,''),'sha256'),'hex');
  return jsonb_build_object('retention_until',s.retention_until,'eligible',now()>=s.retention_until,
    'purged_at',s.purged_at,'receipt',s.receipt,'external_checks',s.external_checks,
    'counts',v_counts,'fingerprint',v_fingerprint);
end $$;

create or replace function public.purge_operational_privacy_v1(p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s privacy_state; v_preview jsonb; v_receipt jsonb;
begin
  select * into s from privacy_state for update;
  if s.purged_at is not null then return s.receipt; end if;
  if now()<s.retention_until then raise exception 'retention_not_expired'; end if;
  lock table group_members,groups,participants,deliveries,rsvp,checkins,waiting_list,
    guest_identity_challenges,guest_identity_tickets,privacy_consents,guest_photos in share row exclusive mode;
  v_preview:=privacy_preview_v1();
  if v_preview->>'fingerprint' is distinct from p_fingerprint then raise exception 'targets_changed'; end if;
  perform set_config('privacy.purging','on',true);

  insert into guest_memories(id,kind,name,stamp,message,rating,review,photo_url,reply,replied_at,created_at,is_private)
    select p.id,p.type,'하객',p.stamp,p.message,
      coalesce(p.review_rating,case when p.is_owner then d.review_rating end),
      coalesce(p.review_text,case when p.is_owner then d.review_text end),
      case when p.is_owner then d.met_photo_url end,p.reply,p.replied_at,p.created_at,p.is_private
    from participants p left join deliveries d on d.id=p.delivery_id
    where p.message is not null or p.review_text is not null or p.reply is not null
      or (p.is_owner and (d.review_text is not null or d.met_photo_url is not null));
  insert into guest_memories(id,kind,name,message,rating,review,photo_url,created_at,is_private)
    select d.id,'직접배달','하객',null,d.review_rating,d.review_text,d.met_photo_url,d.created_at,false
    from deliveries d where (d.review_text is not null or d.met_photo_url is not null)
      and not exists(select 1 from participants p where p.delivery_id=d.id and p.is_owner);
  insert into guest_memories(id,kind,name,message,created_at,is_private)
    select id,'참석 메시지','하객',memo,created_at,true from rsvp where nullif(btrim(memo),'') is not null;
  update guest_photos set name=null;

  delete from notification_outbox;
  delete from guest_identity_challenges;
  delete from guest_identity_tickets;
  delete from privacy_consents;
  delete from manage_recovery_tokens;
  delete from checkins;
  delete from group_attendance;
  delete from group_members;
  delete from participants;
  delete from admin_order_requests;
  delete from deliveries;
  delete from rsvp;
  delete from waiting_list;
  delete from groups;
  delete from admin_sessions;
  delete from rate_limits;

  v_receipt:=jsonb_build_object('id',gen_random_uuid(),'completed_at',now(),
    'removed',(v_preview->'counts')-'guest_photos_preserved'-'memories_preserved','preserved_memories',(select count(*) from guest_memories),
    'preserved_photos',(select count(*) from guest_photos),'external_copies_pending',true);
  update privacy_state set purged_at=now(),receipt=v_receipt;
  insert into privacy_access_log(action,outcome,resource) values('privacy_purge','success','operational_data');
  return v_receipt;
end $$;

create or replace function public.reject_expired_collection_v1() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if current_setting('privacy.purging',true) is distinct from 'on'
     and now()>=(select retention_until from privacy_state) then raise exception 'collection_closed'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['group_members','groups','participants','deliveries','rsvp','waiting_list','checkins'] loop
    execute format('drop trigger if exists privacy_collection_deadline on public.%I',t);
    execute format('create trigger privacy_collection_deadline before insert or update on public.%I for each row execute function public.reject_expired_collection_v1()',t);
  end loop;
end $$;
drop trigger if exists privacy_collection_deadline on guest_photos;
create trigger privacy_collection_deadline before insert on guest_photos for each row execute function reject_expired_collection_v1();

-- Preserve the visibility of archived messages after removing operational data.
create or replace function public.get_celebrations()
returns table(id uuid,kind text,name text,area text,date date,stamp text,message text,rating integer,
  review text,reply text,replied_at timestamptz,created_at timestamptz)
language sql security definer set search_path=public as $$
  select * from (
    select p.id,p.type as kind,
      case when now()>=(select retention_until from privacy_state) then '하객'
        when p.type='마음배송' then case p.display_mode when 'name' then p.name
        when 'initial' then _mask_name(p.name) else coalesce(p.anon_alias,_anon_alias(p.id)) end else p.name end as name,
      case when now()>=(select retention_until from privacy_state) then null
        when p.type='마음배송' then case when p.show_region then p.region end
        else (regexp_split_to_array(btrim(d.location),'\s+'))[1]
          ||coalesce(' '||(regexp_split_to_array(btrim(d.location),'\s+'))[2],'') end as area,
      case when now()<(select retention_until from privacy_state) then d.date end,p.stamp,p.message,p.review_rating as rating,p.review_text as review,p.reply,p.replied_at,p.created_at
    from participants p left join deliveries d on d.id=p.delivery_id
    where (p.type='마음배송' and not p.is_private) or (p.type='직접배달' and d.status='완료')
    union all
    select m.id,m.kind,m.name,null::text,null::date,m.stamp,m.message,m.rating,m.review,m.reply,m.replied_at,m.created_at
      from guest_memories m where not m.is_private
  ) t order by created_at asc limit 300;
$$;

create or replace function public.cleanup_privacy_security_state_v1() returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from guest_identity_challenges where expires_at<now()-interval '1 hour';
  delete from guest_identity_tickets where expires_at<now()-interval '1 hour';
  delete from privacy_access_log where created_at<now()-interval '30 days';
  delete from admin_sessions where expires_at<now()-interval '1 day';
  perform purge_recovery_tokens();
  delete from rate_limits where window_start<now()-interval '1 day';
end $$;

create or replace function public.complete_privacy_external_check_v1(p_key text,p_done boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_checks jsonb;
begin
  if p_key is null or p_done is null or p_key not in ('local_copies','provider_backups','sms','admin_messages') then
    raise exception 'invalid_external_check';
  end if;
  update privacy_state set external_checks=jsonb_set(external_checks,array[p_key],to_jsonb(p_done))
    where purged_at is not null returning external_checks into v_checks;
  if not found then raise exception 'purge_required'; end if;
  return v_checks;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('privacy_preview_v1','purge_operational_privacy_v1','reject_expired_collection_v1','cleanup_privacy_security_state_v1','complete_privacy_external_check_v1') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;
do $$ begin
  if to_regnamespace('cron') is not null then
    execute $job$select cron.schedule('privacy-security-cleanup','15 18 * * *','select public.cleanup_privacy_security_state_v1();')$job$;
  end if;
end $$;

create or replace function public.get_guest_photos()
returns table(id uuid,url text,name text,message text,created_at timestamptz)
language sql security definer set search_path=public as $$
  select p.id,p.url,case when now()<(select retention_until from privacy_state) then p.name end,p.message,p.created_at
  from guest_photos p where p.approved
    and coalesce((select s.value<>'false'::jsonb and s.value<>'"false"'::jsonb from site_settings s where s.key='guest_snap_public'),true)
  order by p.created_at desc limit 300;
$$;

-- Pending purge: public roster and delivery schedule access expires at the deadline.
CREATE OR REPLACE FUNCTION public.get_group(p_slug text)
 RETURNS TABLE(id uuid, name text, slug text, offer_date date, offer_time text, offer_location text, offer_delivery_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, name, slug, offer_date, offer_time, offer_location, offer_delivery_id
  from public.groups where slug = p_slug and now()<(select retention_until from privacy_state);
$function$;

CREATE OR REPLACE FUNCTION public.get_group_orders(p_slug text)
 RETURNS TABLE(id uuid, date date, time_slot text, status text, tracking_stage text, member_names text[])
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id, d.date, d.time_slot, d.status, d.tracking_stage,
         coalesce(
           (select array_agg(p.name order by p.created_at)
            from public.participants p where p.delivery_id = d.id),
           '{}'::text[]
         ) as member_names
  from public.deliveries d
  join public.groups g on g.id = d.group_id
  where now()<(select retention_until from privacy_state) and g.slug = p_slug and d.status <> '취소'
  order by d.date;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_status(p_slug text)
 RETURNS TABLE(name text, applied boolean, date date, time_slot text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select gm.name,
         (d.id is not null) as applied,
         d.date, d.time_slot
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  left join public.deliveries d
    on d.group_id = gm.group_id and d.name = gm.name and d.status <> '취소'
  where now()<(select retention_until from privacy_state) and g.slug = p_slug
  order by gm.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.get_orders_on_date(p_date date, p_phone text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, time_slot text, member_count integer, owner_masked text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id, d.time_slot,
         (select count(*)::int from public.participants x where x.delivery_id = d.id) as member_count,
         (select case
                   when length(btrim(p.name)) <= 1 then btrim(p.name)
                   when length(btrim(p.name)) = 2
                     then substr(btrim(p.name), 1, 1) || '*'
                   else substr(btrim(p.name), 1, 1)
                        || repeat('*', length(btrim(p.name)) - 2)
                        || substr(btrim(p.name), length(btrim(p.name)), 1)
                 end
          from public.participants p
          where p.delivery_id = d.id
          order by p.is_owner desc, p.created_at asc
          limit 1) as owner_masked
  from public.deliveries d
  where now()<(select retention_until from privacy_state) and d.date = p_date and d.status in ('대기중', '확정')
    -- 정원(10명) 미만인 주문만 합석 제안
    and (select count(*) from public.participants x where x.delivery_id = d.id) < 10
    -- 본인 연락처가 이미 낀 주문은 제안하지 않음 (자기 주문에 합석 방지)
    and (
      p_phone is null
      or not exists (
        select 1 from public.participants pp
        where pp.delivery_id = d.id
          and regexp_replace(coalesce(pp.phone, ''), '\D', '', 'g')
              = regexp_replace(p_phone, '\D', '', 'g')
      )
    )
  order by d.created_at asc;
$function$;

