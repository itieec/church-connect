-- ============================================================
-- role_permissions — backs the super-admin Permissions tab
-- (src/components/PermissionsTab.tsx via src/lib/permissions.ts)
--
-- Safe to run on the live database:
--   * additive only — creates one new table, touches nothing existing
--   * idempotent — re-running is a no-op
--
-- Rows are optional. When a role has no row, the app falls back to
-- DEFAULT_ROLE_PERMISSIONS in src/lib/permissions.ts.
--
-- Uses the existing my_role() helper from schema.sql (security definer,
-- so it reads profiles without tripping RLS).
-- ============================================================

create table if not exists role_permissions (
  role        text primary key,
  permissions jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table role_permissions enable row level security;

-- Everyone signed in reads permissions — the UI mirrors them on every screen.
drop policy if exists "role_permissions_read" on role_permissions;
create policy "role_permissions_read" on role_permissions
  for select to authenticated
  using (true);

-- Only super_admin may add or remove permissions.
drop policy if exists "role_permissions_write_super_admin" on role_permissions;
create policy "role_permissions_write_super_admin" on role_permissions
  for all to authenticated
  using      (my_role() = 'super_admin')
  with check (my_role() = 'super_admin');
