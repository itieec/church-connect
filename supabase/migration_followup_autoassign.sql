-- ============================================================
-- Follow-up assignment: alert on arrival, auto-assign after 48h
--
--   1. A newcomer is registered.
--   2. Every follow-up leader is alerted immediately, and a 48h clock starts.
--   3. If nobody assigns them in time, the system assigns automatically:
--      same-sex follower first, then whoever carries the fewest newcomers.
--
-- Also adds a `team_leaders` view listing every leadership position across
-- the follow-up team, ministry teams, G5 groups and Bible study groups.
--
-- Idempotent — safe to re-run.
--
-- PREREQUISITE: enable pg_cron once, in Supabase → Database → Extensions.
-- ============================================================

-- ---------- 1. Assignment clock ----------

alter table newcomers add column if not exists assignment_due_at timestamptz;
alter table newcomers add column if not exists auto_assigned boolean not null default false;

comment on column newcomers.assignment_due_at is
  'Deadline for a leader to assign this newcomer manually. Past this, the cron job assigns automatically.';

-- Existing newcomers enter the same flow, timed from now so leaders get a full
-- window rather than everything firing at once on the next cron tick.
update newcomers
   set assignment_due_at = now() + interval '48 hours'
 where assignment_due_at is null;

-- Auto-assignment has no human actor, so this column must accept NULL.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'follow_up_assignments'
      and column_name = 'assigned_by'
      and is_nullable = 'NO'
  ) then
    alter table follow_up_assignments alter column assigned_by drop not null;
  end if;
end $$;

create index if not exists newcomers_assignment_due_idx
  on newcomers (assignment_due_at)
  where assignment_due_at is not null;

-- ---------- 2. Who can receive an assignment ----------

/**
 * Picks the best follow-up team member for a newcomer.
 *
 * Ordering:
 *   1. Same sex as the newcomer  — a woman is followed up by a woman.
 *   2. Fewest active newcomers   — spreads the load.
 *   3. Random                    — breaks ties without favouring row order.
 *
 * Sex is a preference, not a filter, so an empty same-sex pool falls back to
 * the least-loaded member rather than leaving the newcomer unassigned.
 * Note the column names differ: newcomers.sex vs profiles.gender.
 */
-- VOLATILE, not STABLE: random() is volatile, and the tie-break depends on it.
create or replace function pick_follow_up_assignee(p_sex text)
returns uuid
language sql
volatile
security definer
set search_path = public
as $$
  select p.id
  from profiles p
  left join lateral (
    select count(*) as n
    from follow_up_assignments fa
    where fa.assigned_to = p.id
      and fa.active
  ) load on true
  where p.follow_up_role in ('leader', 'assistant_leader', 'member')
    and coalesce(p.is_active, true)
    and coalesce(p.account_approved, true)
  order by
    case when p_sex in ('male', 'female') and p.gender = p_sex then 0 else 1 end,
    load.n asc,
    random()
  limit 1;
$$;

-- ---------- 3. Alert leaders the moment a newcomer arrives ----------

/**
 * Starts the 48h clock and alerts every follow-up leader.
 *
 * Runs for all registration paths — public form, leader-entered, CSV import —
 * so the app no longer sends this notification itself.
 */
create or replace function notify_leaders_on_newcomer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
begin
  new.assignment_due_at := coalesce(new.assignment_due_at, now() + interval '48 hours');

  insert into notifications (user_id, title, message, type, read)
  select p.id,
         'New newcomer awaiting assignment',
         v_name || ' registered and needs a follow-up person. '
                || 'Assign someone within 48 hours or the system will do it automatically.',
         'newcomer_registered',
         false
  from profiles p
  where p.follow_up_role in ('leader', 'assistant_leader')
    and coalesce(p.is_active, true);

  return new;
end;
$$;

drop trigger if exists newcomers_notify_leaders on newcomers;
create trigger newcomers_notify_leaders
  before insert on newcomers
  for each row execute function notify_leaders_on_newcomer();

