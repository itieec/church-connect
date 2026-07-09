-- ============================================================
-- Church Connect - Phase 9: push triggers, unread, chat lock,
-- counseling privacy, volunteer scheduling
-- ============================================================

-- ---------- Push notifications straight from Postgres (pg_net) ----------
create extension if not exists pg_net with schema extensions;

-- Announcements → push everyone with a token
create or replace function push_on_announcement()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
declare msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', push_token,
    'title', '📢 ' || new.title,
    'body', coalesce(left(new.body, 120), 'New church announcement'),
    'sound', 'default'))
  into msgs from profiles where push_token is not null and is_active;
  if msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := msgs);
  end if;
  return new;
end; $$;

drop trigger if exists trg_push_announcement on announcements;
create trigger trg_push_announcement after insert on announcements
  for each row execute function push_on_announcement();

-- Chat messages → push group members (except sender)
create or replace function push_on_chat()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
declare msgs jsonb; gname text; sender text;
begin
  select full_name into sender from profiles where id = new.sender_id;
  gname := case new.group_type
    when 'g5' then (select group_name from g5_groups where id = new.group_id)
    when 'bible_study' then (select group_name from bible_study_groups where id = new.group_id)
    when 'team' then (select team_name from teams where id = new.group_id)
  end;
  select jsonb_agg(jsonb_build_object(
    'to', p.push_token,
    'title', '💬 ' || coalesce(gname, 'Group chat'),
    'body', coalesce(sender, 'Someone') || ': ' || left(new.content, 100),
    'sound', 'default'))
  into msgs
  from profiles p
  where p.push_token is not null and p.is_active and p.id <> new.sender_id
    and is_member_of(p.id, new.group_type, new.group_id);
  if msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := msgs);
  end if;
  return new;
end; $$;

-- membership check for an arbitrary person (trigger context)
create or replace function is_member_of(pid uuid, gtype text, gid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case gtype
    when 'g5' then exists (select 1 from g5_members where group_id = gid and person_id = pid)
    when 'bible_study' then exists (select 1 from bible_study_members where group_id = gid and person_id = pid)
    when 'team' then exists (select 1 from team_members where team_id = gid and person_id = pid)
    else false end;
$$;

drop trigger if exists trg_push_chat on group_messages;
create trigger trg_push_chat after insert on group_messages
  for each row execute function push_on_chat();

-- Appointment status changes → push the requester
create or replace function push_on_appointment()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
declare tok text;
begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'declined') then
    select push_token into tok from profiles where id = new.requester_id and push_token is not null;
    if tok is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'to', tok,
          'title', case when new.status = 'confirmed' then '📅 One-to-one confirmed' else 'One-to-one update' end,
          'body', case when new.status = 'confirmed'
                  then coalesce('Scheduled: ' || new.scheduled_at, 'A leader confirmed your request.')
                  else 'Your request could not be scheduled this time — a leader will follow up.' end,
          'sound', 'default'));
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_push_appt on appointments;
create trigger trg_push_appt after update on appointments
  for each row execute function push_on_appointment();

-- ---------- Unread tracking ----------
create table chat_reads (
  person_id uuid not null references profiles (id) on delete cascade,
  group_type text not null,
  group_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (person_id, group_type, group_id)
);
alter table chat_reads enable row level security;
create policy "cr_all" on chat_reads for all to authenticated
  using (person_id = auth.uid()) with check (person_id = auth.uid());

-- ---------- Leaders-only chat lock ----------
alter table g5_groups add column if not exists chat_locked boolean not null default false;
alter table bible_study_groups add column if not exists chat_locked boolean not null default false;
alter table teams add column if not exists chat_locked boolean not null default false;

create or replace function is_chat_locked(gtype text, gid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(case gtype
    when 'g5' then (select chat_locked from g5_groups where id = gid)
    when 'bible_study' then (select chat_locked from bible_study_groups where id = gid)
    when 'team' then (select chat_locked from teams where id = gid)
    else false end, false);
$$;

drop policy if exists "gm_insert" on group_messages;
create policy "gm_insert" on group_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (is_leader() or (is_group_member(group_type, group_id) and not is_chat_locked(group_type, group_id)))
  );

-- ---------- Counseling privacy (pastor-level only) ----------
drop policy if exists "appt_read" on appointments;
create policy "appt_read" on appointments for select to authenticated
  using (
    requester_id = auth.uid()
    or (topic = 'counseling' and my_role() in ('super_admin', 'admin', 'main_leader'))
    or (topic <> 'counseling' and is_leader())
  );

-- ---------- Volunteer scheduling ----------
create table team_schedules (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  service_date date not null,
  duty text,
  status text not null default 'assigned' check (status in ('assigned', 'confirmed', 'swap_requested')),
  created_at timestamptz not null default now()
);
alter table team_schedules enable row level security;
create policy "ts_read" on team_schedules for select to authenticated using (true);
create policy "ts_write" on team_schedules for insert to authenticated with check (is_leader());
create policy "ts_update" on team_schedules for update to authenticated
  using (is_leader() or person_id = auth.uid());
create policy "ts_delete" on team_schedules for delete to authenticated using (is_leader());
