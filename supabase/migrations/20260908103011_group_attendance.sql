-- Independent of delivery orders and legacy RSVP/heart attendance.
create table public.group_attendance (
  member_id uuid primary key references public.group_members(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  attendance text check (attendance in ('yes', 'maybe', 'no')),
  share_with_group boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint group_attendance_share_requires_response
    check (not share_with_group or attendance is not null)
);
create index group_attendance_group_idx on public.group_attendance(group_id);
alter table public.group_attendance enable row level security;
revoke all on public.group_attendance from public, anon, authenticated;
grant select, insert, update, delete on public.group_attendance to service_role;
