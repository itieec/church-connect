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
import { notify, confirmDialog } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Card, Button, Empty, Field } from '@/components/ui';
import { colors } from '@/theme';

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
}

interface RsvpRow {
  event_id: string;
  person_id: string;
  response: 'going' | 'maybe' | 'not_going';
}

const RESPONSES = [
  ['going', '✅ Going'],
  ['maybe', '🤔 Maybe'],
  ['not_going', '❌ No'],
] as const;

export default function EventsScreen() {
  const { profile: me, isLeader } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: ev }, { data: rs }] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .gte('event_date', today)
        .order('event_date'),
      supabase.from('event_rsvps').select('event_id, person_id, response'),
    ]);
    setEvents((ev as EventRow[]) ?? []);
    setRsvps((rs as RsvpRow[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function createEvent() {
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      notify('Missing info', 'Title and a date in YYYY-MM-DD format are required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim() || null,
      event_date: date,
      event_time: time.trim() || null,
      location: location.trim() || null,
      created_by: me?.id ?? null,
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      setShowAdd(false);
      setTitle('');
      setDescription('');
      setDate('');
      setTime('');
      setLocation('');
      load();
    }
  }

  async function rsvp(eventId: string, response: RsvpRow['response']) {
    if (!me) return;
    const { error } = await supabase
      .from('event_rsvps')
      .upsert(
        { event_id: eventId, person_id: me.id, response },
        { onConflict: 'event_id,person_id' },
      );
    if (error) notify('Error', error.message);
    else load();
  }

  function removeEvent(ev: EventRow) {
    confirmDialog('Cancel event', `Cancel "${ev.title}"?`, 'Cancel Event', async () => {
      await supabase.from('events').update({ is_active: false }).eq('id', ev.id);
      load();
    });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      {isLeader && <Button title="+ New Event" onPress={() => setShowAdd(true)} />}

      <View style={{ marginTop: 12 }}>
        {events.length === 0 && <Empty text="No upcoming events." />}
        {events.map((ev) => {
          const mine = rsvps.find((r) => r.event_id === ev.id && r.person_id === me?.id);
          const going = rsvps.filter((r) => r.event_id === ev.id && r.response === 'going').length;
          const maybe = rsvps.filter((r) => r.event_id === ev.id && r.response === 'maybe').length;
          return (
            <TouchableOpacity key={ev.id} activeOpacity={0.9} onLongPress={() => isLeader && removeEvent(ev)}>
              <Card>
                <Text style={styles.title}>🗓 {ev.title}</Text>
                <Text style={styles.meta}>
                  {ev.event_date}
                  {ev.event_time ? ` · ${ev.event_time}` : ''}
                  {ev.location ? ` · ${ev.location}` : ''}
                </Text>
                {ev.description ? <Text style={styles.desc}>{ev.description}</Text> : null}
                <Text style={[styles.meta, { marginTop: 8 }]}>
                  {going} going · {maybe} maybe
                </Text>
                <View style={styles.rsvpRow}>
                  {RESPONSES.map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      onPress={() => rsvp(ev.id, value)}
                      style={[styles.pill, mine?.response === value && styles.pillActive]}
                    >
                      <Text
                        style={{
                          color: mine?.response === value ? '#fff' : colors.text,
                          fontSize: 13,
                        }}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
        {isLeader && events.length > 0 && (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Long-press an event to cancel it.
          </Text>
        )}
      </View>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <ScrollView>
              <Text style={styles.modalTitle}>New Event</Text>
              <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Saturday Program" />
              <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-07-11" />
              <Field label="Time (optional)" value={time} onChangeText={setTime} placeholder="4:00 PM" />
              <Field label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Main hall" />
              <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
              <Button title="Create Event" onPress={createEvent} loading={saving} />
              <Button title="Cancel" variant="outline" onPress={() => setShowAdd(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  desc: { color: colors.text, marginTop: 6, lineHeight: 20 },
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
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
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
});
