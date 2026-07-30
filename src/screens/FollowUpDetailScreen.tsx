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
import { useAuth } from '@/context/AuthContext';
import { Card, Field, Button, Empty } from '@/components/ui';
import { notify, confirmDialog } from '@/lib/notify';
import { colors, font } from '@/theme';
import { FollowUpStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FollowUpStackParamList, 'FollowUpDetail'>;

interface Newcomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  sex: string | null;
  first_visit_date: string | null;
  prayer_request: string | null;
  status: string;
  created_at: string;
}

interface HistoryEntry {
  id: string;
  contact_date: string;
  contact_method: string | null;
  status: string | null;
  notes: string | null;
  next_followup_date: string | null;
  contacted_by: string;
  contacted_by_name: string | null;
  created_at: string;
}

interface Assignment {
  id: string;
  assigned_to: string;
  assignee_name: string | null;
  assigned_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  follow_up_role: string | null;
}

const CONTACT_METHODS = ['Phone', 'Text', 'Email', 'In Person'] as const;
const HISTORY_STATUSES = [
  'pending',
  'contacted',
  'interested',
  'not_responding',
  'ready_for_next_step',
] as const;

const statusColors: Record<string, string> = {
  pending: colors.muted,
  contacted: colors.primaryLight,
  interested: colors.success,
  not_responding: colors.warning,
  ready_for_next_step: '#f97316',
};

