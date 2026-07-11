-- Supabase SQL Editor 에서 실행. (v18_album_setting.sql 이후)
-- ★ 하객 스냅 (Epic A) ★
--   하객이 예식장/집에서 찍은 사진을 청첩장에서 업로드 → 하객 스냅 갤러리 노출
--   + Storage 'guest-photos' 버킷에 저장 → 시놀로지 Cloud Sync 로 NAS 자동 아카이브.
--   기본 즉시 공개(approved=true), 관리자가 숨김/삭제로 모더레이션.

/* 1) 하객 사진 테이블 */
create table if not exists public.guest_photos (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  path text not null,                 -- Storage 경로 (삭제·NAS 동기화용)
  name text,                          -- 하객 이름 (선택)
  message text,                       -- 한마디 (선택)
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.guest_photos enable row level security;
-- anon 직접 접근 없음. 공개 조회는 아래 RPC, 쓰기는 API(service role)만.

create index if not exists guest_photos_created_idx
  on public.guest_photos (created_at desc);

/* 2) 공개 조회 RPC — 승인된 사진만 (청첩장 갤러리) */
create or replace function public.get_guest_photos()
  returns table (id uuid, url text, name text, message text, created_at timestamptz)
  language sql security definer set search_path = public
as $$
  select id, url, name, message, created_at
  from public.guest_photos
  where approved = true
  order by created_at desc
  limit 300;
$$;
grant execute on function public.get_guest_photos() to anon;

/* 3) 업로드용 Storage 버킷 (public read) */
insert into storage.buckets (id, name, public)
values ('guest-photos', 'guest-photos', true)
on conflict (id) do update set public = true;
