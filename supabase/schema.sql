-- ============================================================
-- IEEC YA Ministry System ("Church Connect") - Supabase schema
-- Run this in the Supabase SQL Editor (or `supabase db push`).
-- ============================================================

-- ---------- Enums ----------
create type app_role as enum (
  'super_admin', 'admin', 'main_leader', 'core_team',
  'team_leader', 'minister', 'member', 'newcomer'
);

create type person_status as enum (
  'newcomer', 'follow_up', 'ready', 'member', 'minister', 'inactive'
);

create type yes_no as enum ('yes', 'no');

-- ---------- Profiles (linked to Supabase Auth) ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  gender text check (gender in ('male', 'female')),
  age_group text,
  address text,
  role app_role not null default 'newcomer',
  status person_status not null default 'newcomer',
  first_visit_date date default current_date,
  member_since date,
  photo_url text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  -- Link any pre-registered newcomer record with the same email
  update public.new_comers
     set person_id = new.id
   where person_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Newcomers / follow-up ----------
-- Newcomers are registered by leaders BEFORE they have an app account,
-- so contact info lives here; person_id links to a profile once they sign up.
create table new_comers (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references profiles (id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  registered_date date not null default current_date,
  source text check (source in ('walk_in', 'referral', 'event', 'other')) default 'walk_in',
  invited_by text,
  assigned_followup_leader_id uuid references profiles (id),
  status text not null default 'active' check (status in ('active', 'moved', 'inactive')),
  notes text,
  created_at timestamptz not null default now()
);

create table follow_up_updates (
  id uuid primary key default gen_random_uuid(),
  new_comer_id uuid not null references new_comers (id) on delete cascade,
  followed_by uuid not null references profiles (id),
  follow_up_date date not null default current_date,
  contacted yes_no not null default 'yes',
  came_to_church yes_no,
  needs_prayer yes_no,
  interested_in_bible_study yes_no,
  notes text,
  next_action text,
  created_at timestamptz not null default now()
);

-- ---------- Groups ----------
create table g5_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  leader_id uuid references profiles (id),
  meeting_day text,
  meeting_time text,
  size_limit int not null default 6, -- 1 leader + 5 members (changeable)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table g5_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references g5_groups (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  joined_at date not null default current_date,
  unique (group_id, person_id)
);

create table bible_study_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  leader_id uuid references profiles (id),
  assistant_leader_id uuid references profiles (id),
  book_being_studied text,
  start_date date,
  meeting_day text,
  meeting_time text,
  location text,
  online_link text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table bible_study_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references bible_study_groups (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  joined_at date not null default current_date,
  unique (group_id, person_id)
);

-- ---------- Ministry teams ----------
create table teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  description text,
  leader_id uuid references profiles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  role_in_team text default 'member',
  joined_at date not null default current_date,
  unique (team_id, person_id)
);

-- ---------- Attendance ----------
create table attendance (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles (id) on delete cascade,
  service_date date not null default current_date,
  service_type text not null default 'saturday_program',
  present boolean not null default true,
  recorded_by uuid references profiles (id),
  notes text,
  unique (person_id, service_date, service_type)
);

-- ---------- Approvals (audit of status changes) ----------
create table status_changes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles (id) on delete cascade,
  from_status person_status not null,
  to_status person_status not null,
  approved_by uuid not null references profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Helper: current user's role ----------
create or replace function my_role()
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_leader()
returns boolean
language sql stable security definer set search_path = public
as $$
  select my_role() in ('super_admin', 'admin', 'main_leader', 'core_team', 'team_leader');
$$;

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table new_comers enable row level security;
alter table follow_up_updates enable row level security;
alter table g5_groups enable row level security;
alter table g5_members enable row level security;
alter table bible_study_groups enable row level security;
alter table bible_study_members enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table attendance enable row level security;
alter table status_changes enable row level security;

