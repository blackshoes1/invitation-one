-- Local/CI only. No production guest records; all fixtures rolled back.
begin;
do $$
declare g uuid; m uuid;
begin
  if not (select relrowsecurity from pg_class where oid='public.group_attendance'::regclass) then
    raise exception 'group_attendance RLS disabled';
  end if;
  if has_table_privilege('anon', 'public.group_attendance', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.group_attendance', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'group_attendance public privileges leaked';
  end if;
  if not has_table_privilege('service_role', 'public.group_attendance', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service role missing access';
  end if;
  insert into public.groups(name,slug) values ('group-space-test','group-space-fixture') returning id into g;
  insert into public.group_members(group_id,name) values (g,'테스트') returning id into m;
  insert into public.group_attendance(member_id,group_id) values (m,g);
  if (select attendance is not null or share_with_group from public.group_attendance where member_id=m) then
    raise exception 'unsafe defaults';
  end if;
  begin
    update public.group_attendance set share_with_group=true where member_id=m;
    raise exception 'null attendance accepted with sharing';
  exception when check_violation then null;
  end;
  update public.group_attendance set attendance='yes', share_with_group=true where member_id=m;
  update public.group_attendance set share_with_group=false where member_id=m;
end $$;
rollback;
