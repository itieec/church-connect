import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Empty } from '@/components/ui';
import { colors, font } from '@/theme';
import { FollowUpStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FollowUpStackParamList, 'FollowUpList'>;

interface Newcomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  first_visit_date: string | null;
  status: string;
  created_at: string;
}

type ListFilter = 'mine' | 'all';

export default function FollowUpListScreen({ navigation }: Props) {
  const { isLeader, profile } = useAuth();
  const followUpRole = (profile as any)?.follow_up_role as string | null | undefined;
  const isFollowUpLeader = isLeader || followUpRole === 'leader';
  const hasFollowUpAccess = isFollowUpLeader || !!followUpRole;

  const [filter, setFilter] = useState<ListFilter>(isFollowUpLeader ? 'all' : 'mine');
  const [newcomers, setNewcomers] = useState<Newcomer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (profile?.id && followUpRole) {
      checkReminders(profile.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function checkReminders(userId: string) {
    try {
      const { data: assignments } = await supabase
        .from('follow_up_assignments')
        .select('newcomer_id, assigned_at, newcomers:newcomer_id(first_name, last_name)')
        .eq('assigned_to', userId)
        .eq('active', true);
      if (!assignments || assignments.length === 0) return;

      const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const fourteenAgo = new Date(Date.now() - 14 * 86400000).toISOString();

      for (const asgn of assignments as any[]) {
        const { newcomer_id: newcomerId, assigned_at, newcomers: nc } = asgn;
        const newcomerName = `${nc?.first_name ?? ''} ${nc?.last_name ?? ''}`.trim();

        const { data: lastEntry } = await supabase
          .from('follow_up_history')
          .select('contact_date')
          .eq('newcomer_id', newcomerId)
          .order('contact_date', { ascending: false })
          .limit(1);

        const lastActivity = lastEntry?.[0]?.contact_date ?? assigned_at;
        if (lastActivity > sevenAgo) continue;

        // Only notify if we haven't sent one in the last 7 days
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'followup_reminder')
          .ilike('message', `%${newcomerId}%`)
          .gte('created_at', sevenAgo)
          .limit(1);
        if (existing && existing.length > 0) continue;

        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Follow-up Reminder',
          message: `No update for ${newcomerName} (${newcomerId}) in 7+ days. Please reach out.`,
          type: 'followup_reminder',
          read: false,
        });

        if (lastActivity <= fourteenAgo) {
          const { data: leaders } = await supabase
            .from('profiles')
            .select('id')
            .eq('follow_up_role', 'leader');
          for (const leader of (leaders as { id: string }[]) ?? []) {
            const { data: ex } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', leader.id)
              .eq('type', 'followup_overdue')
              .ilike('message', `%${newcomerId}%`)
              .gte('created_at', sevenAgo)
              .limit(1);
            if (ex && ex.length > 0) continue;
            await supabase.from('notifications').insert({
              user_id: leader.id,
              title: 'Follow-up Overdue',
              message: `${newcomerName} (${newcomerId}) has not been contacted in 14+ days.`,
              type: 'followup_overdue',
              read: false,
            });
          }
        }
      }
    } catch {
      // ignore background errors
    }
  }

  const load = useCallback(async () => {
    if (!profile?.id || !hasFollowUpAccess) return;

    if (filter === 'all' && isFollowUpLeader) {
      const { data } = await supabase
        .from('newcomers')
        .select('id, first_name, last_name, phone, email, first_visit_date, status, created_at')
        .order('created_at', { ascending: false });
      setNewcomers((data as Newcomer[]) ?? []);
    } else {
      const { data: assignments } = await supabase
        .from('follow_up_assignments')
        .select('newcomer_id')
        .eq('assigned_to', profile.id)
        .eq('active', true);
      const ids = ((assignments as { newcomer_id: string }[]) ?? []).map((a) => a.newcomer_id);
      if (ids.length === 0) { setNewcomers([]); return; }
      const { data } = await supabase
        .from('newcomers')
        .select('id, first_name, last_name, phone, email, first_visit_date, status, created_at')
        .in('id', ids)
        .order('created_at', { ascending: false });
      setNewcomers((data as Newcomer[]) ?? []);
    }
  }, [filter, profile?.id, hasFollowUpAccess, isFollowUpLeader]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!hasFollowUpAccess) {
    return (
      <View style={styles.noAccess}>
        <Text style={{ fontSize: 48 }}>🔒</Text>
        <Text style={styles.noAccessTitle}>No Follow-Up Access</Text>
        <Text style={styles.noAccessSub}>
          You haven't been assigned to the follow-up team. Contact your leader to be added.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {isFollowUpLeader && (
          <View style={styles.filterRow}>
            {([
              { key: 'all' as ListFilter, label: 'All' },
              { key: 'mine' as ListFilter, label: 'My Assignments' },
            ] as const).map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterPill, filter === f.key && styles.filterActive]}
              >
                <Text style={{ color: filter === f.key ? '#fff' : colors.text, fontFamily: font.semibold }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {isFollowUpLeader && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('NewcomerRegistration')}
          >
            <Text style={{ color: '#fff', fontFamily: font.bold }}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={newcomers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          />
        }
        ListEmptyComponent={
          <Empty
            text={filter === 'mine' ? 'No assigned newcomers.' : 'No newcomers yet. Tap + New to register one.'}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() => navigation.navigate('FollowUpDetail', { newComerId: item.id })}
          >
            <View style={styles.avatar}>
              <Text style={{ color: '#fff', fontFamily: font.bold }}>
                {item.first_name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
              <Text style={styles.meta}>
                First visit {item.first_visit_date ?? '—'} · {item.phone ?? item.email ?? 'no contact'}
              </Text>
            </View>
            <StatusPill status={item.status} />
            <Text style={{ color: colors.muted }}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    new:                 { bg: colors.primaryLight, label: 'NEW' },
    in_progress:         { bg: colors.warning,      label: 'IN PROGRESS' },
    ready_for_next_step: { bg: '#f97316',            label: 'READY' },
  };
  const { bg, label } = map[status] ?? { bg: colors.muted, label: status.toUpperCase() };
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <Text style={{ color: '#fff', fontSize: 9, fontFamily: font.bold }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  noAccess: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: colors.bg },
  noAccessTitle: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginTop: 12, textAlign: 'center' },
  noAccessSub: { color: colors.muted, marginTop: 8, textAlign: 'center', lineHeight: 22 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
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
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 16, fontFamily: font.semibold, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
});
