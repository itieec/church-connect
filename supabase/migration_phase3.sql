-- ============================================================
-- Church Connect - Phase 3: READY status, weekly group reports
-- ============================================================

-- Newcomers can be marked READY before approval to member
alter table new_comers drop constraint if exists new_comers_status_check;
alter table new_comers add constraint new_comers_status_check
  check (status in ('active', 'ready', 'moved', 'inactive'));

-- Weekly reports submitted by G5 / Bible Study leaders
create table group_reports (
  id uuid primary key default gen_random_uuid(),
  group_type text not null check (group_type in ('g5', 'bible_study')),
  group_id uuid not null,
  report_date date not null default current_date,
  attendance_count int check (attendance_count >= 0),
  lesson text,
  notes text,
  submitted_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table group_reports enable row level security;

create policy "gr_read" on group_reports for select to authenticated
  using (is_leader() or my_role() = 'minister' or submitted_by = auth.uid());
create policy "gr_write" on group_reports for insert to authenticated
  with check (is_leader() or my_role() = 'minister');
create policy "gr_delete" on group_reports for delete to authenticated
  using (is_leader());
