-- 그룹 명단에 RSVP 참석자 + 동반자 이름 저장
--  - rsvp_id    : 어느 RSVP 에서 불러온 명단인지 (같은 그룹에 중복 추가 방지)
--  - companions : 동반자 이름 배열. 빈 문자열 = 이름 미입력 칸 (배열 길이 = 동반 인원)
-- 공개 RPC(get_group_status 등)는 name 만 노출하므로 동반자 이름은 공개되지 않는다.
--
-- ※ 추가 전용·멱등 — 앱 배포 순서와 무관하게 먼저 적용해도 안전

alter table public.group_members
  add column if not exists rsvp_id uuid
    references public.rsvp(id) on delete set null;

alter table public.group_members
  add column if not exists companions text[] not null default '{}';

create unique index if not exists group_members_group_rsvp_idx
  on public.group_members (group_id, rsvp_id)
  where rsvp_id is not null;
