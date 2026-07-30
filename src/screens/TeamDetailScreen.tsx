import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { notify, confirmDialog } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Card, Button, Empty, Field } from '@/components/ui';
import { colors, font } from '@/theme';
import { Profile, Team } from '@/types';
import { MoreStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'TeamDetail'>;

interface MemberRow {
  id: string;
  role_in_team: string | null;
  person: Profile;
}

interface ScheduleRow {
  id: string;
  person_id: string;
  service_date: string;
  duty: string | null;
  status: 'assigned' | 'confirmed' | 'swap_requested';
  person?: { full_name: string } | null;
}

export default function TeamDetailScreen({ route, navigation }: Props) {
  const { teamId } = route.params;
  const { isLeader, profile: me } = useAuth();

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Profile[]>([]);

  // rota assignment modal
  const [showRota, setShowRota] = useState(false);
  const [rotaPerson, setRotaPerson] = useState<Profile | null>(null);
  const [rotaSearch, setRotaSearch] = useState('');
  const [rotaCandidates, setRotaCandidates] = useState<Profile[]>([]);
  const [rotaDate, setRotaDate] = useState('');
  const [rotaDuty, setRotaDuty] = useState('');
  const [savingRota, setSavingRota] = useState(false);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: t }, { data: m }, { data: s }] = await Promise.all([
      supabase.from('teams').select('*').eq('id', teamId).single(),
      supabase
        .from('team_members')
        .select('id, role_in_team, person:profiles(*)')
        .eq('team_id', teamId),
      supabase
        .from('team_schedules')
        .select('id, person_id, service_date, duty, status, person:profiles!team_schedules_person_id_fkey(full_name)')
        .eq('team_id', teamId)
        .gte('service_date', today)
        .order('service_date')
        .limit(20),
    ]);
    setTeam(t as Team);
    setMembers((m as unknown as MemberRow[]) ?? []);
    setSchedule((s as unknown as ScheduleRow[]) ?? []);
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function searchPeople(text: string) {
    setSearch(text);
    if (text.length < 2) {
      setCandidates([]);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('full_name', `%${text}%`)
      .limit(10);
    setCandidates((data as Profile[]) ?? []);
  }

  async function addMember(person: Profile) {
    const { error } = await supabase.from('team_members').insert({
      team_id: teamId,
      person_id: person.id,
    });
    if (error) notify('Error', error.message);
    else {
      setShowAdd(false);
      setSearch('');
      setCandidates([]);
      load();
    }
  }

  function removeMember(row: MemberRow) {
    confirmDialog(
      'Remove member',
      `Remove ${row.person.full_name} from ${team?.team_name}?`,
      'Remove',
      async () => {
        await supabase.from('team_members').delete().eq('id', row.id);
        load();
      },
    );
  }

  async function searchRotaPeople(text: string) {
    setRotaSearch(text);
    setRotaPerson(null);
    if (text.length < 2) {
      setRotaCandidates([]);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('full_name', `%${text}%`)
      .limit(8);
    setRotaCandidates((data as Profile[]) ?? []);
  }

  async function saveRota() {
    if (!rotaPerson || !/^\d{4}-\d{2}-\d{2}$/.test(rotaDate.trim())) {
      notify('Missing info', 'Pick a person and a date (YYYY-MM-DD).');
      return;
    }
    setSavingRota(true);
    const { error } = await supabase.from('team_schedules').insert({
      team_id: teamId,
      person_id: rotaPerson.id,
      service_date: rotaDate.trim(),
      duty: rotaDuty.trim() || null,
    });
    setSavingRota(false);
    if (error) notify('Error', error.message);
    else {
      setShowRota(false);
      setRotaPerson(null);
      setRotaSearch('');
      setRotaDate('');
      setRotaDuty('');
      load();
    }
  }

  async function setRotaStatus(row: ScheduleRow, status: ScheduleRow['status']) {
    const { error } = await supabase.from('team_schedules').update({ status }).eq('id', row.id);
    if (error) notify('Error', error.message);
    else load();
  }

  function removeRota(row: ScheduleRow) {
    confirmDialog(
      'Remove assignment',
      `${row.person?.full_name ?? 'This person'} on ${row.service_date}?`,
      'Remove',
      async () => {
        await supabase.from('team_schedules').delete().eq('id', row.id);
        load();
      },
    );
  }

  if (!team) return <Empty text="Loading..." />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={styles.name}>{team.team_name}</Text>
        {team.description ? <Text style={styles.meta}>{team.description}</Text> : null}
        <Text style={styles.meta}>Ministry team · {members.length} member{members.length === 1 ? '' : 's'}</Text>
      </Card>

      <Button
        title="💬 Team Chat"
        onPress={() =>
          navigation.navigate('TeamChat', {
            kind: 'team',
            groupId: teamId,
            groupName: team.team_name,
          })
        }
      />
      <View style={{ height: 8 }} />
      {isLeader && <Button title="+ Assign Member" onPress={() => setShowAdd(true)} />}

      <Text style={styles.sectionTitle}>Serving Schedule</Text>
      {isLeader && (
        <Button title="+ Assign to Rota" variant="outline" onPress={() => setShowRota(true)} />
      )}
      {schedule.length === 0 && <Empty text="No upcoming assignments." />}
      {schedule.map((s) => {
        const mineRow = s.person_id === me?.id;
        const statusIcon =
          s.status === 'confirmed' ? '✅' : s.status === 'swap_requested' ? '🔄' : '🕓';
        return (
          <TouchableOpacity
            key={s.id}
            style={styles.memberRow}
            onLongPress={() => isLeader && removeRota(s)}
          >
            <Text style={{ fontSize: 18 }}>{statusIcon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.semibold, color: colors.text }}>
                {s.person?.full_name ?? '—'}
                {mineRow ? ' (you)' : ''}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {s.service_date}
                {s.duty ? ` · ${s.duty}` : ''} · {s.status.replace('_', ' ')}
              </Text>
            </View>
            {mineRow && s.status === 'assigned' && (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Text
                  style={styles.rotaAction}
                  onPress={() => setRotaStatus(s, 'confirmed')}
                >
                  Confirm
                </Text>
                <Text
                  style={[styles.rotaAction, { color: colors.warning }]}
                  onPress={() => setRotaStatus(s, 'swap_requested')}
                >
                  Swap?
                </Text>
              </View>
            )}
            {isLeader && s.status === 'swap_requested' && (
              <Text style={styles.rotaAction} onPress={() => setRotaStatus(s, 'assigned')}>
                Reassign
              </Text>
            )}
          </TouchableOpacity>
        );
      })}

      <Text style={styles.sectionTitle}>Members</Text>
      {members.length === 0 && <Empty text="No members assigned yet." />}
      {members.map((m) => (
        <TouchableOpacity
          key={m.id}
          style={styles.memberRow}
          onLongPress={() => isLeader && removeMember(m)}
        >
          <View style={styles.avatar}>
            <Text style={{ color: '#fff', fontFamily: font.bold }}>
              {m.person.full_name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.semibold, color: colors.text }}>{m.person.full_name}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {m.role_in_team ?? 'member'} · {m.person.status.replace('_', ' ')}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
      {isLeader && members.length > 0 && (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          Long-press a member to remove them.
        </Text>
      )}

      {/* Rota assignment modal */}
      <Modal visible={showRota} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Assign to Rota — {team.team_name}</Text>
            <Field
              label={rotaPerson ? `Person: ${rotaPerson.full_name}` : 'Search person'}
              value={rotaSearch}
              onChangeText={searchRotaPeople}
              placeholder="Type at least 2 letters..."
            />
            {!rotaPerson &&
              rotaCandidates.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.candidate}
                  onPress={() => {
                    setRotaPerson(p);
                    setRotaSearch(p.full_name);
                    setRotaCandidates([]);
                  }}
                >
                  <Text style={{ fontFamily: font.semibold, color: colors.text }}>{p.full_name}</Text>
                </TouchableOpacity>
              ))}
            <Field
              label="Service date (YYYY-MM-DD)"
              value={rotaDate}
              onChangeText={setRotaDate}
              placeholder="2026-07-11"
            />
            <Field
              label="Duty (optional)"
              value={rotaDuty}
              onChangeText={setRotaDuty}
              placeholder="e.g. sound desk, welcome door"
            />
            <Button title="Assign" onPress={saveRota} loading={savingRota} />
            <Button title="Cancel" variant="outline" onPress={() => setShowRota(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Assign to {team.team_name}</Text>
            <Field
              label="Search by name"
              value={search}
              onChangeText={searchPeople}
              placeholder="Type at least 2 letters..."
            />
            <FlatList
              data={candidates}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: 260 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.candidate} onPress={() => addMember(item)}>
                  <Text style={{ fontFamily: font.semibold, color: colors.text }}>{item.full_name}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {item.status.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <Button title="Close" variant="outline" onPress={() => setShowAdd(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontFamily: font.bold, color: colors.text },
  meta: { color: colors.muted, marginTop: 2, fontSize: 13 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    color: colors.text,
    marginTop: 16,
    marginBottom: 10,
  },
  memberRow: {
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginBottom: 12 },
  rotaAction: { color: colors.primary, fontFamily: font.bold, fontSize: 12 },
  candidate: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
