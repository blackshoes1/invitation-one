-- Apply only after the new app is serving SMS verification.
revoke execute on function public.verify_guest_v2(text,text,date) from public,anon,authenticated;
grant execute on function public.verify_guest_v2(text,text,date) to service_role;