export default function FollowUpDetailScreen({ route }: Props) {
  const { newComerId } = route.params;
  const { profile, isLeader } = useAuth();
  const followUpRole = (profile as any)?.follow_up_role as string | null | undefined;
  const isFollowUpLeader = isLeader || followUpRole === 'leader';
  const canAssign = isFollowUpLeader || followUpRole === 'assistant_leader';
  const canDelete = isFollowUpLeader;

  const [newcomer, setNewcomer] = useState<Newcomer | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // form state
  const [contactMethod, setContactMethod] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>('contacted');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: nc }, { data: hist }, { data: asgn }] = await Promise.all([
      supabase.from('newcomers').select('*').eq('id', newComerId).single(),
      supabase
        .from('follow_up_history')
        .select('id, contact_date, contact_method, status, notes, next_followup_date, contacted_by, created_at')
        .eq('newcomer_id', newComerId)
        .order('contact_date', { ascending: false }),
      supabase
        .from('follow_up_assignments')
        .select('id, assigned_to, assigned_at')
        .eq('newcomer_id', newComerId)
        .eq('active', true),
    ]);
    setNewcomer((nc as Newcomer) ?? null);

    // Enrich history with profile names
    const histRows = (hist as HistoryEntry[]) ?? [];
    if (histRows.length > 0) {
      const contactorIds = [...new Set(histRows.map((h) => h.contacted_by))];
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', contactorIds);
      const nameMap: Record<string, string> = {};
      ((profileRows as { id: string; full_name: string }[]) ?? []).forEach((p) => {
        nameMap[p.id] = p.full_name;
      });
      setHistory(histRows.map((h) => ({ ...h, contacted_by_name: nameMap[h.contacted_by] ?? null })));
    } else {
      setHistory([]);
    }

    // Enrich assignments with names
    const asgnRows = (asgn as { id: string; assigned_to: string; assigned_at: string }[]) ?? [];
    if (asgnRows.length > 0) {
      const assigneeIds = asgnRows.map((a) => a.assigned_to);
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', assigneeIds);
      const nameMap: Record<string, string> = {};
      ((profileRows as { id: string; full_name: string }[]) ?? []).forEach((p) => {
        nameMap[p.id] = p.full_name;
      });
      setAssignments(asgnRows.map((a) => ({ ...a, assignee_name: nameMap[a.assigned_to] ?? null })));
    } else {
      setAssignments([]);
    }
  }, [newComerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function openAssignModal() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, follow_up_role')
      .not('follow_up_role', 'is', null)
      .order('full_name');
    setTeamMembers((data as TeamMember[]) ?? []);
    setShowAssignModal(true);
  }

  async function assignTo(member: TeamMember) {
    if (!profile) return;
    const { error } = await supabase.from('follow_up_assignments').insert({
      newcomer_id: newComerId,
      assigned_to: member.id,
      assigned_by: profile.id,
      assigned_at: new Date().toISOString(),
      active: true,
    });
    if (error) { notify('Error', error.message); return; }
    await supabase.from('notifications').insert({
      user_id: member.id,
      title: 'New Follow-Up Assignment',
      message: `You have been assigned a new newcomer: ${newcomer?.first_name ?? ''} ${newcomer?.last_name ?? ''}. Please follow up.`,
      type: 'followup_assignment',
      read: false,
    });
    setShowAssignModal(false);
    load();
  }

  async function removeAssignment(assignmentId: string) {
    confirmDialog('Remove Assignment', 'Remove this assignment?', 'Remove', async () => {
      await supabase.from('follow_up_assignments').update({ active: false }).eq('id', assignmentId);
      load();
    });
  }

  async function saveEntry() {
    if (!profile) return;
    if (!historyStatus) { notify('Status required', 'Please select a status.'); return; }
    if (nextDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate.trim())) {
      notify('Invalid date', 'Next follow-up date must be YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('follow_up_history').insert({
      newcomer_id: newComerId,
      contacted_by: profile.id,
      contact_date: new Date().toISOString().slice(0, 10),
      contact_method: contactMethod?.toLowerCase().replace(' ', '_') ?? null,
      status: historyStatus,
      notes: notes.trim() || null,
      next_followup_date: nextDate.trim() || null,
    });
    setSaving(false);
    if (error) { notify('Error', error.message); return; }
    setShowForm(false);
    setNotes('');
    setNextDate('');
    setContactMethod(null);
    setHistoryStatus('contacted');
    load();
  }

  async function deleteEntry(entryId: string) {
    if (!canDelete) return;
    confirmDialog('Delete Entry', 'Delete this history entry?', 'Delete', async () => {
      await supabase.from('follow_up_history').delete().eq('id', entryId);
      load();
    });
  }

  async function markStatus(status: string) {
    if (!isFollowUpLeader) return;
    const label = status === 'ready_for_next_step' ? 'Mark Ready for Next Step' : `Set status: ${status}`;
    confirmDialog(label, `Change ${newcomer?.first_name}'s status to "${status}"?`, 'Confirm', async () => {
      const { error } = await supabase
        .from('newcomers')
        .update({ status })
        .eq('id', newComerId);
      if (error) notify('Error', error.message);
      else load();
    });
  }

  if (!newcomer) return <Empty text="Loading..." />;

  const fullName = `${newcomer.first_name} ${newcomer.last_name}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      {/* Newcomer Info */}
      <Card>
        <Text style={styles.name}>{fullName}</Text>
        <View style={styles.statusRow}>
          <StatusChip status={newcomer.status} />
        </View>
        {newcomer.phone ? <Text style={styles.meta}>📞 {newcomer.phone}</Text> : null}
        {newcomer.email ? <Text style={styles.meta}>✉️ {newcomer.email}</Text> : null}
        <Text style={styles.meta}>First visit: {newcomer.first_visit_date ?? '—'}</Text>
        {newcomer.sex ? <Text style={styles.meta}>Sex: {newcomer.sex}</Text> : null}
        {newcomer.prayer_request ? (
          <Text style={[styles.meta, { marginTop: 8, fontStyle: 'italic' }]}>
            🙏 {newcomer.prayer_request}
          </Text>
        ) : null}
        {isFollowUpLeader && newcomer.status !== 'ready_for_next_step' && (
          <View style={{ marginTop: 12 }}>
            <Button
              title="Mark Ready for Next Step"
              variant="outline"
              onPress={() => markStatus('ready_for_next_step')}
            />
          </View>
        )}
      </Card>

      {/* Assignments */}
      {canAssign && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.sectionTitle}>Assigned To</Text>
            <TouchableOpacity onPress={openAssignModal} style={styles.assignBtn}>
              <Text style={{ color: '#fff', fontFamily: font.bold, fontSize: 13 }}>+ Assign</Text>
            </TouchableOpacity>
          </View>
          {assignments.length === 0 ? (
            <Text style={[styles.meta, { marginTop: 4 }]}>No one assigned yet.</Text>
          ) : (
            assignments.map((a) => (
              <View key={a.id} style={styles.assigneeRow}>
                <Text style={{ flex: 1, color: colors.text }}>{a.assignee_name ?? a.assigned_to}</Text>
                <Text style={styles.meta}>{a.assigned_at.slice(0, 10)}</Text>
                {canAssign && (
                  <TouchableOpacity onPress={() => removeAssignment(a.id)} style={{ marginLeft: 8 }}>
                    <Text style={{ color: colors.danger, fontFamily: font.semibold }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </Card>
      )}

      {/* Add Entry toggle */}
      <Button
        title={showForm ? 'Cancel' : '+ Add Follow-Up Entry'}
        variant={showForm ? 'outline' : 'primary'}
        onPress={() => setShowForm(!showForm)}
      />

      {showForm && (
        <Card style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>New Entry</Text>

          <Text style={styles.label}>Contact Method</Text>
          <View style={styles.pillRow}>
            {CONTACT_METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setContactMethod(m)}
                style={[styles.pill, contactMethod === m && styles.pillActive]}
              >
                <Text style={{ color: contactMethod === m ? '#fff' : colors.text, fontSize: 13 }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Status *</Text>
          <View style={styles.pillRow}>
            {HISTORY_STATUSES.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setHistoryStatus(s)}
                style={[styles.pill, historyStatus === s && { backgroundColor: statusColors[s] ?? colors.primary, borderColor: 'transparent' }]}
              >
                <Text style={{ color: historyStatus === s ? '#fff' : colors.text, fontSize: 12 }}>
                  {s.replace(/_/g, ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="How did it go?"
          />
          <Field
            label="Next Follow-up Date (YYYY-MM-DD, optional)"
            value={nextDate}
            onChangeText={setNextDate}
            placeholder="2026-07-12"
          />
          <Button title="Save Entry" onPress={saveEntry} loading={saving} />
        </Card>
      )}

      {/* History Timeline */}
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>History ({history.length})</Text>
      {history.length === 0 && <Empty text="No follow-up history yet." />}
      {history.map((entry) => (
        <Card key={entry.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={styles.entryDate}>{entry.contact_date}</Text>
                {entry.contact_method && (
                  <Text style={styles.meta}>{methodEmoji(entry.contact_method)} {entry.contact_method.replace('_', ' ')}</Text>
                )}
                {entry.status && (
                  <View style={[styles.statusChip, { backgroundColor: statusColors[entry.status] ?? colors.muted }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontFamily: font.bold }}>
                      {entry.status.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              {entry.contacted_by_name && (
                <Text style={[styles.meta, { marginTop: 2 }]}>by {entry.contacted_by_name}</Text>
              )}
              {entry.notes && <Text style={{ color: colors.text, marginTop: 6 }}>{entry.notes}</Text>}
              {entry.next_followup_date && (
                <Text style={{ color: colors.warning, fontFamily: font.semibold, fontSize: 12, marginTop: 4 }}>
                  Next: {entry.next_followup_date}
                </Text>
              )}
            </View>
            {canDelete && (
              <TouchableOpacity onPress={() => deleteEntry(entry.id)} style={{ padding: 4 }}>
                <Text style={{ color: colors.danger, fontSize: 18 }}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>
      ))}

      {/* Assign Modal */}
      <Modal
        visible={showAssignModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Assign to Team Member</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Text style={{ color: colors.primary, fontFamily: font.semibold }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={teamMembers}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => assignTo(item)} style={styles.memberRow}>
                  <View>
                    <Text style={{ fontFamily: font.semibold, color: colors.text }}>{item.full_name}</Text>
                    <Text style={styles.meta}>{item.follow_up_role?.replace(/_/g, ' ')}</Text>
                  </View>
                  <Text style={{ color: colors.primary }}>Assign →</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Empty text="No follow-up team members found." />}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatusChip({ status }: { status: string }) {
  const bg =
    status === 'new' ? colors.primaryLight :
    status === 'in_progress' ? colors.warning :
    status === 'ready_for_next_step' ? '#f97316' :
    colors.muted;
  return (
    <View style={[styles.statusChip, { backgroundColor: bg }]}>
      <Text style={{ color: '#fff', fontSize: 11, fontFamily: font.bold }}>
        {status.replace(/_/g, ' ').toUpperCase()}
      </Text>
    </View>
  );
}

function methodEmoji(method: string) {
  switch (method) {
    case 'phone': return '📞';
    case 'text': return '💬';
    case 'email': return '✉️';
    case 'in_person': return '🤝';
    default: return '•';
  }
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontFamily: font.bold, color: colors.text },
  meta: { color: colors.muted, marginTop: 2, fontSize: 13 },
  statusRow: { marginVertical: 6 },
  sectionTitle: { fontSize: 16, fontFamily: font.bold, color: colors.text, marginBottom: 8 },
  label: { fontSize: 13, fontFamily: font.semibold, color: colors.muted, marginBottom: 6, marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  entryDate: { fontFamily: font.bold, color: colors.text, fontSize: 14 },
  assignBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
