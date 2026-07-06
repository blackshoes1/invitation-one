-- Supabase SQL Editor 에서 실행. (v17_site_settings.sql 이후)
-- 앨범(세이브 더 데이트 콜라주) 섹션 — 공개 설정 키에 'album' 추가

create or replace function public.get_site_settings()
  returns jsonb
  language sql security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.site_settings
  where key in ('hero_image', 'gallery', 'album', 'video_url', 'heart_video_url');
$$;
grant execute on function public.get_site_settings() to anon;
