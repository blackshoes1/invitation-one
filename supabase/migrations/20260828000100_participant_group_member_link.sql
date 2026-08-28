-- P1-2: 개인 초대 토큰 → group_member identity 결속
-- 초대 토큰으로 생성된 신청(participants)을 명단의 사람(group_members)과 연결한다.
-- Next API 가 신청 성공 후 service_role 로 채운다 (RPC 시그니처 변경 없음 — 추가 전용).
-- unique 제약은 두지 않는다: 한 사람이 취소 후 재신청하거나 여러 참여 형태를
-- 오갈 수 있어(전환·합류) 강제 유일성은 실제 UX 를 깨뜨린다. 중복 감지는
-- 관리자 화면/CSV 에서 이 컬럼으로 확인한다.
--
-- ※ 앱 배포 순서와 무관하게 먼저 적용해도 안전 (추가 전용, 기존 경로에 영향 없음)

alter table public.participants
  add column if not exists group_member_id uuid
    references public.group_members(id) on delete set null;

create index if not exists participants_group_member_idx
  on public.participants (group_member_id)
  where group_member_id is not null;
