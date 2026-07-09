import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Card, Button, Empty, Field } from '@/components/ui';
import { colors } from '@/theme';
import { Profile, Contribution } from '@/types';

interface ContributionRow extends Contribution {
  person?: { full_name: string } | null;
}

function ym(d: Date) {
  return d.toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default function ContributionsScreen() {
  const { profile: me, isLeader } = useAuth();
  const [month, setMonth] = useState(ym(new Date()));
  const [rows, setRows] = useState<ContributionRow[]>([]);
  const [monthRows, setMonthRows] = useState<ContributionRow[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  // add-entry form
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [person, setPerson] = useState<Profile | null>(null);
  const [amount, setAmount] = useState('');
  const [entryMonth, setEntryMonth] = useState(ym(new Date()));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const start = `${month}-01`;
    const end = `${shiftMonth(month, 1)}-01`;
    const [{ data: all }, { data: inMonth }, mem] = await Promise.all([
      supabase
        .from('contributions')
        .select('*, person:profiles!contributions_person_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('contributions')
        .select('*, person:profiles!contributions_person_id_fkey(full_name)')
        .gte('contribution_month', start)
        .lt('contribution_month', end),
      isLeader
        ? supabase
            .from('profiles')
            .select('*')
            .in('status', ['member', 'minister'])
            .eq('is_active', true)
            .order('full_name')
        : Promise.resolve({ data: [] }),
    ]);
    setRows((all as unknown as ContributionRow[]) ?? []);
    setMonthRows((inMonth as unknown as ContributionRow[]) ?? []);
    setMembers(((mem as { data: unknown }).data as Profile[]) ?? []);
  }, [month, isLeader]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function searchPeople(text: string) {
    setSearch(text);
    setPerson(null);
    if (text.length < 2) {
      setCandidates([]);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('full_name', `%${text}%`)
      .limit(8);
    setCandidates((data as Profile[]) ?? []);
  }

  async function save() {
    const amt = parseFloat(amount);
    if (!person || !amt || amt <= 0 || !/^\d{4}-\d{2}$/.test(entryMonth)) {
      notify('Missing info', 'Pick a person, a positive amount, and a month (YYYY-MM).');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('contributions').insert({
      person_id: person.id,
      amount: amt,
      contribution_month: `${entryMonth}-01`,
      method: 'manual',
      recorded_by: me?.id ?? null,
    });
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      notify('Recorded', `$${amt.toFixed(2)} for ${person.full_name} (${entryMonth}).`);
      setShowAdd(false);
      setPerson(null);
      setSearch('');
      setAmount('');
      load();
    }
  }

  function exportCsv() {
    if (Platform.OS !== 'web') {
      notify('Web only', 'Open the app in a browser to export CSV.');
      return;
    }
    const header = 'person,month,amount,method,recorded_at\n';
    const body = rows
      .map(
        (r) =>
          `"${(r.person?.full_name ?? 'Unknown').replace(/"/g, '""')}",${r.contribution_month.slice(0, 7)},${Number(r.amount).toFixed(2)},${r.method},${r.created_at.slice(0, 10)}`,
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contributions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const monthTotal = monthRows.reduce((s, r) => s + Number(r.amount), 0);
  const paidIds = new Set(monthRows.map((r) => r.person_id));
  const unpaid = members.filter((m) => !paidIds.has(m.id));
  const myTotal = rows
    .filter((r) => r.person_id === me?.id)
    .reduce((s, r) => s + Number(r.amount), 0);
  const myRows = rows.filter((r) => r.person_id === me?.id);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      {/* Month selector */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{month}</Text>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} style={styles.monthBtn}>
          <Text style={styles.monthBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {isLeader ? (
        <>
          <View style={styles.grid}>
            <View style={[styles.stat, { borderLeftColor: colors.success }]}>
              <Text style={styles.statValue}>${monthTotal.toFixed(0)}</Text>
              <Text style={styles.statLabel}>collected in {month}</Text>
            </View>
            <View style={[styles.stat, { borderLeftColor: colors.purple }]}>
              <Text style={styles.statValue}>
                {paidIds.size}/{members.length}
              </Text>
              <Text style={styles.statLabel}>members contributed</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title="+ Record" onPress={() => setShowAdd(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="⬇ Export CSV" variant="outline" onPress={exportCsv} />
            </View>
          </View>

          {unpaid.length > 0 && (
            <Card style={{ marginTop: 12 }}>
              <Text style={styles.sectionTitle}>Not yet contributed ({month})</Text>
              {unpaid.map((m) => (
                <Text key={m.id} style={styles.unpaidRow}>
                  • {m.full_name}
                </Text>
              ))}
            </Card>
          )}

          <Text style={styles.sectionTitle}>Recorded in {month}</Text>
          {monthRows.length === 0 && <Empty text="Nothing recorded this month." />}
          {monthRows.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>
                  {r.person?.full_name ?? 'Unknown'}
                </Text>
                <Text style={styles.amount}>${Number(r.amount).toFixed(2)}</Text>
              </View>
            </Card>
          ))}
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.sectionTitle}>My Contributions</Text>
            <Text style={styles.total}>${myTotal.toFixed(2)}</Text>
            <Text style={styles.meta}>All time · recorded by leaders</Text>
          </Card>
          {myRows.length === 0 && <Empty text="No contributions recorded yet." />}
          {myRows.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>{r.contribution_month.slice(0, 7)}</Text>
                <Text style={styles.amount}>${Number(r.amount).toFixed(2)}</Text>
              </View>
            </Card>
          ))}
        </>
      )}

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Record Contribution</Text>
            <Field
              label={person ? `Person: ${person.full_name}` : 'Search person'}
              value={search}
              onChangeText={searchPeople}
              placeholder="Type at least 2 letters..."
            />
            {!person && (
              <FlatList
                data={candidates}
                keyExtractor={(p) => p.id}
                style={{ maxHeight: 180 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.candidate}
                    onPress={() => {
                      setPerson(item);
                      setSearch(item.full_name);
                      setCandidates([]);
                    }}
                  >
                    <Text style={{ fontWeight: '600', color: colors.text }}>{item.full_name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <Field
              label="Amount (USD)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="50.00"
            />
            <Field label="Month (YYYY-MM)" value={entryMonth} onChangeText={setEntryMonth} />
            <Button title="Save" onPress={save} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowAdd(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnText: { fontSize: 20, color: colors.primary, fontWeight: '700' },
  monthLabel: { fontSize: 18, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  unpaidRow: { color: colors.text, fontSize: 14, paddingVertical: 3 },
  total: { fontSize: 32, fontWeight: '800', color: colors.success, marginVertical: 4 },
  meta: { color: colors.muted, fontSize: 12 },
  amount: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
  candidate: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
