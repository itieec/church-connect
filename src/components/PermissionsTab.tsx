import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Switch,
} from 'react-native';
import { AppRole } from '@/types';
import {
  Permission, PERMISSION_LABELS, ALL_PERMISSIONS,
  RolePermissionMap, loadRolePermissions, saveRolePermissions,
} from '@/lib/permissions';
import { notify } from '@/lib/notify';
import { colors, font } from '@/theme';

const ROLES: AppRole[] = [
  'admin', 'main_leader', 'core_team', 'team_leader', 'minister', 'member', 'newcomer',
];

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  main_leader: 'Main Leader',
  core_team: 'Core Team',
  team_leader: 'Team Leader',
  minister: 'Minister',
  member: 'Member',
  newcomer: 'Newcomer',
};

export default function PermissionsTab() {
  const [map, setMap] = useState<RolePermissionMap | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>('admin');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const data = await loadRolePermissions();
    setMap(data);
    setDirty(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(permission: Permission) {
    if (!map) return;
    const current = map[selectedRole] ?? [];
    const next = current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission];
    setMap({ ...map, [selectedRole]: next });
    setDirty(true);
  }

  async function save() {
    if (!map) return;
    setSaving(true);
    const err = await saveRolePermissions(selectedRole, map[selectedRole]);
    setSaving(false);
    if (err) {
      notify('Save failed', err);
    } else {
      notify('Saved', `Permissions updated for ${ROLE_LABELS[selectedRole]}.`);
      setDirty(false);
    }
  }

  if (!map) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted, marginTop: 8 }}>Loading permissions…</Text>
      </View>
    );
  }

  const currentPerms = map[selectedRole] ?? [];

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.hint}>
        Select a role below to view and edit its permissions. Super Admin always has full access.
      </Text>

      {/* Role selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
        {ROLES.map((role) => (
          <TouchableOpacity
            key={role}
            onPress={() => { setSelectedRole(role); setDirty(false); }}
            style={[styles.roleChip, selectedRole === role && styles.roleChipActive]}
          >
            <Text style={[styles.roleChipText, selectedRole === role && { color: '#fff' }]}>
              {ROLE_LABELS[role]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Permission toggles */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Permissions for: <Text style={{ color: colors.primary }}>{ROLE_LABELS[selectedRole]}</Text>
        </Text>
        {ALL_PERMISSIONS.map((perm) => {
          const enabled = currentPerms.includes(perm);
          return (
            <View key={perm} style={styles.permRow}>
              <Text style={styles.permLabel} numberOfLines={2}>
                {PERMISSION_LABELS[perm]}
              </Text>
              <Switch
                value={enabled}
                onValueChange={() => toggle(perm)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          );
        })}
      </View>

      {/* Save button */}
      <TouchableOpacity
        onPress={save}
        disabled={!dirty || saving}
        style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
      >
        {saving
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.saveBtnText}>{dirty ? 'Save Changes' : 'No Changes'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontSize: 12, marginBottom: 10, lineHeight: 17 },
  roleScroll: { marginBottom: 14 },
  roleChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
  },
  roleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleChipText: { fontSize: 13, fontFamily: font.semibold, color: colors.text },
  card: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, padding: 12, marginBottom: 14,
  },
  cardTitle: { fontSize: 14, fontFamily: font.bold, color: colors.text, marginBottom: 10 },
  permRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  permLabel: { fontSize: 14, color: colors.text, flex: 1, marginRight: 12 },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 20,
  },
  saveBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
});
