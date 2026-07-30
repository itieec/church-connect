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
import { Profile } from '@/types';
import { GroupsStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<GroupsStackParamList, 'GroupDetail'>;
// navigation is used for opening the group chat

interface GroupRow {
  id: string;
  group_name: string;
  leader_id: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  size_limit?: number;
  book_being_studied?: string | null;
  location?: string | null;
  online_link?: string | null;
}

interface MemberRow {
  id: string;
  person: Profile;
}

interface ReportRow {
  id: string;
  report_date: string;
  attendance_count: number | null;
  lesson: string | null;
  notes: string | null;
}

export default function GroupDetailScreen({ route, navigation }: Props) {
  const { kind, groupId } = route.params;
  const { isLeader, profile: me } = useAuth();
  const canReport = isLeader || me?.role === 'minister';

  const groupTable = kind === 'g5' ? 'g5_groups' : 'bible_study_groups';
  const memberTable = kind === 'g5' ? 'g5_members' : 'bible_study_members';

  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [leader, setLeader] = useState<Profile | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);

  // add member modal
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Profile[]>([]);

  // edit group modal
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editBook, setEditBook] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [leaderSearch, setLeaderSearch] = useState('');
  const [leaderCandidates, setLeaderCandidates] = useState<Profile[]>([]);
  const [newLeader, setNewLeader] = useState<Profile | null>(null);

  // weekly report modal
  const [showReport, setShowReport] = useState(false);
  const [repAttendance, setRepAttendance] = useState('');
  const [repLesson, setRepLesson] = useState('');
  const [repNotes, setRepNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: g }, { data: m }, { data: r }] = await Promise.all([
      supabase.from(groupTable).select('*').eq('id', groupId).single(),
      supabase.from(memberTable).select('id, person:profiles(*)').eq('group_id', groupId),
      supabase
        .from('group_reports')
        .select('id, report_date, attendance_count, lesson, notes')
        .eq('group_id', groupId)
        .order('report_date', { ascending: false })
        .limit(10),
    ]);
    const grp = g as GroupRow;
    setGroup(grp);
    setMembers((m as unknown as MemberRow[]) ?? []);
    setReports((r as ReportRow[]) ?? []);
    if (grp?.leader_id) {
      const { data: l } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', grp.leader_id)
        .single();
      setLeader(l as Profile);
    } else {
      setLeader(null);
    }
  }, [groupTable, memberTable, groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function openEdit() {
    if (!group) return;
    setEditName(group.group_name);
    setEditDay(group.meeting_day ?? '');
    setEditTime(group.meeting_time ?? '');
    setEditBook(group.book_being_studied ?? '');
    setEditLocation(group.location ?? '');
    setEditLimit(group.size_limit != null ? String(group.size_limit) : '');
    setNewLeader(null);
    setLeaderSearch('');
    setShowEdit(true);
  }

  async function searchPeople(text: string, forLeader = false) {
    if (forLeader) {
      setLeaderSearch(text);
      setNewLeader(null);
    } else {
      setSearch(text);
    }
    if (text.length < 2) {
      forLeader ? setLeaderCandidates([]) : setCandidates([]);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('full_name', `%${text}%`)
      .limit(8);
    forLeader
      ? setLeaderCandidates((data as Profile[]) ?? [])
      : setCandidates((data as Profile[]) ?? []);
  }

  async function saveEdit() {
    if (!editName.trim()) {
      notify('Missing name', 'Group name is required.');
      return;
    }
    setSaving(true);
    const patch: Record<string, unknown> = {
      group_name: editName.trim(),
      meeting_day: editDay.trim() || null,
      meeting_time: editTime.trim() || null,
    };
    if (newLeader) patch.leader_id = newLeader.id;
    if (kind === 'g5') {
      const lim = parseInt(editLimit, 10);
      if (lim > 0) patch.size_limit = lim;
    } else {
      patch.book_being_studied = editBook.trim() || null;
      patch.location = editLocation.trim() || null;
    }
    const { error } = await supabase.from(groupTable).update(patch).eq('id', groupId);
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      setShowEdit(false);
      load();
    }
  }

  async function addMember(person: Profile) {
    if (kind === 'g5' && group?.size_limit && members.length >= group.size_limit) {
      notify(
        'Group full',
        `This G5 group is limited to ${group.size_limit} people. The G5 Team Leader can change the size limit (Edit Group).`,
      );
      return;
    }
    const { error } = await supabase.from(memberTable).insert({
      group_id: groupId,
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

  async function removeMember(row: MemberRow) {
    confirmDialog(
      'Remove member',
      `Remove ${row.person.full_name} from this group?`,
      'Remove',
      async () => {
        await supabase.from(memberTable).delete().eq('id', row.id);
        load();
      },
    );
  }

  async function submitReport() {
    const count = repAttendance.trim() ? parseInt(repAttendance, 10) : null;
    if (repAttendance.trim() && (count == null || isNaN(count) || count < 0)) {
      notify('Invalid number', 'Attendance must be a positive number.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('group_reports').insert({
      group_type: kind,
      group_id: groupId,
      attendance_count: count,
      lesson: repLesson.trim() || null,
      notes: repNotes.trim() || null,
      submitted_by: me?.id ?? null,
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      notify('Submitted', 'Weekly report saved.');
      setShowReport(false);
      setRepAttendance('');
      setRepLesson('');
      setRepNotes('');
      load();
    }
  }

  if (!group) return <Empty text="Loading..." />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={styles.name}>{group.group_name}</Text>
        <Text style={styles.meta}>
          {kind === 'g5' ? 'G5 Small Group' : 'Bible Study Group'}
          {group.meeting_day ? ` · ${group.meeting_day}` : ''}
          {group.meeting_time ? ` ${group.meeting_time}` : ''}
        </Text>
        {kind === 'bible_study' && group.book_being_studied ? (
          <Text style={styles.meta}>📖 Studying: {group.book_being_studied}</Text>
        ) : null}
        {group.location ? <Text style={styles.meta}>📍 {group.location}</Text> : null}
        <Text style={[styles.meta, { marginTop: 6 }]}>
          Leader: {leader?.full_name ?? 'Unassigned'}
        </Text>
        {kind === 'g5' && (
          <Text style={styles.meta}>
            Members: {members.length}/{group.size_limit ?? 6}
          </Text>
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {isLeader && (
          <View style={{ flex: 1 }}>
            <Button title="+ Add Member" onPress={() => setShowAdd(true)} />
          </View>
        )}
        {isLeader && (
          <View style={{ flex: 1 }}>
            <Button title="✎ Edit Group" variant="outline" onPress={openEdit} />
          </View>
        )}
      </View>
      <View style={{ marginTop: 8 }}>
        <Button
          title="💬 Group Chat"
          onPress={() =>
            navigation.navigate('GroupChat', {
              kind,
              groupId,
              groupName: group.group_name,
            })
          }
        />
      </View>
      {canReport && (
        <View style={{ marginTop: 8 }}>
          <Button title="+ Weekly Report" variant="outline" onPress={() => setShowReport(true)} />
        </View>
      )}

      <Text style={styles.sectionTitle}>Members ({members.length})</Text>
      {members.length === 0 && <Empty text="No members yet." />}
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
              {m.person.status.replace('_', ' ')}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
      {isLeader && members.length > 0 && (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
          Long-press a member to remove them.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Weekly Reports</Text>
      {reports.length === 0 && <Empty text="No reports submitted yet." />}
      {reports.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontFamily: font.bold, color: colors.text }}>{r.report_date}</Text>
          {r.attendance_count != null && (
            <Text style={styles.meta}>{r.attendance_count} attended</Text>
          )}
          {r.lesson ? <Text style={{ color: colors.text, marginTop: 4 }}>📖 {r.lesson}</Text> : null}
          {r.notes ? <Text style={{ color: colors.text, marginTop: 2 }}>{r.notes}</Text> : null}
        </Card>
      ))}

      {/* Add member modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Member</Text>
            <Field
              label="Search by name"
              value={search}
              onChangeText={(t) => searchPeople(t)}
              placeholder="Type at least 2 letters..."
            />
            <FlatList
              data={candidates}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: 240 }}
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

      {/* Edit group modal */}
      <Modal visible={showEdit} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { maxHeight: '85%' }]}>
            <ScrollView>
              <Text style={styles.modalTitle}>Edit Group</Text>
              <Field label="Group Name" value={editName} onChangeText={setEditName} />
              <Field label="Meeting Day" value={editDay} onChangeText={setEditDay} placeholder="e.g. Wednesday" />
              <Field label="Meeting Time" value={editTime} onChangeText={setEditTime} placeholder="e.g. 7:00 PM" />
              {kind === 'g5' ? (
                <Field
                  label="Size Limit (leader + members)"
                  value={editLimit}
                  onChangeText={setEditLimit}
                  keyboardType="number-pad"
                />
              ) : (
                <>
                  <Field label="Book Being Studied" value={editBook} onChangeText={setEditBook} placeholder="e.g. Gospel of John" />
                  <Field label="Location / Online Link" value={editLocation} onChangeText={setEditLocation} placeholder="e.g. Church Room 2" />
                </>
              )}
              <Field
                label={newLeader ? `Leader: ${newLeader.full_name}` : `Change Leader (current: ${leader?.full_name ?? 'none'})`}
                value={leaderSearch}
                onChangeText={(t) => searchPeople(t, true)}
                placeholder="Search person..."
              />
              {!newLeader &&
                leaderCandidates.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.candidate}
                    onPress={() => {
                      setNewLeader(p);
                      setLeaderSearch(p.full_name);
                      setLeaderCandidates([]);
                    }}
                  >
                    <Text style={{ fontFamily: font.semibold, color: colors.text }}>{p.full_name}</Text>
                  </TouchableOpacity>
                ))}
              <Button title="Save Changes" onPress={saveEdit} loading={saving} />
              <Button title="Cancel" variant="outline" onPress={() => setShowEdit(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Weekly report modal */}
      <Modal visible={showReport} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Weekly Report — {group.group_name}</Text>
            <Field
              label="How many attended? (optional)"
              value={repAttendance}
              onChangeText={setRepAttendance}
              keyboardType="number-pad"
              placeholder="e.g. 5"
            />
            <Field
              label={kind === 'bible_study' ? 'Lesson covered' : 'Topic / focus'}
              value={repLesson}
              onChangeText={setRepLesson}
              placeholder="e.g. John chapter 3"
            />
            <Field label="Notes" value={repNotes} onChangeText={setRepNotes} multiline placeholder="Prayer requests, follow-ups..." />
            <Button title="Submit Report" onPress={submitReport} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowReport(false)} />
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
    backgroundColor: colors.card,
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
    backgroundColor: colors.primaryLight,
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
  candidate: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