-- Profiles: everyone signed-in can read; users update self; leaders update anyone
create policy "profiles_read" on profiles for select to authenticated using (true);
create policy "profiles_update_self" on profiles for update to authenticated
  using (id = auth.uid());
create policy "profiles_update_leader" on profiles for update to authenticated
  using (is_leader());

-- Newcomers: leaders + ministers manage; assigned leader sees theirs
create policy "newcomers_read" on new_comers for select to authenticated
  using (is_leader() or my_role() = 'minister'
         or assigned_followup_leader_id = auth.uid() or person_id = auth.uid());
create policy "newcomers_write" on new_comers for insert to authenticated
  with check (is_leader() or my_role() = 'minister');
create policy "newcomers_update" on new_comers for update to authenticated
  using (is_leader() or assigned_followup_leader_id = auth.uid());

-- Follow-up updates
create policy "fu_read" on follow_up_updates for select to authenticated
  using (is_leader() or my_role() = 'minister' or followed_by = auth.uid());
create policy "fu_insert" on follow_up_updates for insert to authenticated
  with check (is_leader() or my_role() = 'minister');

-- Groups: readable by all authenticated; writable by leaders
create policy "g5_read"  on g5_groups  for select to authenticated using (true);
create policy "g5_write" on g5_groups  for all    to authenticated using (is_leader()) with check (is_leader());
create policy "g5m_read"  on g5_members for select to authenticated using (true);
create policy "g5m_write" on g5_members for all   to authenticated using (is_leader()) with check (is_leader());

create policy "bs_read"  on bible_study_groups  for select to authenticated using (true);
create policy "bs_write" on bible_study_groups  for all to authenticated using (is_leader()) with check (is_leader());
create policy "bsm_read" on bible_study_members for select to authenticated using (true);
create policy "bsm_write" on bible_study_members for all to authenticated using (is_leader()) with check (is_leader());

create policy "teams_read"  on teams for select to authenticated using (true);
create policy "teams_write" on teams for all to authenticated using (is_leader()) with check (is_leader());
create policy "tm_read"  on team_members for select to authenticated using (true);
create policy "tm_write" on team_members for all to authenticated using (is_leader()) with check (is_leader());

-- Attendance
create policy "att_read" on attendance for select to authenticated
  using (is_leader() or my_role() = 'minister' or person_id = auth.uid());
create policy "att_write" on attendance for insert to authenticated
  with check (is_leader() or my_role() = 'minister');

-- Status changes (approvals): core team and above
create policy "sc_read" on status_changes for select to authenticated using (is_leader());
create policy "sc_write" on status_changes for insert to authenticated
  with check (my_role() in ('super_admin', 'admin', 'main_leader', 'core_team', 'team_leader'));

-- ---------- Approval RPC: newcomer -> member ----------
create or replace function approve_to_member(target_new_comer uuid, approval_notes text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target_person uuid;
  old_status person_status;
begin
  if my_role() not in ('super_admin', 'admin', 'main_leader', 'core_team', 'team_leader') then
    raise exception 'Not authorized to approve members';
  end if;

  select person_id into target_person from new_comers where id = target_new_comer;

  update new_comers set status = 'moved' where id = target_new_comer;

  if target_person is not null then
    select status into old_status from profiles where id = target_person;

    update profiles
       set status = 'member',
           role = case when role = 'newcomer' then 'member'::app_role else role end,
           member_since = current_date
     where id = target_person;

    insert into status_changes (person_id, from_status, to_status, approved_by, notes)
    values (target_person, coalesce(old_status, 'newcomer'), 'member', auth.uid(), approval_notes);
  end if;
end;
$$;

-- ---------- Seed: 13 ministry teams ----------
insert into teams (team_name) values
  ('Bible Study'), ('Follow Up'), ('G5'), ('Usher'), ('Worship'),
  ('Media'), ('Sound System'), ('Prayer'), ('Evangelism'), ('Finance'),
  ('Hospitality'), ('Administration'), ('Outreach');
