-- ============================================================
-- IEEC YA Connect — Full Database Schema (Supabase / Postgres)
-- Authority: Architecture Handbook v0.3 + Chapter 4-6 drafts
-- Follow-Up: follow-up-permission-catalog.md (Baseline v1.0)
--            follow-up-workflows-and-state-transitions.md
--            follow-up-postgres-data-model.md
-- ADRs: ADR-001, ADR-002, ADR-006, ADR-007,
--        ADR-RBAC-001, ADR-RBAC-002, ADR-RBAC-003
--
-- Run this in the Supabase SQL Editor.
-- Sections:
--   1. Extensions
--   2. Enums
--   3. Core tables (organizations, people, user_accounts)
--   4. RBAC engine (role_templates, role_assignments, permission_overrides)
--   5. has_permission() resolution function
--   6. Follow-Up module tables
--   7. Supporting tables (calendar, forms, audit, config, notifications)
--   8. RLS policies
--   9. Seed: default Follow-Up role templates (uncomment + set ORG_ID)
--  10. Seed: config defaults (uncomment + set ORG_ID)
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 2. ENUMS
-- ============================================================

create type record_status_t as enum ('active', 'inactive', 'archived');

-- Ch.4 §4.6.1 — three canonical ministry statuses
create type ministry_status_t as enum ('newcomer', 'member', 'minister');

create type account_status_t as enum (
  'pending_invitation', 'invited', 'active', 'suspended', 'deactivated'
);
create type invitation_status_t as enum (
  'pending', 'sent', 'accepted', 'expired', 'cancelled'
);

-- Ch.6 §6.3 — canonical permission scopes
create type scope_type_t as enum (
  'platform', 'organization', 'ministry', 'team', 'group', 'specific_record'
);

create type override_effect_t as enum ('grant', 'deny');

-- Follow-Up journey states (workflow doc §3)
create type journey_status_t as enum (
  'registration_pending',
  'duplicate_review_required',
  'awaiting_assignment',
  'assigned',
  'contact_initiated',
  'active_follow_up',
  'temporarily_paused',
  'unable_to_contact',
  'inactive',
  'membership_review_ready',
  'membership_approval_in_progress',
  'transitioned_to_member',
  'declined_follow_up',
  'moved_to_other_ministry',
  'journey_closed',
  'reopened'
);

-- Follow-Up assignment statuses (workflow doc §5)
create type assignment_status_t as enum (
  'pending', 'active', 'paused', 'reassignment_requested', 'ended', 'cancelled'
);
create type assignment_type_t as enum (
  'primary', 'secondary', 'supporting', 'temporary'
);

-- Weekly report statuses (workflow doc §8)
create type report_status_t as enum (
  'not_open', 'pending', 'draft',
  'submitted_on_time', 'submitted_late',
  'missing', 'excused',
  'returned_for_correction', 'resubmitted',
  'reviewed', 'approved'
);

-- Attendance statuses (workflow doc §9)
create type attendance_status_t as enum (
  'attended', 'did_not_attend', 'unknown'
);

-- Membership approval step statuses (workflow doc §14)
create type approval_step_status_t as enum (
  'pending', 'approved', 'rejected',
  'returned_for_correction', 'skipped', 'cancelled', 'expired'
);

-- ============================================================
-- 3. CORE TABLES
-- ============================================================

