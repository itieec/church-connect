import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { notify, confirmDialog } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Card, Button, Empty, Field } from '@/components/ui';
import { colors } from '@/theme';
import { Announcement } from '@/types';

interface AnnouncementRow extends Announcement {
  author?: { full_name: string } | null;
}

export default function AnnouncementsScreen() {
  const { profile: me, isLeader } = useAuth();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*, author:profiles!announcements_created_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(50);
    setRows((data as unknown as AnnouncementRow[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function post() {
    if (!title.trim()) {
      notify('Missing title', 'Give the announcement a title.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('announcements').insert({
      title: title.trim(),
      body: body.trim() || null,
      created_by: me?.id ?? null,
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      setShowAdd(false);
      setTitle('');
      setBody('');
      load();
    }
  }

  function remove(a: AnnouncementRow) {
    confirmDialog('Delete announcement', `Delete "${a.title}"?`, 'Delete', async () => {
      await supabase.from('announcements').delete().eq('id', a.id);
      load();
    });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      {isLeader && <Button title="+ New Announcement" onPress={() => setShowAdd(true)} />}

      <View style={{ marginTop: 12 }}>
        {rows.length === 0 && <Empty text="No announcements yet." />}
        {rows.map((a) => (
          <TouchableOpacity key={a.id} onLongPress={() => isLeader && remove(a)} activeOpacity={0.8}>
            <Card>
              <Text style={styles.title}>📢 {a.title}</Text>
              {a.body ? <Text style={styles.body}>{a.body}</Text> : null}
              <Text style={styles.meta}>
                {a.author?.full_name ?? 'Leadership'} · {new Date(a.created_at).toLocaleDateString()}
              </Text>
            </Card>
          </TouchableOpacity>
        ))}
        {isLeader && rows.length > 0 && (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Long-press an announcement to delete it.
          </Text>
        )}
      </View>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Announcement</Text>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Saturday Program moved to 4pm" />
            <Field label="Details (optional)" value={body} onChangeText={setBody} multiline placeholder="More information..." />
            <Button title="Post" onPress={post} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowAdd(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { color: colors.text, marginTop: 6, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 8 },
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