-- ---------- 4. Auto-assign once the clock runs out ----------

/**
 * Assigns every overdue, still-unassigned newcomer.
 * Returns how many were assigned. Safe to call repeatedly.
 */
create or replace function auto_assign_overdue_newcomers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r           record;
  v_assignee  uuid;
  v_name      text;
  v_count     integer := 0;
begin
  for r in
    select n.*
    from newcomers n
    where n.assignment_due_at is not null
      and n.assignment_due_at <= now()
      and coalesce(n.status, 'new') not in ('moved', 'inactive')
      and not exists (
        select 1 from follow_up_assignments fa
        where fa.newcomer_id = n.id and fa.active
      )
  loop
    v_assignee := pick_follow_up_assignee(r.sex);

    -- No eligible team member: leave it for the leaders rather than guessing.
    continue when v_assignee is null;

    insert into follow_up_assignments (newcomer_id, assigned_to, assigned_by, assigned_at, active)
    values (r.id, v_assignee, null, now(), true);

    update newcomers
       set auto_assigned = true,
           assignment_due_at = null   -- clock consumed; stops re-processing
     where id = r.id;

    v_name := trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''));

    -- Tell the person who now owns the follow-up.
    insert into notifications (user_id, title, message, type, read)
    values (
      v_assignee,
      'You were assigned a newcomer',
      v_name || ' was assigned to you automatically because no leader responded within 48 hours. '
             || 'Please make contact this week.',
      'followup_assignment',
      false
    );

    -- And tell the leaders it happened, so nothing is silent.
    insert into notifications (user_id, title, message, type, read)
    select p.id,
           'Newcomer auto-assigned',
           v_name || ' was not assigned within 48 hours and went automatically to '
                  || coalesce((select full_name from profiles where id = v_assignee), 'a team member') || '.',
           'newcomer_auto_assigned',
           false
    from profiles p
    where p.follow_up_role in ('leader', 'assistant_leader')
      and coalesce(p.is_active, true);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------- 5. Run it on a schedule ----------

-- Every 15 minutes. The 48h deadline does not need minute precision, and this
-- keeps the job cheap.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('auto-assign-newcomers')
      where exists (select 1 from cron.job where jobname = 'auto-assign-newcomers');

    perform cron.schedule(
      'auto-assign-newcomers',
      '*/15 * * * *',
      $job$ select auto_assign_overdue_newcomers(); $job$
    );
  else
    raise notice 'pg_cron is not enabled — auto-assignment will not run on a schedule. Enable it in Database → Extensions, then re-run this file.';
  end if;
end $$;

-- ---------- 6. Every leadership position in one place ----------

/**
 * Union of leadership across the whole ministry: the follow-up team, ministry
 * teams (usher, worship, media, …), G5 groups and Bible study groups.
 */
create or replace view team_leaders as
  select 'Follow-Up'      as team_type,
         'Follow-Up Team' as team_name,
         p.id             as leader_id,
         p.full_name,
         p.follow_up_role as position
    from profiles p
   where p.follow_up_role in ('leader', 'assistant_leader')
     and coalesce(p.is_active, true)

  union all
  select 'Ministry Team', t.team_name, p.id, p.full_name, 'leader'
    from teams t
    join profiles p on p.id = t.leader_id
   where t.is_active

  union all
  select 'G5 Group', g.group_name, p.id, p.full_name, 'leader'
    from g5_groups g
    join profiles p on p.id = g.leader_id
   where g.is_active

  union all
  select 'Bible Study', b.group_name, p.id, p.full_name, 'leader'
    from bible_study_groups b
    join profiles p on p.id = b.leader_id
   where b.is_active

  union all
  select 'Bible Study', b.group_name, p.id, p.full_name, 'assistant_leader'
    from bible_study_groups b
    join profiles p on p.id = b.assistant_leader_id
   where b.is_active;

-- Views run as the caller, so the underlying table RLS still applies.
-- Guarded so the file also runs on a plain Postgres, where this role is absent.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on team_leaders to authenticated;
  end if;
end $$;
