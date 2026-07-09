-- ============================================================
-- Church Connect - Phase 8: group chat + one-to-one appointments
-- ============================================================

-- ---------- Group membership helper ----------
create or replace function is_group_member(gtype text, gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case gtype
    when 'g5' then exists (select 1 from g5_members where group_id = gid and person_id = auth.uid())
    when 'bible_study' then exists (select 1 from bible_study_members where group_id = gid and person_id = auth.uid())
    when 'team' then exists (select 1 from team_members where team_id = gid and person_id = auth.uid())
    else false
  end;
$$;

-- ---------- Group chat ----------
create table group_messages (
  id uuid primary key default gen_random_uuid(),
  group_type text not null check (group_type in ('g5', 'bible_study', 'team')),
  group_id uuid not null,
  sender_id uuid not null references profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index group_messages_idx on group_messages (group_type, group_id, created_at desc);

alter table group_messages enable row level security;

create policy "gm_read" on group_messages for select to authenticated
  using (is_leader() or is_group_member(group_type, group_id));
create policy "gm_insert" on group_messages for insert to authenticated
  with check (sender_id = auth.uid() and (is_leader() or is_group_member(group_type, group_id)));
create policy "gm_delete" on group_messages for delete to authenticated
  using (sender_id = auth.uid() or is_leader());

-- Realtime broadcasting of new messages
alter publication supabase_realtime add table group_messages;

-- ---------- One-to-one appointments ----------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles (id) on delete cascade,
  topic text not null check (topic in ('counseling', 'prayer', 'mentorship', 'bible_question', 'other')),
  notes text,
  preferred_times text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'completed')),
  scheduled_at text,          -- e.g. "2026-07-11 5:00 PM" (kept simple/flexible)
  handled_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table appointments enable row level security;

-- Sensitive: only the requester and leaders can see a request
create policy "appt_read" on appointments for select to authenticated
  using (requester_id = auth.uid() or is_leader());
create policy "appt_insert" on appointments for insert to authenticated
  with check (requester_id = auth.uid());
create policy "appt_update" on appointments for update to authenticated
  using (is_leader());
