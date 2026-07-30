import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Card, Button, Empty, Field } from '@/components/ui';
import { colors, font } from '@/theme';

interface PrayerRow {
  id: string;
  requester_name: string | null;
  request: string;
  status: 'open' | 'prayed';
  created_at: string;
  requester?: { full_name: string } | null;
}

interface FollowUpFlag {
  id: string;
  follow_up_date: string;
  notes: string | null;
  newcomer?: { full_name: string } | null;
}

export default function PrayerScreen() {
  const { profile: me, isLeader } = useAuth();
  const canManage = isLeader || me?.role === 'minister';

  const [requests, setRequests] = useState<PrayerRow[]>([]);
  const [flags, setFlags] = useState<FollowUpFlag[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const [{ data: pr }, fu] = await Promise.all([
      supabase
        .from('prayer_requests')
        .select('*, requester:profiles!prayer_requests_requester_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(50),
      canManage
        ? supabase
            .from('follow_up_updates')
            .select('id, follow_up_date, notes, newcomer:new_comers!follow_up_updates_new_comer_id_fkey(full_name)')
            .eq('needs_prayer', 'yes')
            .gte('follow_up_date', twoWeeksAgo)
            .order('follow_up_date', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);
    setRequests((pr as unknown as PrayerRow[]) ?? []);
    setFlags(((fu as { data: unknown }).data as FollowUpFlag[]) ?? []);
  }, [canManage]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function submit() {
    if (!text.trim()) {
      notify('Empty request', 'Write your prayer request first.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('prayer_requests').insert({
      requester_id: me?.id ?? null,
      requester_name: me?.full_name ?? null,
      request: text.trim(),
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      notify('Submitted', 'The Prayer team will be praying for you. 🙏');
      setShowAdd(false);
      setText('');
      load();
    }
  }

  async function markPrayed(r: PrayerRow) {
    const { error } = await supabase
      .from('prayer_requests')
      .update({ status: r.status === 'open' ? 'prayed' : 'open' })
      .eq('id', r.id);
    if (error) notify('Error', error.message);
    else load();
  }

  const open = requests.filter((r) => r.status === 'open');
  const prayed = requests.filter((r) => r.status === 'prayed');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Button title="🙏 Submit a Prayer Request" onPress={() => setShowAdd(true)} />

      {canManage && flags.length > 0 && (
        <Card style={{ marginTop: 12, borderLeftWidth: 4, borderLeftColor: colors.purple }}>
          <Text style={styles.sectionTitle}>From Follow-Up (needs prayer)</Text>
          {flags.map((f) => (
            <View key={f.id} style={styles.row}>
              <Text style={{ fontFamily: font.semibold, color: colors.text }}>
                {f.newcomer?.full_name ?? 'Newcomer'}
              </Text>
              <Text style={styles.meta}>
                flagged {f.follow_up_date}
                {f.notes ? ` · ${f.notes}` : ''}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Text style={styles.sectionTitle}>Open Requests ({open.length})</Text>
      {open.length === 0 && <Empty text="No open prayer requests." />}
      {open.map((r) => (
        <Card key={r.id}>
          <Text style={{ color: colors.text, lineHeight: 20 }}>{r.request}</Text>
          <Text style={styles.meta}>
            {r.requester?.full_name ?? r.requester_name ?? 'Anonymous'} ·{' '}
            {new Date(r.created_at).toLocaleDateString()}
          </Text>
          {canManage && (
            <TouchableOpacity onPress={() => markPrayed(r)} style={styles.prayedBtn}>
              <Text style={{ color: colors.success, fontFamily: font.bold, fontSize: 13 }}>
                ✓ Mark as prayed
              </Text>
            </TouchableOpacity>
          )}
        </Card>
      ))}

      {canManage && prayed.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Prayed ({prayed.length})</Text>
          {prayed.map((r) => (
            <Card key={r.id} style={{ opacity: 0.6 }}>
              <Text style={{ color: colors.text }}>{r.request}</Text>
              <Text style={styles.meta}>
                {r.requester?.full_name ?? r.requester_name ?? 'Anonymous'}
              </Text>
            </Card>
          ))}
        </>
      )}

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Prayer Request</Text>
            <Field
              label="What can we pray for?"
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Share your request..."
            />
            <Button title="Submit" onPress={submit} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowAdd(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    color: colors.text,
    marginTop: 16,
    marginBottom: 10,
  },
  row: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  prayedBtn: { marginTop: 8 },
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
