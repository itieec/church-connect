import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { Card, Empty } from '@/components/ui';
import { colors } from '@/theme';

interface AttRow {
  service_date: string;
  service_type: string;
  present: boolean;
}

interface ReportRow {
  id: string;
  group_type: string;
  report_date: string;
  attendance_count: number | null;
  lesson: string | null;
  notes: string | null;
  submitter: { full_name: string } | null;
}

export default function ReportsScreen() {
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [inactive, setInactive] = useState<{ name: string; last: string | null }[]>([]);
  const [birthdays, setBirthdays] = useState<{ name: string; day: string }[]>([]);
  const [digest, setDigest] = useState<{ label: string; value: number; icon: string }[]>([]);
  const [growth, setGrowth] = useState<{ month: string; count: number }[]>([]);
  const [attendance, setAttendance] = useState<{ date: string; type: string; count: number }[]>([]);
  const [fuWeeks, setFuWeeks] = useState<{ week: string; count: number }[]>([]);
  const [groupReports, setGroupReports] = useState<ReportRow[]>([]);

  const load = useCallback(async () => {
    const [{ data: profiles }, { data: nc }, { data: att }, { data: fu }, gr] = await Promise.all([
      supabase.from('profiles').select('status'),
      supabase.from('new_comers').select('registered_date'),
      supabase.from('attendance').select('service_date, service_type, present').eq('present', true),
      supabase.from('follow_up_updates').select('follow_up_date'),
      supabase
        .from('group_reports')
        .select('*, submitter:profiles!group_reports_submitted_by_fkey(full_name)')
        .order('report_date', { ascending: false })
        .limit(20),
    ]);

    // status distribution
    const sc: Record<string, number> = {};
    ((profiles as { status: string }[]) ?? []).forEach((p) => {
      sc[p.status] = (sc[p.status] ?? 0) + 1;
    });
    setStatusCounts(sc);

    // newcomer growth by month
    const gm: Record<string, number> = {};
    ((nc as { registered_date: string }[]) ?? []).forEach((r) => {
      const m = r.registered_date.slice(0, 7);
      gm[m] = (gm[m] ?? 0) + 1;
    });
    setGrowth(
      Object.entries(gm)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 6)
        .map(([month, count]) => ({ month, count })),
    );

    // attendance per service date
    const am: Record<string, number> = {};
    ((att as AttRow[]) ?? []).forEach((r) => {
      const key = `${r.service_date}|${r.service_type}`;
      am[key] = (am[key] ?? 0) + 1;
    });
    setAttendance(
      Object.entries(am)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 8)
        .map(([key, count]) => {
          const [date, type] = key.split('|');
          return { date, type, count };
        }),
    );

    // follow-up updates per ISO week (approx by week start date)
    const fw: Record<string, number> = {};
    ((fu as { follow_up_date: string }[]) ?? []).forEach((r) => {
      const d = new Date(r.follow_up_date);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      fw[key] = (fw[key] ?? 0) + 1;
    });
    setFuWeeks(
      Object.entries(fw)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 6)
        .map(([week, count]) => ({ week, count })),
    );

    setGroupReports((gr.data as unknown as ReportRow[]) ?? []);

    // Inactive members: no attendance in the last 3 weeks
    const cutoff = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
    const [{ data: activeMembers }, { data: allAtt }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, date_of_birth')
        .in('status', ['member', 'minister'])
        .eq('is_active', true),
      supabase.from('attendance').select('person_id, service_date').eq('present', true),
    ]);
    const lastSeen: Record<string, string> = {};
    ((allAtt as { person_id: string; service_date: string }[]) ?? []).forEach((a) => {
      if (!lastSeen[a.person_id] || a.service_date > lastSeen[a.person_id]) {
        lastSeen[a.person_id] = a.service_date;
      }
    });
    const inactiveList: { name: string; last: string | null }[] = [];
    const month = new Date().toISOString().slice(5, 7);
    const bdays: { name: string; day: string }[] = [];
    (
      (activeMembers as { id: string; full_name: string; date_of_birth: string | null }[]) ?? []
    ).forEach((m) => {
      const last = lastSeen[m.id] ?? null;
      if (!last || last < cutoff) inactiveList.push({ name: m.full_name, last });
      if (m.date_of_birth && m.date_of_birth.slice(5, 7) === month) {
        bdays.push({ name: m.full_name, day: m.date_of_birth.slice(5) });
      }
    });
    setInactive(inactiveList.slice(0, 20));
    setBirthdays(bdays.sort((a, b) => a.day.localeCompare(b.day)));

    // ---- Weekly digest (last 7 days) ----
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const weekAgoTs = new Date(Date.now() - 7 * 86400000).toISOString();
    const [ncw, fuw, attw, ready, appts, prayers] = await Promise.all([
      supabase.from('new_comers').select('id', { count: 'exact', head: true }).gte('registered_date', weekAgo),
      supabase.from('follow_up_updates').select('id', { count: 'exact', head: true }).gte('follow_up_date', weekAgo),
      supabase
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .eq('present', true)
        .gte('service_date', weekAgo),
      supabase.from('new_comers').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('prayer_requests').select('id', { count: 'exact', head: true }).eq('status', 'open').gte('created_at', weekAgoTs),
    ]);
    setDigest([
      { icon: '🆕', label: 'New newcomers this week', value: ncw.count ?? 0 },
      { icon: '📞', label: 'Follow-up updates this week', value: fuw.count ?? 0 },
      { icon: '⛪', label: 'Attendance check-ins this week', value: attw.count ?? 0 },
      { icon: '🟠', label: 'READY — awaiting approval', value: ready.count ?? 0 },
      { icon: '🤝', label: 'One-to-one requests pending', value: appts.count ?? 0 },
      { icon: '🙏', label: 'New prayer requests open', value: prayers.count ?? 0 },
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const maxAtt = Math.max(1, ...attendance.map((a) => a.count));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.primary }}>
        <Text style={styles.sectionTitle}>📬 Weekly Leadership Digest</Text>
        {digest.map((d) => (
          <View key={d.label} style={styles.listRow}>
            <Text style={styles.listLabel}>
              {d.icon} {d.label}
            </Text>
            <Text style={[styles.listValue, { fontWeight: '800', color: colors.text }]}>
              {d.value}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Member Journey Snapshot</Text>
        <View style={styles.chipWrap}>
          {Object.entries(statusCounts).map(([s, c]) => (
            <View key={s} style={styles.chip}>
              <Text style={styles.chipText}>
                {s.replace('_', ' ')}: {c}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Attendance (by service)</Text>
        {attendance.length === 0 && <Empty text="No attendance recorded yet." />}
        {attendance.map((a) => (
          <View key={`${a.date}${a.type}`} style={styles.barRow}>
            <Text style={styles.barLabel}>
              {a.date} · {a.type.replace('_', ' ')}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: `${(a.count / maxAtt) * 100}%` }]} />
            </View>
            <Text style={styles.barValue}>{a.count}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Newcomer Growth (by month)</Text>
        {growth.length === 0 && <Empty text="No newcomers registered yet." />}
        {growth.map((g) => (
          <View key={g.month} style={styles.listRow}>
            <Text style={styles.listLabel}>{g.month}</Text>
            <Text style={styles.listValue}>{g.count} newcomer{g.count === 1 ? '' : 's'}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Follow-Up Activity (per week)</Text>
        {fuWeeks.length === 0 && <Empty text="No follow-up updates yet." />}
        {fuWeeks.map((w) => (
          <View key={w.week} style={styles.listRow}>
            <Text style={styles.listLabel}>week of {w.week}</Text>
            <Text style={styles.listValue}>{w.count} update{w.count === 1 ? '' : 's'}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>⚠️ Inactive Members (no attendance 3+ weeks)</Text>
        {inactive.length === 0 && <Empty text="Everyone has attended recently. 🎉" />}
        {inactive.map((m) => (
          <View key={m.name} style={styles.listRow}>
            <Text style={styles.listLabel}>{m.name}</Text>
            <Text style={styles.listValue}>{m.last ? `last seen ${m.last}` : 'never recorded'}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>🎂 Birthdays This Month</Text>
        {birthdays.length === 0 && <Empty text="No birthdays recorded this month." />}
        {birthdays.map((b) => (
          <View key={b.name} style={styles.listRow}>
            <Text style={styles.listLabel}>{b.name}</Text>
            <Text style={styles.listValue}>{b.day}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent Group Reports</Text>
        {groupReports.length === 0 && <Empty text="No weekly group reports yet." />}
        {groupReports.map((r) => (
          <View key={r.id} style={styles.reportRow}>
            <Text style={styles.listLabel}>
              {r.group_type === 'g5' ? 'G5' : 'Bible Study'} · {r.report_date}
              {r.attendance_count != null ? ` · ${r.attendance_count} attended` : ''}
            </Text>
            {r.lesson ? <Text style={styles.reportText}>📖 {r.lesson}</Text> : null}
            {r.notes ? <Text style={styles.reportText}>{r.notes}</Text> : null}
            <Text style={styles.meta}>by {r.submitter?.full_name ?? 'Unknown'}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12, color: colors.text, textTransform: 'capitalize' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barLabel: { fontSize: 11, color: colors.muted, width: 150 },
  barTrack: { flex: 1, height: 14, backgroundColor: colors.bg, borderRadius: 7, overflow: 'hidden' },
  bar: { height: 14, backgroundColor: colors.primaryLight, borderRadius: 7 },
  barValue: { fontSize: 12, fontWeight: '700', color: colors.text, width: 26, textAlign: 'right' },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listLabel: { color: colors.text, fontWeight: '600', fontSize: 13 },
  listValue: { color: colors.muted, fontSize: 13 },
  reportRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  reportText: { color: colors.text, fontSize: 13, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
