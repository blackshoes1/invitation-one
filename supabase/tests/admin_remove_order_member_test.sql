begin;
do $$
declare d uuid; other_d uuid; p uuid; q uuid; m uuid;
begin
 insert into public.deliveries(location,date,time_slot) values('테스트','2026-09-19','오전') returning id into d;
 insert into public.deliveries(location,date,time_slot) values('테스트','2026-09-19','오전') returning id into other_d;
 insert into public.group_members(name) values('삭제검증') returning id into m;
 insert into public.participants(delivery_id,type,name,is_owner,group_member_id) values(d,'직접배달','삭제검증',true,m) returning id into p;
 insert into public.participants(delivery_id,type,name,is_owner) values(d,'직접배달','대표승계검증',false) returning id into q;
 if public.admin_remove_order_member_v1(other_d,p) <> 'already_removed' or not exists(select 1 from public.participants where id=p) then raise exception 'wrong order deletion'; end if;
 perform public.admin_remove_order_member_v1(d,p);
 if not exists(select 1 from public.participants where id=q and is_owner) then raise exception 'owner not reassigned'; end if;
 if not exists(select 1 from public.group_members where id=m) then raise exception 'roster removed'; end if;
 if public.admin_remove_order_member_v1(d,p) <> 'already_removed' then raise exception 'retry failed'; end if;
 perform public.admin_remove_order_member_v1(d,q);
 if not exists(select 1 from public.deliveries where id=d and status='취소') then raise exception 'empty order active'; end if;
 if has_function_privilege('anon','public.admin_remove_order_member_v1(uuid,uuid)','execute') or has_function_privilege('authenticated','public.admin_remove_order_member_v1(uuid,uuid)','execute') then raise exception 'public access'; end if;
end $$;
rollback;
