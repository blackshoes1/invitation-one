-- 배송 시간대에 '점심' 추가 (평일 점심 배달 허용)
-- 기존 값(오전·오후·저녁)은 그대로 두고 허용값만 넓힌다 — 추가 전용·비파괴.
-- 앱보다 먼저 적용해도 안전하다 (구 앱은 점심을 보내지 않는다).
-- 요일 규칙은 앱(slotsForDate)에서 관리: 주말 오전·오후·저녁 / 평일 점심·저녁.

alter table public.deliveries
  drop constraint if exists deliveries_time_slot_check;
alter table public.deliveries
  add constraint deliveries_time_slot_check
  check (time_slot in ('오전', '점심', '오후', '저녁'));

-- 그룹 제안 일정(groups.offer_time)에도 같은 제약이 있으면 함께 확장
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.groups'::regclass
       and conname = 'groups_offer_time_check'
  ) then
    execute 'alter table public.groups drop constraint groups_offer_time_check';
    execute $q$alter table public.groups add constraint groups_offer_time_check
      check (offer_time is null or offer_time in ('오전', '점심', '오후', '저녁'))$q$;
  end if;
end $$;
