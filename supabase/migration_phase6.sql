-- ============================================================
-- Church Connect - Phase 6: spiritual milestones + follow-up detail
-- ============================================================

alter table profiles add column if not exists date_of_birth date;
alter table profiles add column if not exists baptized boolean not null default false;
alter table profiles add column if not exists baptism_date date;
alter table profiles add column if not exists salvation_date date;

alter table follow_up_updates add column if not exists contact_method text
  check (contact_method in ('call', 'text', 'visit', 'other'));
alter table follow_up_updates add column if not exists next_follow_up_date date;
