-- Supabase SQL Editor 에서 실행. (v16_rider_bride.sql 이후)
-- ★ 사이트 콘텐츠 설정 ★
--   Admin 에서 청첩장 사진(메인/갤러리)·영상 URL 을 코드 배포 없이 관리.
--   사진 파일은 Storage 버킷(invitation-media, public) 에 업로드.
--   키: hero_image(문자열) / gallery(배열 [{src,path,alt}]) / video_url / heart_video_url

/* 1) 설정 테이블 (key-value) */
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
-- anon 직접 접근 없음 — 조회는 아래 RPC, 쓰기는 Admin API(service role)만.

/* 2) 공개 조회 RPC — 청첩장/완료화면에서 사용 (허용 키만) */
create or replace function public.get_site_settings()
  returns jsonb
  language sql security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.site_settings
  where key in ('hero_image', 'gallery', 'video_url', 'heart_video_url');
$$;
grant execute on function public.get_site_settings() to anon;

/* 3) 미디어 업로드용 Storage 버킷 (public read) */
insert into storage.buckets (id, name, public)
values ('invitation-media', 'invitation-media', true)
on conflict (id) do update set public = true;
