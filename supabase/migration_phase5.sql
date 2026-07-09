-- ============================================================
-- Church Connect - Phase 5: events, prayer requests, training
-- ============================================================

-- ---------- Events & RSVP ----------
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  event_time text,
  location text,
  created_by uuid references profiles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table events enable row level security;
create policy "ev_read" on events for select to authenticated using (true);
create policy "ev_write" on events for all to authenticated
  using (is_leader()) with check (is_leader());

create table event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  response text not null check (response in ('going', 'maybe', 'not_going')),
  created_at timestamptz not null default now(),
  unique (event_id, person_id)
);

alter table event_rsvps enable row level security;
create policy "rsvp_read" on event_rsvps for select to authenticated using (true);
create policy "rsvp_insert" on event_rsvps for insert to authenticated
  with check (person_id = auth.uid());
create policy "rsvp_update" on event_rsvps for update to authenticated
  using (person_id = auth.uid());

-- ---------- Prayer requests ----------
create table prayer_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles (id),
  requester_name text,
  request text not null,
  status text not null default 'open' check (status in ('open', 'prayed')),
  created_at timestamptz not null default now()
);

alter table prayer_requests enable row level security;
create policy "pr_read" on prayer_requests for select to authenticated
  using (is_leader() or my_role() = 'minister' or requester_id = auth.uid());
create policy "pr_insert" on prayer_requests for insert to authenticated
  with check (requester_id = auth.uid() or requester_id is null);
create policy "pr_update" on prayer_requests for update to authenticated
  using (is_leader() or my_role() = 'minister');

-- ---------- Minister training tracker ----------
create table training_progress (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles (id) on delete cascade,
  item text not null,
  completed_at date not null default current_date,
  checked_by uuid references profiles (id),
  unique (person_id, item)
);

alter table training_progress enable row level security;
create policy "tp_read" on training_progress for select to authenticated
  using (is_leader() or person_id = auth.uid());
create policy "tp_write" on training_progress for insert to authenticated
  with check (my_role() in ('super_admin', 'admin', 'main_leader', 'core_team'));
create policy "tp_delete" on training_progress for delete to authenticated
  using (my_role() in ('super_admin', 'admin', 'main_leader', 'core_team'));
