-- Supabase SQL Editor 에서 실행. (v19_guest_photos.sql 이후)
-- ★ 배송 경로 (AD-1) ★
--   배송지(자유 텍스트 location)를 카카오 지오코딩해 좌표를 캐시.
--   관리자 '배송경로' 화면에서 날짜별 지도·동선 표시에 사용.

alter table public.deliveries
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geo_query text;  -- 좌표를 뽑은 원본 주소 (주소 바뀌면 재지오코딩)
