import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { notify } from '@/lib/notify';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useUnread } from '@/lib/useUnread';
import { Empty, Field, Button } from '@/components/ui';
import { colors, font } from '@/theme';
import { G5Group, BibleStudyGroup } from '@/types';
import { GroupsStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<GroupsStackParamList, 'GroupsHome'>;
type Kind = 'g5' | 'bible_study';

export default function GroupsScreen({ navigation }: Props) {
  const { isLeader } = useAuth();
  const unread = useUnread(true);
  const [kind, setKind] = useState<Kind>('g5');
  const [groups, setGroups] = useState<(G5Group | BibleStudyGroup)[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [meetingDay, setMeetingDay] = useState('');
  const [saving, setSaving] = useState(false);

  const table = kind === 'g5' ? 'g5_groups' : 'bible_study_groups';

  const load = useCallback(async () => {
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('is_active', true)
      .order('group_name');
    setGroups((data as (G5Group | BibleStudyGroup)[]) ?? []);
  }, [table]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function createGroup() {
    if (!newName.trim()) {
      notify('Missing name', 'Group name is required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from(table).insert({
      group_name: newName.trim(),
      meeting_day: meetingDay.trim() || null,
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      setShowCreate(false);
      setNewName('');
      setMeetingDay('');
      load();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.filterRow}>
          {(
            [
              ['g5', 'G5 Groups'],
              ['bible_study', 'Bible Study'],
            ] as const
          ).map(([k, label]) => (
            <TouchableOpacity
              key={k}
              onPress={() => setKind(k)}
              style={[styles.filterPill, kind === k && styles.filterActive]}
            >
              <Text style={{ color: kind === k ? '#fff' : colors.text, fontFamily: font.semibold }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {isLeader && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Text style={{ color: '#fff', fontFamily: font.bold }}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Empty text={`No ${kind === 'g5' ? 'G5' : 'Bible Study'} groups yet.`} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() => navigation.navigate('GroupDetail', { kind, groupId: item.id })}
          >
            <View style={[styles.avatar, { backgroundColor: kind === 'g5' ? colors.success : colors.purple }]}>
              <Text style={{ color: '#fff', fontFamily: font.bold }}>
                {kind === 'g5' ? 'G5' : '📖'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.group_name}</Text>
              <Text style={styles.meta}>
                {item.meeting_day ?? 'Meeting day TBD'}
                {'meeting_time' in item && item.meeting_time ? ` · ${item.meeting_time}` : ''}
              </Text>
            </View>
            {(unread.perGroup[`${kind}:${item.id}`] ?? 0) > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={{ color: '#fff', fontSize: 11, fontFamily: font.bold }}>
                  {unread.perGroup[`${kind}:${item.id}`]}
                </Text>
              </View>
            )}
            <Text style={{ color: colors.muted }}>›</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              New {kind === 'g5' ? 'G5 Group' : 'Bible Study Group'}
            </Text>
            <Field label="Group Name" value={newName} onChangeText={setNewName} placeholder="e.g. Group 3" />
            <Field
              label="Meeting Day"
              value={meetingDay}
              onChangeText={setMeetingDay}
              placeholder="e.g. Wednesday"
            />
            <Button title="Create" onPress={createGroup} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowCreate(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 0,
  },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  addBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 16, fontFamily: font.semibold, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  unreadBadge: {
    backgroundColor: colors.danger,
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 6,
  },
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginBottom: 12 },
});
