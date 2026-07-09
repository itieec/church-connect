import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Card, Button, Empty, Field } from '@/components/ui';
import { colors } from '@/theme';

const TOPICS = [
  ['counseling', '💬 Counseling'],
  ['prayer', '🙏 Prayer'],
  ['mentorship', '🌱 Mentorship'],
  ['bible_question', '📖 Bible question'],
  ['other', '✳️ Other'],
] as const;

type Topic = (typeof TOPICS)[number][0];

interface Appt {
  id: string;
  requester_id: string;
  topic: Topic;
  notes: string | null;
  preferred_times: string | null;
  status: 'pending' | 'confirmed' | 'declined' | 'completed';
  scheduled_at: string | null;
  handled_by: string | null;
  created_at: string;
  requester?: { full_name: string; phone: string | null } | null;
  handler?: { full_name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning,
  confirmed: colors.success,
  declined: colors.danger,
  completed: colors.muted,
};

export default function AppointmentsScreen() {
  const { profile: me, isLeader } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [topic, setTopic] = useState<Topic>('counseling');
  const [notes, setNotes] = useState('');
  const [times, setTimes] = useState('');
  const [saving, setSaving] = useState(false);

  // leader scheduling modal
  const [scheduling, setScheduling] = useState<Appt | null>(null);
  const [when, setWhen] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('appointments')
      .select(
        '*, requester:profiles!appointments_requester_id_fkey(full_name, phone), handler:profiles!appointments_handled_by_fkey(full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(100);
    setAppts((data as unknown as Appt[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function request() {
    if (!me) return;
    setSaving(true);
    const { error } = await supabase.from('appointments').insert({
      requester_id: me.id,
      topic,
      notes: notes.trim() || null,
      preferred_times: times.trim() || null,
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      notify('Request sent', 'A leader will confirm a time with you soon.');
      setShowAdd(false);
      setNotes('');
      setTimes('');
      load();
    }
  }

  async function setStatus(a: Appt, status: Appt['status'], scheduledAt?: string) {
    const { error } = await supabase
      .from('appointments')
      .update({
        status,
        handled_by: me?.id ?? null,
        ...(scheduledAt !== undefined ? { scheduled_at: scheduledAt || null } : {}),
      })
      .eq('id', a.id);
    if (error) notify('Error', error.message);
    else {
      setScheduling(null);
      setWhen('');
      load();
    }
  }

  const mine = appts.filter((a) => a.requester_id === me?.id);
  const queue = appts.filter((a) => a.requester_id !== me?.id);
  const topicLabel = (t: Topic) => TOPICS.find(([k]) => k === t)?.[1] ?? t;

  function ApptCard({ a, showRequester }: { a: Appt; showRequester: boolean }) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.topic}>{topicLabel(a.topic)}</Text>
          <View style={[styles.status, { backgroundColor: STATUS_COLORS[a.status] }]}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
              {a.status.toUpperCase()}
            </Text>
          </View>
        </View>
        {showRequester && (
          <Text style={styles.meta}>
            {a.requester?.full_name ?? 'Unknown'}
            {a.requester?.phone ? ` · 📞 ${a.requester.phone}` : ''}
          </Text>
        )}
        {a.notes ? <Text style={styles.notes}>{a.notes}</Text> : null}
        {a.preferred_times ? (
          <Text style={styles.meta}>Preferred: {a.preferred_times}</Text>
        ) : null}
        {a.scheduled_at ? (
          <Text style={[styles.meta, { color: colors.success, fontWeight: '700' }]}>
            📅 Scheduled: {a.scheduled_at}
            {a.handler?.full_name ? ` with ${a.handler.full_name}` : ''}
          </Text>
        ) : null}
        <Text style={styles.meta}>{new Date(a.created_at).toLocaleDateString()}</Text>

        {isLeader && showRequester && (
          <View style={styles.actionRow}>
            {a.status === 'pending' && (
              <>
                <TouchableOpacity onPress={() => setScheduling(a)} style={styles.actionBtn}>
                  <Text style={styles.actionText}>📅 Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStatus(a, 'declined')} style={styles.actionBtn}>
                  <Text style={[styles.actionText, { color: colors.danger }]}>Decline</Text>
                </TouchableOpacity>
              </>
            )}
            {a.status === 'confirmed' && (
              <TouchableOpacity onPress={() => setStatus(a, 'completed')} style={styles.actionBtn}>
                <Text style={styles.actionText}>✓ Mark completed</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Card>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={styles.title}>One-to-One Time</Text>
        <Text style={styles.meta}>
          Request private time with a leader — counseling, prayer, mentorship, or any question.
          Requests are only visible to you and leadership. Counseling requests are extra-private:
          only the Pastor / Main Leader level can see them.
        </Text>
      </Card>
      <Button title="+ Request One-to-One" onPress={() => setShowAdd(true)} />

      {mine.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>My Requests</Text>
          {mine.map((a) => (
            <ApptCard key={a.id} a={a} showRequester={false} />
          ))}
        </>
      )}

      {isLeader && (
        <>
          <Text style={styles.sectionTitle}>
            Requests Queue ({queue.filter((a) => a.status === 'pending').length} pending)
          </Text>
          {queue.length === 0 && <Empty text="No requests from members yet." />}
          {queue.map((a) => (
            <ApptCard key={a.id} a={a} showRequester />
          ))}
        </>
      )}

      {/* request modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Request One-to-One</Text>
            <Text style={styles.label}>What is it about?</Text>
            <View style={styles.pillRow}>
              {TOPICS.map(([k, label]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setTopic(k)}
                  style={[styles.pill, topic === k && styles.pillActive]}
                >
                  <Text style={{ color: topic === k ? '#fff' : colors.text, fontSize: 13 }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field
              label="Anything you want to share beforehand? (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Only leadership will see this."
            />
            <Field
              label="Times that work for you"
              value={times}
              onChangeText={setTimes}
              placeholder="e.g. Saturday after program, weekday evenings"
            />
            <Button title="Send Request" onPress={request} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowAdd(false)} />
          </View>
        </View>
      </Modal>

      {/* leader scheduling modal */}
      <Modal visible={!!scheduling} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              Schedule with {scheduling?.requester?.full_name}
            </Text>
            <Field
              label="When? (free text — e.g. 2026-07-11 5:00 PM, Room 2)"
              value={when}
              onChangeText={setWhen}
              placeholder="Saturday July 11, 5:00 PM"
            />
            <Button
              title="Confirm Appointment"
              onPress={() => scheduling && setStatus(scheduling, 'confirmed', when.trim())}
            />
            <Button title="Cancel" variant="outline" onPress={() => setScheduling(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 10,
  },
  topic: { fontSize: 15, fontWeight: '700', color: colors.text },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  notes: { color: colors.text, marginTop: 6, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  actionBtn: { paddingVertical: 4 },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
});
