-- P2-1: 하객 스냅 긴급 모더레이션 — 전체 공개 일시중지 스위치
-- site_settings.guest_snap_public = false 면 공개 조회(get_guest_photos)가
-- 빈 목록을 반환한다 (청첩장 GuestSnap·/live 월 등 모든 공개 경로 일괄 차단).
-- - 파일·행은 삭제하지 않는다 (스위치를 되켜면 그대로 복귀)
-- - 관리자 화면(/api/admin/guest-photos, service_role 직접 조회)은 영향 없음
-- - 키 미설정(기본) = 공개 유지 → 기존 동작 변화 없음
-- 개별 숨김(approved)·삭제는 기존 기능 그대로.

create or replace function public.get_guest_photos()
  returns table (id uuid, url text, name text, message text, created_at timestamptz)
  language sql security definer set search_path = public
as $$
  select p.id, p.url, p.name, p.message, p.created_at
  from public.guest_photos p
  where p.approved = true
    -- 명시적으로 false 로 저장된 경우에만 차단 (미설정/그 외 값 = 공개, 기존 동작)
    and coalesce(
      (select s.value <> 'false'::jsonb and s.value <> '"false"'::jsonb
         from public.site_settings s where s.key = 'guest_snap_public'),
      true
    )
  order by p.created_at desc
  limit 300;
$$;
grant execute on function public.get_guest_photos() to anon;
