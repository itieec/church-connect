import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Field, Empty, Button } from '@/components/ui';
import { colors } from '@/theme';
import { Profile } from '@/types';

const SERVICE_TYPES = ['saturday_program', 'sunday_service', 'bible_study', 'g5', 'other'] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceScreen() {
  const { profile: me } = useAuth();
  const [date, setDate] = useState(today());
  const [serviceType, setServiceType] = useState<(typeof SERVICE_TYPES)[number]>('saturday_program');
  const [people, setPeople] = useState<Profile[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ppl }, { data: existing }] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name').limit(300),
      supabase
        .from('attendance')
        .select('person_id, present')
        .eq('service_date', date)
        .eq('service_type', serviceType),
    ]);
    setPeople((ppl as Profile[]) ?? []);
    const map: Record<string, boolean> = {};
    (existing ?? []).forEach((r: { person_id: string; present: boolean }) => {
      map[r.person_id] = r.present;
    });
    setPresent(map);
  }, [date, serviceType]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      notify('Invalid date', 'Use YYYY-MM-DD format.');
      return;
    }
    const rows = Object.entries(present).map(([person_id, isPresent]) => ({
      person_id,
      service_date: date,
      service_type: serviceType,
      present: isPresent,
      recorded_by: me?.id ?? null,
    }));
    if (rows.length === 0) {
      notify('Nothing to save', 'Tap people to mark them present first.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'person_id,service_date,service_type' });
    setSaving(false);
    if (error) notify('Error', error.message);
    else notify('Saved', `Attendance recorded for ${rows.length} people.`);
  }

  const presentCount = Object.values(present).filter(Boolean).length;

  return (
    <View style={styles.container}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Field label="Service Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <View style={styles.pillRow}>
          {SERVICE_TYPES.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setServiceType(s)}
              style={[styles.pill, serviceType === s && styles.pillActive]}
            >
              <Text style={{ color: serviceType === s ? '#fff' : colors.text, fontSize: 12 }}>
                {s.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.count}>
          {presentCount} marked present · tap a person to toggle
        </Text>
      </View>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={<Empty text="No people yet." />}
        renderItem={({ item }) => {
          const isPresent = !!present[item.id];
          return (
            <TouchableOpacity
              style={[styles.row, isPresent && styles.rowPresent]}
              onPress={() => setPresent((p) => ({ ...p, [item.id]: !p[item.id] }))}
            >
              <Text style={{ fontSize: 18 }}>{isPresent ? '✅' : '⬜'}</Text>
              <Text style={[styles.name, { flex: 1 }]}>{item.full_name}</Text>
              <Text style={styles.meta}>{item.status.replace('_', ' ')}</Text>
            </TouchableOpacity>
          );
        }}
      />
      <View style={{ padding: 16 }}>
        <Button title="Save Attendance" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  count: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  rowPresent: { borderColor: colors.success, backgroundColor: '#f0fdf4' },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, textTransform: 'capitalize' },
});
