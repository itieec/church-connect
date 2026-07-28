/**
 * Role-based permissions system.
 *
 * Supabase table required (run once in Supabase SQL editor):
 *
 *   create table if not exists role_permissions (
 *     role text primary key,
 *     permissions jsonb not null default '[]'::jsonb,
 *     updated_at timestamptz default now()
 *   );
 *   alter table role_permissions enable row level security;
 *   create policy "read_role_permissions" on role_permissions for select using (true);
 *   create policy "super_admin_write_role_permissions" on role_permissions for all
 *     using ((select role from profiles where id = auth.uid()) = 'super_admin');
 */

import { supabase } from '@/lib/supabase';
import { AppRole } from '@/types';

export type Permission =
  | 'approve_accounts'
  | 'manage_roles'
  | 'manage_teams'
  | 'manage_announcements'
  | 'view_contributions'
  | 'manage_contributions'
  | 'manage_events'
  | 'view_followup'
  | 'manage_followup'
  | 'view_reports'
  | 'manage_groups'
  | 'manage_attendance'
  | 'view_directory'
  | 'manage_appointments'
  | 'manage_checkin'
  | 'send_notifications';

export const PERMISSION_LABELS: Record<Permission, string> = {
  approve_accounts: 'Approve new accounts',
  manage_roles: 'Change user roles',
  manage_teams: 'Manage ministry teams',
  manage_announcements: 'Post announcements',
  view_contributions: 'View contributions',
  manage_contributions: 'Manage contributions',
  manage_events: 'Manage events',
  view_followup: 'View follow-up records',
  manage_followup: 'Manage follow-up assignments',
  view_reports: 'View reports & analytics',
  manage_groups: 'Manage groups',
  manage_attendance: 'Record attendance',
  view_directory: 'View member directory',
  manage_appointments: 'Manage appointments',
  manage_checkin: 'QR check-in scanning',
  send_notifications: 'Send push notifications',
};

export const ALL_PERMISSIONS: Permission[] = Object.keys(PERMISSION_LABELS) as Permission[];

const ALL = new Set(ALL_PERMISSIONS);

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, Set<Permission>> = {
  super_admin: ALL,
  admin: new Set<Permission>([
    'approve_accounts', 'manage_teams', 'manage_announcements',
    'view_contributions', 'manage_contributions', 'manage_events',
    'view_followup', 'manage_followup', 'view_reports', 'manage_groups',
    'manage_attendance', 'view_directory', 'manage_appointments',
    'manage_checkin', 'send_notifications',
  ]),
  main_leader: new Set<Permission>([
    'approve_accounts', 'manage_teams', 'manage_announcements',
    'view_contributions', 'manage_events', 'view_followup', 'manage_followup',
    'view_reports', 'manage_groups', 'manage_attendance', 'view_directory',
    'manage_appointments', 'manage_checkin', 'send_notifications',
  ]),
  core_team: new Set<Permission>([
    'manage_announcements', 'view_followup', 'manage_followup',
    'manage_groups', 'manage_attendance', 'view_directory', 'manage_appointments',
    'manage_checkin',
  ]),
  team_leader: new Set<Permission>([
    'manage_teams', 'manage_attendance', 'view_directory', 'manage_appointments',
  ]),
  minister: new Set<Permission>([
    'view_followup', 'manage_attendance', 'view_directory',
  ]),
  member: new Set<Permission>(['view_directory']),
  newcomer: new Set<Permission>([]),
};

export type RolePermissionMap = Record<AppRole, Permission[]>;

export async function loadRolePermissions(): Promise<RolePermissionMap> {
  const defaults = buildDefaultMap();
  try {
    const { data, error } = await supabase.from('role_permissions').select('role, permissions');
    if (error || !data) return defaults;
    const merged = { ...defaults };
    for (const row of data as { role: AppRole; permissions: Permission[] }[]) {
      if (row.role in merged) merged[row.role] = row.permissions;
    }
    return merged;
  } catch {
    return defaults;
  }
}

export async function saveRolePermissions(role: AppRole, permissions: Permission[]): Promise<string | null> {
  const { error } = await supabase
    .from('role_permissions')
    .upsert({ role, permissions, updated_at: new Date().toISOString() }, { onConflict: 'role' });
  return error?.message ?? null;
}

export function hasPermission(map: RolePermissionMap, role: AppRole, permission: Permission): boolean {
  return role === 'super_admin' || (map[role]?.includes(permission) ?? false);
}

function buildDefaultMap(): RolePermissionMap {
  return Object.fromEntries(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, set]) => [role, Array.from(set)]),
  ) as RolePermissionMap;
}
