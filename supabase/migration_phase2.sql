-- ============================================================
-- Church Connect - Phase 2: announcements, contributions,
-- attendance updates, minister promotion
-- ============================================================

-- ---------- Announcements ----------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table announcements enable row level security;

create policy "ann_read" on announcements for select to authenticated using (true);
create policy "ann_write" on announcements for insert to authenticated with check (is_leader());
create policy "ann_delete" on announcements for delete to authenticated using (is_leader());

-- ---------- Contributions (manual entry; online payments later) ----------
create table contributions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles (id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  contribution_month date not null,        -- use the 1st of the month
  method text not null default 'manual' check (method in ('manual', 'cash', 'transfer', 'other')),
  recorded_by uuid references profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

alter table contributions enable row level security;

create policy "contrib_read" on contributions for select to authenticated
  using (is_leader() or person_id = auth.uid());
create policy "contrib_write" on contributions for insert to authenticated
  with check (is_leader());
create policy "contrib_delete" on contributions for delete to authenticated
  using (is_leader());

-- ---------- Attendance: allow leaders to correct records ----------
create policy "att_update" on attendance for update to authenticated
  using (is_leader() or my_role() = 'minister');

-- ---------- Minister promotion (core team and above) ----------
create or replace function promote_to_minister(target_person uuid, promotion_notes text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  old_status person_status;
  in_g5 int;
begin
  if my_role() not in ('super_admin', 'admin', 'main_leader', 'core_team') then
    raise exception 'Only Core Team and above can promote ministers';
  end if;

  select count(*) into in_g5 from g5_members where person_id = target_person;
  if in_g5 = 0 then
    raise exception 'All ministers must belong to a G5 group. Assign them to a G5 group first.';
  end if;

  select status into old_status from profiles where id = target_person;

  update profiles
     set status = 'minister', role = 'minister'
   where id = target_person;

  insert into status_changes (person_id, from_status, to_status, approved_by, notes)
  values (target_person, coalesce(old_status, 'member'), 'minister', auth.uid(), promotion_notes);
end;
$$;

-- ---------- Role management (admins change roles safely) ----------
create or replace function set_user_role(target_person uuid, new_role app_role)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if my_role() not in ('super_admin', 'admin', 'main_leader') then
    raise exception 'Only Admin / Main Leader can change roles';
  end if;
  update profiles set role = new_role where id = target_person;
end;
$$;
