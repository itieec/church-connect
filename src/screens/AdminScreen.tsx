import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { notify, confirmDialog } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Card, Button, Empty, Field, StatusBadge } from '@/components/ui';
import PermissionsTab from '@/components/PermissionsTab';
import { colors, font } from '@/theme';
import { Profile } from '@/types';

interface AuditRow {
  id: string;
  from_status: string;
  to_status: string;
  notes: string | null;
  created_at: string;
  person: { full_name: string } | null;
  approver: { full_name: string } | null;
}

export default function AdminScreen() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [showTeam, setShowTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'users' | 'audit' | 'permissions'>('users');

  const load = useCallback(async () => {
    const [{ data: u }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name').limit(300),
      supabase
        .from('status_changes')
        .select(
          '*, person:profiles!status_changes_person_id_fkey(full_name), approver:profiles!status_changes_approved_by_fkey(full_name)',
        )
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    const list = (u as Profile[]) ?? [];
    setUsers(list);
    const counts: Record<string, number> = {};
    list.forEach((p) => {
      counts[p.role] = (counts[p.role] ?? 0) + 1;
    });
    setRoleCounts(counts);
    setAudit((a as unknown as AuditRow[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canApprove = !!me && ['super_admin', 'admin'].includes(me.role);

  function approveAccount(p: Profile) {
    confirmDialog(
      'Approve account',
      `${p.full_name} will get full access to the app and be notified.`,
      'Approve',
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ account_approved: true })
          .eq('id', p.id);
        if (error) notify('Error', error.message);
        else {
          notify('Approved', `${p.full_name} now has access. 🎉`);
          load();
        }
      },
    );
  }

  function toggleActive(p: Profile) {
    confirmDialog(
      p.is_active ? 'Deactivate user' : 'Reactivate user',
      `${p.full_name} will be marked ${p.is_active ? 'inactive' : 'active'}.`,
      'Confirm',
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({
            is_active: !p.is_active,
            status: p.is_active ? 'inactive' : 'member',
          })
          .eq('id', p.id);
        if (error) notify('Error', error.message);
        else load();
      },
    );
  }

  function exportMembersCsv() {
    if (Platform.OS !== 'web') {
      notify('Web only', 'Open the app in a browser to export CSV.');
      return;
    }
    const header = 'full_name,email,phone,role,status,member_since,first_visit,baptized,birthday\n';
    const body = users
      .map(
        (p) =>
          `"${p.full_name.replace(/"/g, '""')}",${p.email ?? ''},${p.phone ?? ''},${p.role},${p.status},${p.member_since ?? ''},${p.first_visit_date ?? ''},${p.baptized ? 'yes' : 'no'},${p.date_of_birth ?? ''}`,
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Minimal CSV line parser handling quoted fields. */
  function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQuotes = false;
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  function importNewcomersCsv() {
    if (Platform.OS !== 'web') {
      notify('Web only', 'Open the app in a browser to import CSV.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        notify('Empty file', 'Expected a header row plus data rows.');
        return;
      }
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
      const nameIdx = headers.findIndex((h) => h.includes('name'));
      if (nameIdx === -1) {
        notify('Bad format', 'CSV needs a "full_name" (or name) column. Optional: phone, email, source, notes.');
        return;
      }
      const phoneIdx = headers.findIndex((h) => h.includes('phone'));
      const emailIdx = headers.findIndex((h) => h.includes('email'));
      const notesIdx = headers.findIndex((h) => h.includes('note'));

      // existing contacts for dupe skip
      const { data: existing } = await supabase.from('new_comers').select('phone, email, full_name');
      const seen = new Set<string>();
      ((existing as { phone: string | null; email: string | null; full_name: string }[]) ?? []).forEach(
        (r) => {
          if (r.phone) seen.add(`p:${r.phone}`);
          if (r.email) seen.add(`e:${r.email.toLowerCase()}`);
          seen.add(`n:${r.full_name.toLowerCase()}`);
        },
      );

      const rows = [];
      let skipped = 0;
      for (const line of lines.slice(1)) {
        const cols = parseCsvLine(line);
        const name = cols[nameIdx];
        if (!name) continue;
        const ph = phoneIdx >= 0 ? cols[phoneIdx] : '';
        const em = emailIdx >= 0 ? (cols[emailIdx] ?? '').toLowerCase() : '';
        if ((ph && seen.has(`p:${ph}`)) || (em && seen.has(`e:${em}`)) || seen.has(`n:${name.toLowerCase()}`)) {
          skipped++;
          continue;
        }
        seen.add(`n:${name.toLowerCase()}`);
        rows.push({
          full_name: name,
          phone: ph || null,
          email: em || null,
          source: 'other',
          notes: notesIdx >= 0 ? cols[notesIdx] || null : null,
          assigned_followup_leader_id: me?.id ?? null,
        });
      }
      if (rows.length === 0) {
        notify('Nothing to import', `0 new rows (${skipped} duplicates skipped).`);
        return;
      }
      const { error } = await supabase.from('new_comers').insert(rows);
      if (error) notify('Import failed', error.message);
      else {
        notify('Imported', `${rows.length} newcomers added, ${skipped} duplicates skipped.`);
        load();
      }
    };
    input.click();
  }

  async function createTeam() {
    if (!teamName.trim()) {
      notify('Missing name', 'Team name is required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('teams').insert({
      team_name: teamName.trim(),
      description: teamDesc.trim() || null,
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      notify('Created', `Ministry team "${teamName.trim()}" added.`);
      setShowTeam(false);
      setTeamName('');
      setTeamDesc('');
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={styles.sectionTitle}>Roles Overview</Text>
        <View style={styles.roleWrap}>
          {Object.entries(roleCounts).map(([role, count]) => (
            <View key={role} style={styles.roleChip}>
              <Text style={styles.roleChipText}>
                {role.replace('_', ' ')}: {count}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Button title="+ Create Ministry Team" onPress={() => setShowTeam(true)} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="⬆ Import Newcomers CSV" variant="outline" onPress={importNewcomersCsv} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="⬇ Export Members CSV" variant="outline" onPress={exportMembersCsv} />
        </View>
      </View>

      <View style={styles.tabRow}>
        {(
          [
            ['users', 'Users'],
            ['audit', 'Audit Log'],
          ] as ['users' | 'audit' | 'permissions', string][]
        ).concat(
          me?.role === 'super_admin' ? [['permissions', 'Permissions']] : [],
        ).map(([k, label]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setTab(k)}
            style={[styles.tabPill, tab === k && styles.tabActive]}
          >
            <Text style={{ color: tab === k ? '#fff' : colors.text, fontFamily: font.semibold }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'users' && (
        <>
          {users.some((u) => !u.account_approved) && (
            <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.warning }}>
              <Text style={styles.sectionTitle}>🔑 Waiting for Approval</Text>
              {users
                .filter((u) => !u.account_approved)
                .map((u) => (
                  <View
                    key={u.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{u.full_name}</Text>
                      <Text style={styles.meta}>{u.email ?? 'no email'}</Text>
                    </View>
                    {canApprove ? (
                      <TouchableOpacity onPress={() => approveAccount(u)} style={styles.approveBtn}>
                        <Text style={{ color: '#fff', fontFamily: font.bold, fontSize: 12 }}>
                          ✓ Approve
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.meta}>admin only</Text>
                    )}
                  </View>
                ))}
            </Card>
          )}
          <Text style={styles.hint}>
            Tap a user to activate/deactivate. Change roles from the People tab.
          </Text>
          {users.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.row, !p.is_active && { opacity: 0.5 }]}
              onPress={() => p.id !== me?.id && toggleActive(p)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {p.full_name}
                  {p.id === me?.id ? ' (you)' : ''}
                </Text>
                <Text style={styles.meta}>
                  {p.role.replace('_', ' ')} · {p.email ?? 'no email'}
                </Text>
              </View>
              <StatusBadge status={p.is_active ? p.status : 'inactive'} />
            </TouchableOpacity>
          ))}
        </>
      )}

      {tab === 'audit' && (
        <>
          {audit.length === 0 && <Empty text="No status changes recorded yet." />}
          {audit.map((a) => (
            <Card key={a.id}>
              <Text style={styles.name}>{a.person?.full_name ?? 'Unknown'}</Text>
              <Text style={styles.meta}>
                {a.from_status.replace('_', ' ')} → {a.to_status.replace('_', ' ')} · approved by{' '}
                {a.approver?.full_name ?? 'Unknown'}
              </Text>
              <Text style={styles.meta}>{new Date(a.created_at).toLocaleString()}</Text>
              {a.notes ? <Text style={{ marginTop: 4, color: colors.text }}>{a.notes}</Text> : null}
            </Card>
          ))}
        </>
      )}

      {tab === 'permissions' && me?.role === 'super_admin' && (
        <PermissionsTab />
      )}

      <Modal visible={showTeam} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Ministry Team</Text>
            <Field label="Team Name" value={teamName} onChangeText={setTeamName} placeholder="e.g. Youth Choir" />
            <Field label="Description (optional)" value={teamDesc} onChangeText={setTeamDesc} multiline />
            <Button title="Create" onPress={createTeam} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowTeam(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 16, fontFamily: font.bold, color: colors.text, marginBottom: 10 },
  roleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleChip: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  roleChipText: { fontSize: 12, color: colors.text, textTransform: 'capitalize' },
  tabRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  hint: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  approveBtn: {
    backgroundColor: colors.success,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  name: { fontSize: 15, fontFamily: font.semibold, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 4,
  },
  modalTitle: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginBottom: 12 },
});
