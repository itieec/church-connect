import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { notify, confirmDialog } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Field, Empty, StatusBadge, Button } from '@/components/ui';
import { colors } from '@/theme';
import { Profile, AppRole } from '@/types';

const TRAINING_ITEMS = [
  'Foundations class',
  'Bible study participation',
  'Doctrine training',
  'Leadership basics',
  'Serving practicum',
];

const ROLES: AppRole[] = [
  'newcomer',
  'member',
  'minister',
  'team_leader',
  'core_team',
  'main_leader',
  'admin',
  'super_admin',
];

export default function DirectoryScreen() {
  const { profile: me, isLeader } = useAuth();
  const [people, setPeople] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [training, setTraining] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<{ date: string; label: string }[]>([]);
  const [growth, setGrowth] = useState<{ label: string; done: boolean; detail?: string }[]>([]);

  const canManageRoles = !!me && ['super_admin', 'admin', 'main_leader'].includes(me.role);
  const canPromote = !!me && ['super_admin', 'admin', 'main_leader', 'core_team'].includes(me.role);

  const load = useCallback(async () => {
    let q = supabase.from('profiles').select('*').order('full_name');
    if (search.trim()) q = q.ilike('full_name', `%${search.trim()}%`);
    const { data } = await q.limit(200);
    setPeople((data as Profile[]) ?? []);
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function openPerson(p: Profile) {
    setSelected(p);
    setTraining([]);
    setTimeline([]);
    setGrowth([]);

    const [tr, nc, sc, g5, bs, tm, att] = await Promise.all([
      supabase.from('training_progress').select('item').eq('person_id', p.id),
      supabase.from('new_comers').select('registered_date').eq('person_id', p.id).limit(1),
      supabase
        .from('status_changes')
        .select('to_status, created_at')
        .eq('person_id', p.id)
        .order('created_at'),
      supabase.from('g5_members').select('joined_at, group:g5_groups(group_name)').eq('person_id', p.id),
      supabase
        .from('bible_study_members')
        .select('joined_at, group:bible_study_groups(group_name)')
        .eq('person_id', p.id),
      supabase.from('team_members').select('joined_at, team:teams(team_name)').eq('person_id', p.id),
      supabase
        .from('attendance')
        .select('service_date')
        .eq('person_id', p.id)
        .eq('present', true)
        .order('service_date')
        .limit(1),
    ]);

    const items = ((tr.data as { item: string }[]) ?? []).map((r) => r.item);
    setTraining(items);

    // ---- Activity timeline ----
    const tl: { date: string; label: string }[] = [];
    const reg = (nc.data as { registered_date: string }[] | null)?.[0];
    if (reg) tl.push({ date: reg.registered_date, label: 'Registered as newcomer' });
    else if (p.first_visit_date) tl.push({ date: p.first_visit_date, label: 'First visit' });
    const firstAtt = (att.data as { service_date: string }[] | null)?.[0];
    if (firstAtt) tl.push({ date: firstAtt.service_date, label: 'First recorded attendance' });
    ((sc.data as { to_status: string; created_at: string }[]) ?? []).forEach((s) =>
      tl.push({
        date: s.created_at.slice(0, 10),
        label: `Became ${s.to_status.replace('_', ' ').toUpperCase()}`,
      }),
    );
    ((g5.data as unknown as { joined_at: string; group: { group_name: string } | null }[]) ?? []).forEach(
      (g) => tl.push({ date: g.joined_at, label: `Joined G5 ${g.group?.group_name ?? ''}`.trim() }),
    );
    ((bs.data as unknown as { joined_at: string; group: { group_name: string } | null }[]) ?? []).forEach(
      (g) => tl.push({ date: g.joined_at, label: `Joined Bible Study ${g.group?.group_name ?? ''}`.trim() }),
    );
    ((tm.data as unknown as { joined_at: string; team: { team_name: string } | null }[]) ?? []).forEach(
      (t) => tl.push({ date: t.joined_at, label: `Joined ${t.team?.team_name ?? 'ministry'} team` }),
    );
    if (p.baptized && p.baptism_date) tl.push({ date: p.baptism_date, label: 'Baptized ✝' });
    tl.sort((a, b) => a.date.localeCompare(b.date));
    setTimeline(tl);

    // ---- Spiritual growth path ----
    const inG5 = ((g5.data as unknown[]) ?? []).length > 0;
    const inBS = ((bs.data as unknown[]) ?? []).length > 0;
    const serving = ((tm.data as unknown[]) ?? []).length > 0;
    const isMember = ['member', 'minister'].includes(p.status);
    setGrowth([
      { label: 'Newcomer', done: true },
      { label: 'Followed up', done: p.status !== 'newcomer' || !!reg },
      { label: 'Member', done: isMember },
      { label: 'Baptized', done: p.baptized },
      { label: 'In Bible Study', done: inBS },
      { label: 'In G5 Group', done: inG5 },
      { label: 'Serving in ministry', done: serving },
      {
        label: 'Leadership training',
        done: items.length >= TRAINING_ITEMS.length,
        detail: `${items.length}/${TRAINING_ITEMS.length}`,
      },
      { label: 'Minister', done: p.role === 'minister' || p.status === 'minister' },
    ]);
  }

  async function toggleBaptized() {
    if (!selected) return;
    const newVal = !selected.baptized;
    const { error } = await supabase
      .from('profiles')
      .update({
        baptized: newVal,
        baptism_date: newVal ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq('id', selected.id);
    if (error) notify('Error', error.message);
    else {
      const updated = { ...selected, baptized: newVal };
      setSelected(updated);
      openPerson(updated);
      load();
    }
  }

  async function toggleTraining(item: string) {
    if (!selected) return;
    if (training.includes(item)) {
      await supabase
        .from('training_progress')
        .delete()
        .eq('person_id', selected.id)
        .eq('item', item);
      setTraining(training.filter((t) => t !== item));
    } else {
      const { error } = await supabase.from('training_progress').insert({
        person_id: selected.id,
        item,
        checked_by: me?.id ?? null,
      });
      if (error) notify('Error', error.message);
      else setTraining([...training, item]);
    }
  }

  function tenureMonths(p: Profile): number | null {
    if (!p.member_since) return null;
    return Math.floor((Date.now() - new Date(p.member_since).getTime()) / (30.44 * 86400000));
  }

  async function changeRole(role: AppRole) {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_user_role', {
      target_person: selected.id,
      new_role: role,
    });
    setBusy(false);
    if (error) notify('Error', error.message);
    else {
      notify('Updated', `${selected.full_name} is now ${role.replace('_', ' ')}.`);
      setSelected(null);
      load();
    }
  }

  function promote() {
    if (!selected) return;
    confirmDialog(
      'Promote to Minister',
      `${selected.full_name} will become a Minister. They must already be in a G5 group.`,
      'Promote',
      async () => {
        const { error } = await supabase.rpc('promote_to_minister', {
          target_person: selected.id,
        });
        if (error) notify('Cannot promote', error.message);
        else {
          notify('Promoted', `${selected.full_name} is now a Minister.`);
          setSelected(null);
          load();
        }
      },
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Field
          label="Search people"
          value={search}
          onChangeText={setSearch}
          placeholder="Type a name..."
        />
      </View>
      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        ListEmptyComponent={<Empty text="No people found." />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openPerson(item)}>
            <View style={styles.avatar}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {item.full_name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>{item.role.replace('_', ' ')}</Text>
            </View>
            <StatusBadge status={item.status} />
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <ScrollView>
              <Text style={styles.modalTitle}>{selected?.full_name}</Text>
              {selected && (
                <View style={{ marginBottom: 8 }}>
                  <StatusBadge status={selected.status} />
                </View>
              )}
              <Text style={styles.meta}>Email: {selected?.email ?? '—'}</Text>
              <Text style={styles.meta}>Phone: {selected?.phone ?? '—'}</Text>
              <Text style={styles.meta}>
                Role: {selected?.role.replace('_', ' ')} · First visit:{' '}
                {selected?.first_visit_date ?? '—'}
              </Text>

              {growth.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.sectionTitle}>Spiritual Growth Path</Text>
                  <View style={styles.growthWrap}>
                    {growth.map((g) => (
                      <View
                        key={g.label}
                        style={[styles.growthChip, g.done && styles.growthChipDone]}
                      >
                        <Text style={{ fontSize: 12, color: g.done ? '#fff' : colors.muted }}>
                          {g.done ? '✓ ' : ''}
                          {g.label}
                          {g.detail ? ` (${g.detail})` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {isLeader && (
                    <TouchableOpacity onPress={toggleBaptized} style={{ marginTop: 8 }}>
                      <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                        {selected?.baptized ? '✝ Baptized — tap to unmark' : '✝ Mark as baptized'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {timeline.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.sectionTitle}>Activity Timeline</Text>
                  {timeline.map((t, i) => (
                    <View key={`${t.date}-${i}`} style={styles.timelineRow}>
                      <Text style={styles.timelineDate}>{t.date}</Text>
                      <View style={styles.timelineDot} />
                      <Text style={styles.timelineLabel}>{t.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {canPromote && selected && selected.id !== me?.id && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.sectionTitle}>Minister Training</Text>
                  <Text style={styles.meta}>
                    Tenure:{' '}
                    {tenureMonths(selected) != null
                      ? `${tenureMonths(selected)} months as member ${
                          (tenureMonths(selected) ?? 0) >= 6 ? '✅ (6+ required)' : '(6+ required)'
                        }`
                      : 'not a member yet'}
                  </Text>
                  <View style={{ marginTop: 8 }}>
                    {TRAINING_ITEMS.map((item) => {
                      const done = training.includes(item);
                      return (
                        <TouchableOpacity
                          key={item}
                          style={styles.trainingRow}
                          onPress={() => toggleTraining(item)}
                        >
                          <Text style={{ fontSize: 16 }}>{done ? '✅' : '⬜'}</Text>
                          <Text style={{ color: colors.text, flex: 1 }}>{item}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.meta}>
                    {training.length}/{TRAINING_ITEMS.length} completed
                  </Text>
                </View>
              )}

              {canPromote && selected?.role !== 'minister' && selected?.id !== me?.id && (
                <View style={{ marginTop: 16 }}>
                  <Button title="Promote to Minister" onPress={promote} loading={busy} />
                </View>
              )}

              {canManageRoles && selected?.id !== me?.id && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.sectionTitle}>Set Role</Text>
                  <View style={styles.roleWrap}>
                    {ROLES.map((r) => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => changeRole(r)}
                        style={[styles.rolePill, selected?.role === r && styles.rolePillActive]}
                      >
                        <Text
                          style={{
                            color: selected?.role === r ? '#fff' : colors.text,
                            fontSize: 12,
                          }}
                        >
                          {r.replace('_', ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ marginTop: 16 }}>
                <Button title="Close" variant="outline" onPress={() => setSelected(null)} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8 },
  growthWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  growthChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  growthChipDone: { backgroundColor: colors.success, borderColor: colors.success },
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  timelineDate: { width: 86, fontSize: 11, color: colors.muted },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
    marginRight: 8,
  },
  timelineLabel: { flex: 1, fontSize: 13, color: colors.text },
  trainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  rolePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
});
