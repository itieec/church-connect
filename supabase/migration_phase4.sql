-- ============================================================
-- Church Connect - Phase 4: auto-assignment + QR self-registration
-- ============================================================

-- Pick the least-loaded active member of the "Follow Up" team.
-- Returns null if the team has no members (caller falls back).
create or replace function assign_followup_leader()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  chosen uuid;
begin
  select tm.person_id into chosen
  from team_members tm
  join teams t on t.id = tm.team_id and t.team_name = 'Follow Up' and t.is_active
  join profiles p on p.id = tm.person_id and p.is_active
  left join new_comers nc
    on nc.assigned_followup_leader_id = tm.person_id
   and nc.status in ('active', 'ready')
  group by tm.person_id
  order by count(nc.id) asc, random()
  limit 1;
  return chosen;
end;
$$;

-- Allow anonymous execution (QR self-registration calls this before insert)
grant execute on function assign_followup_leader() to anon;

-- Public (anonymous) newcomer self-registration via the QR web form.
-- Only INSERT is allowed; anon users can never read or modify records.
create policy "newcomers_public_insert" on new_comers
  for insert to anon with check (true);
