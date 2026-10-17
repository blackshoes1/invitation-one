-- 그룹·개별 초대 연락처와 연결된 RSVP(사전 안내 수신 번호)를 한 트랜잭션에서 변경한다.
-- 기존 안내·본인 확인 권한은 RSVP 의 연락처 변경 트리거가 폐기한다.
begin;

create or replace function public.admin_update_member_phone_v1(p_group uuid, p_member uuid, p_phone text)
returns setof public.group_members
language plpgsql security invoker set search_path = ''
as $$
declare
  m public.group_members;
  r public.rsvp;
begin
  select * into m from public.group_members
    where id=p_member and group_id is not distinct from p_group for update;
  if not found then return; end if;

  if m.rsvp_id is not null then
    select * into r from public.rsvp where id=m.rsvp_id for update;
    -- 하이픈 유무가 달라도 같은 이름·번호의 다른 RSVP 로 조용히 합치지 않는다.
    if p_phone is not null and exists (
      select 1 from public.rsvp other where other.id<>r.id and other.name=r.name
        and regexp_replace(coalesce(other.phone,''),'\D','','g')=regexp_replace(p_phone,'\D','','g')
    ) then
      raise exception using errcode='23505', message='phone_conflict';
    end if;
    update public.rsvp set phone=p_phone, updated_at=now()
      where id=r.id and phone is distinct from p_phone;
  end if;

  return query update public.group_members gm set phone=p_phone where gm.id=m.id returning gm.*;
end;
$$;

revoke all on function public.admin_update_member_phone_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_update_member_phone_v1(uuid, uuid, text) to service_role;

-- 기존 연결은 rsvp_id 로만 보완한다. 연락처가 하나로 정해지고 다른 RSVP 와 충돌하지 않는 누락만 채운다.
with contacts as (
  select rsvp_id, min(phone) as phone from public.group_members
    where rsvp_id is not null and regexp_replace(coalesce(phone,''),'\D','','g') ~ '^01[0-9]{8,9}$'
    group by rsvp_id having count(distinct regexp_replace(phone,'\D','','g'))=1
)
update public.rsvp r set phone=c.phone, updated_at=now() from contacts c
  where r.id=c.rsvp_id and nullif(regexp_replace(coalesce(r.phone,''),'\D','','g'),'') is null
    and not exists (
      select 1 from public.rsvp other where other.id<>r.id and other.name=r.name
        and regexp_replace(coalesce(other.phone,''),'\D','','g')=regexp_replace(c.phone,'\D','','g')
    );

commit;