-- Organizations — multi-tenant root (ADR-007)
create table organizations (
  id             uuid primary key default gen_random_uuid(),
  parent_org_id  uuid references organizations(id),  -- federation: ADR-007
  name           text not null,
  timezone       text not null default 'America/New_York',
  record_status  record_status_t not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- People — permanent ministry identity within an org (ADR-001, Ch.4 §4.2)
-- Person ≠ User Account. A person can exist before any login is created.
create table people (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  first_name              text not null,
  last_name               text not null,
  -- Normalized columns for duplicate detection (Ch.4 §4.9.1)
  normalized_first_name   text generated always as (lower(trim(first_name))) stored,
  normalized_last_name    text generated always as (lower(trim(last_name))) stored,
  sex                     text check (sex in ('male', 'female', 'prefer_not_to_say')),
  phone_display           text,
  phone_normalized        text,
  email_address           text,
  email_normalized        text generated always as (lower(trim(email_address))) stored,
  email_verified          boolean not null default false,
  contact_preference      jsonb,  -- { method, preferredTime, customTimeNote }
  photo_file_id           uuid,
  -- Ministry status — journey stage (Ch.4 §4.5)
  current_ministry_status ministry_status_t not null default 'newcomer',
  -- Record lifecycle (ADR-006, Ch.4 §4.11)
  record_status           record_status_t not null default 'active',
  has_user_account        boolean not null default false,
  -- Pointer to active journey (FK added below after newcomer_journeys)
  active_journey_id       uuid,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  deleted_by              uuid
);

create index on people (organization_id);
create index on people (organization_id, phone_normalized) where phone_normalized is not null;
create index on people (organization_id, email_normalized) where email_normalized is not null;
create index on people (organization_id, normalized_last_name, normalized_first_name);

-- User Accounts — auth identity linked to a Person (Ch.4 §4.3)
-- auth_uid is the Supabase auth.users id.
create table user_accounts (
  id                uuid primary key default gen_random_uuid(),
  auth_uid          uuid not null unique references auth.users(id),
  organization_id   uuid not null references organizations(id),
  person_id         uuid not null references people(id),
  email             text not null,
  account_status    account_status_t not null default 'pending_invitation',
  email_verified    boolean not null default false,
  invitation_status invitation_status_t,
  invited_at        timestamptz,
  activated_at      timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on user_accounts (organization_id, person_id);

-- Ministry status history — append-only, never overwrite (ADR-006, Ch.4 §4.6.2)
create table ministry_status_history (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  person_id       uuid not null references people(id),
  previous_status ministry_status_t,
  new_status      ministry_status_t not null,
  changed_by      uuid references people(id),
  workflow_ref    text,   -- e.g. membership_recommendation id
  reason          text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index on ministry_status_history (person_id, created_at desc);

-- ============================================================
-- 4. RBAC ENGINE
-- Ch.6: roles are live templates; assignment grants all template
-- permissions in scope; deny overrides win; time-bound.
-- ADR-002, ADR-RBAC-001, ADR-RBAC-002, ADR-RBAC-003
-- ============================================================

-- Role templates: named, reusable permission sets (ADR-002)
-- permissions[] holds canonical keys, e.g. 'follow_up.reports.review'
-- Templates are LIVE — editing permissions here affects all current holders (ADR-RBAC-002).
create table role_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  key             text not null,        -- stable identifier, e.g. 'follow_up_leader'
  name            text not null,
  description     text,
  permissions     text[] not null default '{}',
  is_system       boolean not null default false,  -- system templates cannot be deleted
  record_status   record_status_t not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  unique (organization_id, key)
);

-- Role assignments: links person + template + scope (ADR-RBAC-001, ADR-RBAC-003)
-- Assigning a role grants ALL template permissions in scope (Ch.6 §6.5 default grant rule).
create table role_assignments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id),
  person_id        uuid not null references people(id),
  role_template_id uuid not null references role_templates(id),
  scope_type       scope_type_t not null,
  scope_id         uuid,               -- e.g. team id, group id; NULL means org-wide in scope
  start_date       timestamptz,        -- optional start; no date = immediate
  end_date         timestamptz,        -- time-bound assignments (ADR-RBAC-003)
  is_active        boolean not null default true,
  notes            text,
  assigned_by      uuid references people(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index on role_assignments (person_id, is_active);
create index on role_assignments (organization_id, scope_type, scope_id);
create index on role_assignments (role_template_id);

-- Permission overrides: per-person grant/deny exceptions (Ch.6 §6.4.4)
-- Use to withhold one permission from a specific person (deny)
-- or to grant one permission without a full role assignment (grant).
-- DENY WINS over all grants (Ch.6 §6.2 rule 7, §6.8 step 1).
create table permission_overrides (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  person_id       uuid not null references people(id),
  permission_key  text not null,
  effect          override_effect_t not null,
  scope_type      scope_type_t not null,
  scope_id        uuid,
  start_date      timestamptz,
  end_date        timestamptz,
  is_active       boolean not null default true,
  reason          text not null,       -- Ch.6 §6.10 requires reason for all overrides
  created_by      uuid references people(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on permission_overrides (person_id, is_active);
create index on permission_overrides (organization_id, permission_key);

-- ============================================================
-- 5. PERMISSION RESOLUTION FUNCTION
-- Implements Ch.6 §6.8 resolution order:
--   0. System checks (account active)
--   1. Explicit DENY override → DENY
--   2. Explicit GRANT override → ALLOW
--   3-6. Role template permissions (covers oversight, position, team-role, membership)
--   7. Default DENY
-- ============================================================

create or replace function has_permission(
  perm         text,        -- permission key, e.g. 'follow_up.reports.review'
  p_scope_type text,        -- scope_type_t value as text
  p_scope_id   uuid         -- e.g. organization_id, team_id
)
returns boolean
language sql
stable
security definer
as $$
  with me as (
    -- Resolve caller's person_id and org from their auth.uid
    select ua.person_id, ua.organization_id
    from user_accounts ua
    where ua.auth_uid = auth.uid()
      and ua.account_status = 'active'
    limit 1
  ),

  -- Step 1: explicit DENY override wins over everything
  denied as (
    select 1
    from permission_overrides po
    join me on me.person_id = po.person_id
           and me.organization_id = po.organization_id
    where po.is_active
      and po.effect = 'deny'
      and po.permission_key = perm
      and po.scope_type = p_scope_type::scope_type_t
      and (po.scope_id = p_scope_id or po.scope_id is null)
      and (po.start_date is null or po.start_date <= now())
      and (po.end_date   is null or po.end_date   >  now())
  ),

  -- Step 2: explicit GRANT override
  grant_override as (
    select 1
    from permission_overrides po
    join me on me.person_id = po.person_id
           and me.organization_id = po.organization_id
    where po.is_active
      and po.effect = 'grant'
      and po.permission_key = perm
      and po.scope_type = p_scope_type::scope_type_t
      and (po.scope_id = p_scope_id or po.scope_id is null)
      and (po.start_date is null or po.start_date <= now())
      and (po.end_date   is null or po.end_date   >  now())
  ),

  -- Steps 3-6: role template permissions
  -- Covers oversight, org-position, team-role, and membership baseline grants
  -- A permission is present if ANY effective assignment has it on its template,
  -- unless a deny override applies (checked above).
  template_grant as (
    select 1
    from role_assignments ra
    join role_templates rt on rt.id = ra.role_template_id
    join me on me.person_id = ra.person_id
           and me.organization_id = ra.organization_id
    where ra.is_active
      and rt.record_status = 'active'
      and perm = any(rt.permissions)
      and ra.scope_type = p_scope_type::scope_type_t
      and (ra.scope_id = p_scope_id or ra.scope_id is null)
      and (ra.start_date is null or ra.start_date <= now())
      and (ra.end_date   is null or ra.end_date   >  now())
  )

  -- Resolution: no deny AND (grant override OR template grant)
  -- Default deny when neither override nor template grant exists (Ch.6 §6.2 rule 1)
  select
    not exists (select 1 from denied)
    and (
      exists (select 1 from grant_override)
      or exists (select 1 from template_grant)
    );
$$;

-- Convenience: check a permission at organization scope
create or replace function has_org_permission(perm text, org_id uuid)
returns boolean language sql stable security definer as $$
  select has_permission(perm, 'organization', org_id);
$$;

-- ============================================================
-- 6. FOLLOW-UP MODULE TABLES
-- Source: follow-up-postgres-data-model.md
--         follow-up-workflows-and-state-transitions.md
-- ============================================================

-- Calendar events — shared; Follow-Up attendance references these (workflow doc §9)
create table calendar_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  title           text not null,
  event_date      timestamptz not null,
  start_time      text,                -- '18:30'
  end_time        text,                -- '21:30'
  location        text,
  event_type      text not null default 'saturday_program',
  is_cancelled    boolean not null default false,
  created_by      uuid references people(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on calendar_events (organization_id, event_date);

-- Dynamic form definitions (Ch.7; Follow-Up weekly reports consume these)
create table form_definitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  form_key        text not null,   -- e.g. 'follow_up_weekly_report', 'newcomer_registration'
  version         int not null default 1,
  schema          jsonb not null,  -- field definitions, types, validation, sensitivity flags
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, form_key, version)
);

-- Newcomer journeys — one per follow-up path (workflow doc §3)
-- Person remains one record across multiple journeys (ADR-001, Ch.4 §4.8)
create table newcomer_journeys (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references organizations(id),
  person_id                   uuid not null references people(id),
  registration_date           timestamptz not null default now(),
  registration_source         text not null default 'public_web',
  -- Sources: public_web | qr_page | mobile_app | admin_internal | staff_assisted |
  --          event_checkin | import
  journey_status              journey_status_t not null default 'registration_pending',
  membership_readiness_status text not null default 'not_ready'
    check (membership_readiness_status in (
      'not_ready', 'review_requested', 'under_review', 'approved', 'rejected'
    )),
  previous_journey_id         uuid references newcomer_journeys(id),  -- returning person (Ch.4 §4.8)
  is_current_journey          boolean not null default true,
  welcome_message_status      text,
  started_at                  timestamptz not null default now(),
  completed_at                timestamptz,
  closure_reason              text,
  reopen_allowed              boolean not null default true,
  future_contact_ok           boolean,
  created_at                  timestamptz not null default now(),
  created_by                  uuid references people(id),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references people(id)
);

create index on newcomer_journeys (organization_id, journey_status);
create index on newcomer_journeys (person_id, is_current_journey);
create index on newcomer_journeys (organization_id, registration_date desc);

-- Now add the FK from people back to the active journey
alter table people
  add constraint fk_people_active_journey
  foreign key (active_journey_id) references newcomer_journeys(id);

-- Journey state transition history — every transition audited (workflow doc §19)
create table journey_transitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  journey_id      uuid not null references newcomer_journeys(id),
  from_status     journey_status_t,
  to_status       journey_status_t not null,
  action          text not null,       -- e.g. 'assigned', 'contact_initiated', 'paused'
  actor_person_id uuid references people(id),
  permission_used text,                -- which permission key authorized this transition
  reason          text,
  notes           text,
  is_automated    boolean not null default false,
  override_used   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index on journey_transitions (journey_id, created_at desc);

-- Follow-Up assignments — minister ↔ newcomer link (workflow doc §5)
-- Active primary assignment expected; warn if one already exists (app-level check).
create table follow_up_assignments (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  journey_id              uuid not null references newcomer_journeys(id),
  newcomer_person_id      uuid not null references people(id),
  assigned_person_id      uuid not null references people(id),
  assignment_type         assignment_type_t not null default 'primary',
  assignment_status       assignment_status_t not null default 'pending',
  reporting_required      boolean not null default true,
  supervising_leader_id   uuid references people(id),
  first_contact_deadline  timestamptz,
  expected_contact_freq   text,        -- e.g. 'weekly'
  start_date              timestamptz not null default now(),
  end_date                timestamptz,
  end_reason              text,
  assigned_by_person_id   uuid references people(id),
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Partial index: quick lookup of active assignments per journey
create index on follow_up_assignments (journey_id) where assignment_status = 'active';
create index on follow_up_assignments (assigned_person_id, assignment_status);
create index on follow_up_assignments (organization_id, assignment_status);

-- Weekly follow-up reports (workflow doc §8)
-- Report ≠ Attendance — two separate tables, non-negotiable (handbook)
create table follow_up_reports (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  journey_id              uuid not null references newcomer_journeys(id),
  newcomer_person_id      uuid not null references people(id),
  assignment_id           uuid not null references follow_up_assignments(id),
  reporting_week_start    timestamptz not null,
  reporting_week_end      timestamptz not null,
  due_at                  timestamptz not null,
  editable_until          timestamptz,    -- default: due_at + 7 days (configurable)
  locked_at               timestamptz,
  contact_made            boolean,
  contact_method          text check (contact_method in ('call', 'text', 'visit', 'other')),
  expected_to_attend      text check (expected_to_attend in ('yes', 'no', 'maybe', 'unknown')),
  report_status           report_status_t not null default 'pending',
  form_definition_id      uuid not null references form_definitions(id),
  form_version            int not null,
  dynamic_responses       jsonb not null default '{}',
  submitted_by_person_id  uuid references people(id),
  submitted_at            timestamptz,
  original_submitted_at   timestamptz,   -- never overwritten on edit (workflow doc §8)
  reviewer_person_id      uuid references people(id),
  reviewed_at             timestamptz,
  reviewer_notes          text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- One report per journey+assignment+week
  unique (journey_id, assignment_id, reporting_week_start)
);

create index on follow_up_reports (assignment_id, report_status);
create index on follow_up_reports (organization_id, report_status);
create index on follow_up_reports (newcomer_person_id);
create index on follow_up_reports (due_at) where report_status in ('pending', 'draft');

-- Report revision history — versioned edits (workflow doc §8)
create table follow_up_report_revisions (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references follow_up_reports(id),
  revised_by      uuid references people(id),
  revision_reason text,
  snapshot        jsonb not null,  -- full report row snapshot at revision time
  created_at      timestamptz not null default now()
);

-- Newcomer attendance (workflow doc §9)
-- Separate from weekly report. Saturday program, select status per event.
-- unique(person_id, calendar_event_id) is enforced at DB level — Firestore could not do this.
create table newcomer_attendance (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id),
  person_id             uuid not null references people(id),
  journey_id            uuid not null references newcomer_journeys(id),
  assignment_id         uuid references follow_up_assignments(id),
  calendar_event_id     uuid not null references calendar_events(id),
  program_date          timestamptz not null,
  attendance_status     attendance_status_t not null default 'unknown',
  recorded_by_person_id uuid references people(id),
  recorded_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  updated_by_person_id  uuid references people(id),
  correction_reason     text,
  unique (person_id, calendar_event_id)
);

create index on newcomer_attendance (journey_id);
create index on newcomer_attendance (organization_id, program_date);

-- Attendance correction history (leaders correct with history — workflow doc §9)
create table attendance_corrections (
  id                uuid primary key default gen_random_uuid(),
  attendance_id     uuid not null references newcomer_attendance(id),
  previous_status   attendance_status_t not null,
  new_status        attendance_status_t not null,
  corrected_by      uuid references people(id),
  correction_reason text not null,
  created_at        timestamptz not null default now()
);

-- Pastoral / bio notes (permission-gated by sensitivity)
create table newcomer_bio_entries (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id),
  person_id        uuid not null references people(id),
  journey_id       uuid references newcomer_journeys(id),
  category         text not null default 'general',
  -- Categories: 'general' | 'prayer_request' | 'concern' | 'sensitive' | 'pastoral'
  is_sensitive     boolean not null default false,
  content          text not null,
  added_by         uuid references people(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Soft delete (ADR-006)
  deleted_at       timestamptz,
  deleted_by       uuid references people(id)
);

create index on newcomer_bio_entries (person_id, is_sensitive);
create index on newcomer_bio_entries (journey_id) where deleted_at is null;

-- Pastoral/emergency escalations (workflow doc §12)
create table escalations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id),
  journey_id           uuid references newcomer_journeys(id),
  person_id            uuid not null references people(id),
  raised_by            uuid references people(id),
  sensitivity_category text not null default 'standard',
  description          text not null,
  status               text not null default 'submitted'
    check (status in (
      'submitted', 'under_review', 'assigned', 'action_in_progress',
      'resolved', 'closed', 'referred_externally'
    )),
  assigned_to          uuid references people(id),
  resolution_notes     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Welcome schedule (permission catalog §welcome)
create table welcome_schedules (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  journey_id          uuid not null references newcomer_journeys(id),
  newcomer_person_id  uuid not null references people(id),
  scheduled_date      timestamptz not null,
  welcomer_person_id  uuid references people(id),
  status              text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  notes               text,
  created_by          uuid references people(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Membership recommendations (workflow doc §13)
create table membership_recommendations (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id),
  journey_id            uuid not null references newcomer_journeys(id),
  newcomer_person_id    uuid not null references people(id),
  recommended_by        uuid not null references people(id),
  participation_summary text,
  attendance_summary    text,
  follow_up_summary     text,
  willingness_statement text,
  concerns              text,
  comments              text,
  next_steps            text,
  status                text not null default 'draft'
    check (status in (
      'draft', 'submitted', 'under_review',
      'approved', 'rejected', 'returned_for_correction'
    )),
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Configurable approval workflow steps (workflow doc §14)
-- Template-driven: e.g. Minister → Leader → Core Team → Head Leader
create table membership_approval_steps (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  recommendation_id   uuid not null references membership_recommendations(id),
  step_number         int not null,
  step_name           text not null,       -- e.g. 'Follow-Up Leader Review'
  approver_person_id  uuid references people(id),
  approver_role_key   text,                -- fallback: any person with this role template key
  status              approval_step_status_t not null default 'pending',
  decision_at         timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (recommendation_id, step_number)
);

-- ============================================================
-- 7. SUPPORTING TABLES
-- ============================================================

-- Notifications (Ch.11)
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  recipient_id    uuid not null references people(id),
  title           text not null,
  body            text,
  type            text not null,
  payload         jsonb,
  is_read         boolean not null default false,
  read_at         timestamptz,
  sent_at         timestamptz not null default now()
);

create index on notifications (recipient_id, is_read);

-- App configuration — all admin-editable defaults (follow-up-config-defaults.md)
create table app_config (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  config_key      text not null,
  config_value    jsonb not null,
  updated_by      uuid references people(id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, config_key)
);

-- Append-only audit log — protected from client mutation (ADR-006, Ch.12)
create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  entity_type     text not null,       -- 'journey' | 'role_assignment' | 'report' | etc.
  entity_id       uuid not null,
  action          text not null,       -- 'created' | 'status_changed' | 'override_applied' | etc.
  actor_id        uuid,
  actor_type      text not null default 'user',   -- 'user' | 'system' | 'automation'
  previous_state  jsonb,
  new_state       jsonb,
  permission_used text,
  override_used   boolean not null default false,
  ip_address      text,
  user_agent      text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index on audit_logs (entity_type, entity_id);
create index on audit_logs (organization_id, created_at desc);
-- No UPDATE or DELETE policies — audit rows are immutable

-- ============================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- All decisions use has_permission() — UI hiding is not security (Ch.6 §6.9).
-- ============================================================

-- ---- Organizations ----
alter table organizations enable row level security;
create policy "org_members_read_own_org" on organizations for select
  using (id in (
    select ua.organization_id from user_accounts ua where ua.auth_uid = auth.uid()
  ));

-- ---- People ----
alter table people enable row level security;
create policy "read_people_with_fu_view" on people for select
  using (has_permission('follow_up.view', 'organization', organization_id));
create policy "admins_manage_people" on people for all
  using (has_org_permission('approve_accounts', organization_id));

-- ---- User Accounts ----
alter table user_accounts enable row level security;
create policy "read_own_account" on user_accounts for select
  using (auth_uid = auth.uid());
create policy "admins_read_accounts" on user_accounts for select
  using (has_org_permission('manage_roles', organization_id));

-- ---- Role Templates ----
alter table role_templates enable row level security;
create policy "everyone_reads_templates" on role_templates for select using (true);
create policy "admins_manage_templates" on role_templates for all
  using (has_org_permission('manage_roles', organization_id));

-- ---- Role Assignments ----
alter table role_assignments enable row level security;
create policy "view_own_assignments" on role_assignments for select
  using (
    person_id = (
      select p.id from people p join user_accounts ua on ua.person_id = p.id
      where ua.auth_uid = auth.uid() limit 1
    )
    or has_org_permission('manage_roles', organization_id)
  );
create policy "admins_manage_assignments" on role_assignments for all
  using (has_org_permission('manage_roles', organization_id));

-- ---- Permission Overrides ----
alter table permission_overrides enable row level security;
create policy "admins_manage_overrides" on permission_overrides for all
  using (has_org_permission('manage_roles', organization_id));

-- ---- Newcomer Journeys ----
alter table newcomer_journeys enable row level security;
create policy "view_journeys" on newcomer_journeys for select
  using (
    -- Leaders see all; ministers see only their assigned journeys (resolved via template)
    has_permission('follow_up.newcomers.view_all', 'organization', organization_id)
    or (
      has_permission('follow_up.view', 'organization', organization_id)
      and id in (
        select fa.journey_id from follow_up_assignments fa
        join user_accounts ua on ua.person_id = fa.assigned_person_id
        where ua.auth_uid = auth.uid() and fa.assignment_status = 'active'
      )
    )
  );
create policy "create_journey" on newcomer_journeys for insert
  with check (has_permission('follow_up.journey.create', 'organization', organization_id));
create policy "update_journey" on newcomer_journeys for update
  using (
    has_permission('follow_up.journey.mark_inactive', 'organization', organization_id)
    or has_permission('follow_up.journey.close', 'organization', organization_id)
    or has_permission('follow_up.journey.reopen', 'organization', organization_id)
  );

-- ---- Follow-Up Assignments ----
alter table follow_up_assignments enable row level security;
create policy "view_assignments" on follow_up_assignments for select
  using (has_permission('follow_up.view', 'organization', organization_id));
create policy "create_assignment" on follow_up_assignments for insert
  with check (has_permission('follow_up.assignments.create', 'organization', organization_id));
create policy "reassign" on follow_up_assignments for update
  using (
    has_permission('follow_up.assignments.reassign', 'organization', organization_id)
    or (
      -- Assigned minister may update their own assignment status
      assigned_person_id = (
        select p.id from people p join user_accounts ua on ua.person_id = p.id
        where ua.auth_uid = auth.uid() limit 1
      )
    )
  );

-- ---- Weekly Reports ----
alter table follow_up_reports enable row level security;
create policy "view_all_reports" on follow_up_reports for select
  using (
    has_permission('follow_up.reports.view_all', 'organization', organization_id)
    or submitted_by_person_id = (
      select p.id from people p join user_accounts ua on ua.person_id = p.id
      where ua.auth_uid = auth.uid() limit 1
    )
  );
create policy "submit_report" on follow_up_reports for insert
  with check (has_permission('follow_up.reports.submit', 'organization', organization_id));
create policy "edit_report" on follow_up_reports for update
  using (
    -- Author edits within edit window
    (
      has_permission('follow_up.reports.edit_own', 'organization', organization_id)
      and (editable_until is null or editable_until > now())
      and submitted_by_person_id = (
        select p.id from people p join user_accounts ua on ua.person_id = p.id
        where ua.auth_uid = auth.uid() limit 1
      )
    )
    -- Leader unlocks / edits after window
    or has_permission('follow_up.reports.edit_locked', 'organization', organization_id)
    -- Leader reviews / returns
    or has_permission('follow_up.reports.review', 'organization', organization_id)
  );

-- ---- Attendance ----
alter table newcomer_attendance enable row level security;
create policy "view_attendance" on newcomer_attendance for select
  using (
    has_permission('follow_up.attendance.view_all', 'organization', organization_id)
    or (
      has_permission('follow_up.attendance.record_assigned', 'organization', organization_id)
      and recorded_by_person_id = (
        select p.id from people p join user_accounts ua on ua.person_id = p.id
        where ua.auth_uid = auth.uid() limit 1
      )
    )
  );
create policy "record_attendance" on newcomer_attendance for insert
  with check (has_permission('follow_up.attendance.record_assigned', 'organization', organization_id));
create policy "correct_attendance" on newcomer_attendance for update
  using (has_permission('follow_up.attendance.correct', 'organization', organization_id));

-- ---- Bio Entries ----
alter table newcomer_bio_entries enable row level security;
create policy "view_bio" on newcomer_bio_entries for select
  using (
    deleted_at is null
    and (
      (not is_sensitive and has_permission('follow_up.bio.view', 'organization', organization_id))
      or (is_sensitive and has_permission('follow_up.bio.view_sensitive', 'organization', organization_id))
    )
  );
create policy "add_bio" on newcomer_bio_entries for insert
  with check (has_permission('follow_up.bio.add', 'organization', organization_id));
create policy "soft_delete_bio" on newcomer_bio_entries for update
  using (has_permission('follow_up.bio.add', 'organization', organization_id));

-- ---- Membership Recommendations ----
alter table membership_recommendations enable row level security;
create policy "submit_recommendation" on membership_recommendations for insert
  with check (has_permission('membership.recommendations.submit', 'organization', organization_id));
create policy "view_recommendation" on membership_recommendations for select
  using (
    has_permission('follow_up.membership_review.start', 'organization', organization_id)
    or recommended_by = (
      select p.id from people p join user_accounts ua on ua.person_id = p.id
      where ua.auth_uid = auth.uid() limit 1
    )
  );
create policy "review_recommendation" on membership_recommendations for update
  using (has_permission('follow_up.membership_review.start', 'organization', organization_id));

-- ---- Welcome Schedules ----
alter table welcome_schedules enable row level security;
create policy "view_welcome_schedule" on welcome_schedules for select
  using (has_permission('follow_up.welcome_schedule.view', 'organization', organization_id));
create policy "create_welcome_schedule" on welcome_schedules for insert
  with check (has_permission('follow_up.welcome_schedule.create', 'organization', organization_id));
create policy "update_welcome_schedule" on welcome_schedules for update
  using (has_permission('follow_up.welcome_schedule.update', 'organization', organization_id));

-- ---- Audit Log ---- insert-only; no client deletes ----
alter table audit_logs enable row level security;
create policy "insert_audit" on audit_logs for insert with check (true);
create policy "read_audit" on audit_logs for select
  using (has_org_permission('view_reports', organization_id));

-- ============================================================
-- 9. SEED: DEFAULT FOLLOW-UP ROLE TEMPLATES
-- Source: follow-up-permission-catalog.md (Baseline v1.0)
-- Replace 'ORG_ID' with your real organization uuid.
-- Run AFTER inserting the organization row.
-- ============================================================

/*
do $$
declare
  v_org_id uuid := 'ORG_ID';  -- <-- replace with actual org id
begin

  insert into role_templates
    (organization_id, key, name, description, is_system, permissions)
  values

  -- --------------------------------------------------------
  -- Follow-Up Leader: full management set in team scope
  -- (catalog §default-role-templates: Follow-Up Leader)
  -- --------------------------------------------------------
  (v_org_id, 'follow_up_leader', 'Follow-Up Leader',
   'Full Follow-Up management permissions within team scope.',
   true,
   array[
     -- Module access
     'follow_up.view',
     -- Newcomer / journey
     'follow_up.newcomers.view_unassigned',
     'follow_up.newcomers.view_all',
     'follow_up.journey.create',
     'follow_up.journey.mark_inactive',
     'follow_up.journey.close',
     'follow_up.journey.reopen',
     'follow_up.duplicate.review',
     -- Assignments
     'follow_up.assignments.create',
     'follow_up.assignments.reassign',
     -- Weekly reports
     'follow_up.reports.submit',
     'follow_up.reports.edit_own',
     'follow_up.reports.edit_locked',
     'follow_up.reports.review',
     'follow_up.reports.view_all',
     -- Attendance
     'follow_up.attendance.record_assigned',
     'follow_up.attendance.view_all',
     'follow_up.attendance.correct',
     -- Bio
     'follow_up.bio.view',
     'follow_up.bio.add',
     'follow_up.bio.view_sensitive',
     -- Membership
     'follow_up.membership_review.start',
     'membership.recommendations.submit',
     -- Chat & welcome schedule
     'follow_up.chat.create',
     'follow_up.chat.manage_members',
     'follow_up.welcome_schedule.view',
     'follow_up.welcome_schedule.create',
     'follow_up.welcome_schedule.assign',
     'follow_up.welcome_schedule.update',
     'follow_up.welcome_schedule.cancel',
     -- Calendar
     'calendar.event.create',
     'calendar.event.manage',
     -- Workflow override (audited)
     'workflow.override'
   ]),

  -- --------------------------------------------------------
  -- Follow-Up Assistant Leader:
  -- NO management permissions by default (Ch.6 §6.7, catalog §6.7)
  -- Add permissions explicitly to this template or via per-person overrides.
  -- Basic assigned-work comes from the minister template when also a team member.
  -- --------------------------------------------------------
  (v_org_id, 'follow_up_assistant_leader', 'Follow-Up Assistant Leader',
   'No management permissions by default. Extend via template edit or per-person grant override.',
   true,
   array[]::text[]),

  -- --------------------------------------------------------
  -- Follow-Up Minister / Team Member:
  -- Assigned-work operations on own newcomers only.
  -- (catalog §default-role-templates: Follow-Up Minister / Team Member)
  -- --------------------------------------------------------
  (v_org_id, 'follow_up_minister', 'Follow-Up Minister',
   'Assigned-work permissions: own newcomers, weekly reports, attendance, basic bio.',
   true,
   array[
     'follow_up.view',
     'follow_up.reports.submit',
     'follow_up.reports.edit_own',
     'follow_up.attendance.record_assigned',
     'follow_up.bio.view',
     'follow_up.bio.add',
     'membership.recommendations.submit',
     'follow_up.welcome_schedule.view'
   ]);

end $$;
*/

-- ============================================================
-- 10. SEED: CONFIG DEFAULTS (follow-up-config-defaults.md)
-- Replace 'ORG_ID' with your real organization uuid.
-- ============================================================

/*
do $$
declare
  v_org_id uuid := 'ORG_ID';  -- <-- replace with actual org id
begin

  insert into app_config (organization_id, config_key, config_value)
  values
    (v_org_id, 'follow_up.report.due_day',                '"friday"'),
    (v_org_id, 'follow_up.report.late_from',              '"saturday"'),
    (v_org_id, 'follow_up.report.timezone',               '"America/New_York"'),
    (v_org_id, 'follow_up.report.edit_window_days',       '7'),
    (v_org_id, 'follow_up.first_contact.deadline_hours',  '48'),
    (v_org_id, 'follow_up.welcome_message.enabled',       'true'),
    (v_org_id, 'follow_up.assignment.primary_reports_only','true'),
    (v_org_id, 'follow_up.attendance.enabled',            'true'),
    (v_org_id, 'follow_up.attendance.program',            '"Saturday 18:30-21:30"'),
    (v_org_id, 'follow_up.membership.approval_workflow',
      '["follow_up_minister","follow_up_leader","core_team","head_leader"]'),
    (v_org_id, 'follow_up.leader_role.default_full_management', 'true'),
    (v_org_id, 'follow_up.assistant_role.default_management',   'false')
  on conflict (organization_id, config_key) do nothing;

end $$;
*/
