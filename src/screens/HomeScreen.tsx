import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import ChurchMap from '@/components/ChurchMap';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Card, StatusBadge } from '@/components/ui';
import { colors, font, type, spacing, radius, hairline, shadow, tabular } from '@/theme';

interface Stats {
  newcomers: number;
  members: number;
  g5Groups: number;
  bibleStudyGroups: number;
}

interface StaleItem {
  id: string;
  full_name: string;
  daysSince: number | null; // null = never followed up
  mine: boolean;
}

interface AnnouncementItem {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

interface EventItem {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
}

const STALE_DAYS = 14;

export default function HomeScreen() {
  const { profile, isLeader } = useAuth();
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [stale, setStale] = useState<StaleItem[]>([]);
  const [dueThisWeek, setDueThisWeek] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const canFollowUp = isLeader || profile?.role === 'minister';

  const load = useCallback(async () => {
    const [nc, mem, g5, bs, ann] = await Promise.all([
      supabase.from('new_comers').select('id', { count: 'exact', head: true }).in('status', ['active', 'ready']),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).in('status', ['member', 'minister']),
      supabase.from('g5_groups').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('bible_study_groups').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .order('created_at', { ascending: false })
        .limit(3),
    ]);
    setAnnouncements((ann.data as AnnouncementItem[]) ?? []);

    const { data: ev } = await supabase
      .from('events')
      .select('id, title, event_date, event_time, location')
      .eq('is_active', true)
      .gte('event_date', new Date().toISOString().slice(0, 10))
      .order('event_date')
      .limit(3);
    setEvents((ev as EventItem[]) ?? []);
    setStats({
      newcomers: nc.count ?? 0,
      members: mem.count ?? 0,
      g5Groups: g5.count ?? 0,
      bibleStudyGroups: bs.count ?? 0,
    });

    if (canFollowUp) {
      const [{ data: newcomers }, { data: updates }] = await Promise.all([
        supabase
          .from('new_comers')
          .select('id, full_name, assigned_followup_leader_id, registered_date')
          .in('status', ['active', 'ready']),
        supabase
          .from('follow_up_updates')
          .select('new_comer_id, follow_up_date, next_follow_up_date, created_at')
          .order('created_at', { ascending: false }),
      ]);

      const lastUpdate: Record<string, string> = {};
      const nextScheduled: Record<string, string> = {};
      (updates ?? []).forEach(
        (u: { new_comer_id: string; follow_up_date: string; next_follow_up_date: string | null }) => {
          if (!lastUpdate[u.new_comer_id] || u.follow_up_date > lastUpdate[u.new_comer_id]) {
            lastUpdate[u.new_comer_id] = u.follow_up_date;
          }
          // updates are ordered newest-first; keep the latest scheduled date
          if (u.next_follow_up_date && !nextScheduled[u.new_comer_id]) {
            nextScheduled[u.new_comer_id] = u.next_follow_up_date;
          }
        },
      );
      const todayStr = new Date().toISOString().slice(0, 10);

      const now = Date.now();
      const items: StaleItem[] = [];
      let due = 0;
      (newcomers ?? []).forEach(
        (n: {
          id: string;
          full_name: string;
          assigned_followup_leader_id: string | null;
          registered_date: string;
        }) => {
          const last = lastUpdate[n.id] ?? null;
          const ref = last ?? n.registered_date;
          const days = Math.floor((now - new Date(ref).getTime()) / 86400000);
          const mine = n.assigned_followup_leader_id === profile?.id;
          const scheduledOverdue =
            !!nextScheduled[n.id] && nextScheduled[n.id] < todayStr && (!last || last < nextScheduled[n.id]);
          if ((days >= 7 || scheduledOverdue) && mine) due += 1;
          if (days >= STALE_DAYS || scheduledOverdue) {
            items.push({
              id: n.id,
              full_name: n.full_name,
              daysSince: last ? days : null,
              mine,
            });
          }
        },
      );
      items.sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999));
      setStale(items.slice(0, 10));
      setDueThisWeek(due);
    }
  }, [canFollowUp, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function openNewcomer(id: string) {
    navigation.navigate('FollowUp', {
      screen: 'FollowUpDetail',
      params: { newComerId: id },
      initial: false,
    });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Card>
        <Text style={styles.greeting}>Welcome, {profile?.full_name ?? '...'}</Text>
        <View style={{ marginTop: 8 }}>
          {profile && <StatusBadge status={profile.status} />}
        </View>
        <Text style={styles.roleText}>
          Role: {profile?.role.replace('_', ' ') ?? '—'}
        </Text>
      </Card>

      {/* Quick actions — the most-used screens, one tap from Home */}
      <View style={styles.quickGrid}>
        {(
          [
            ...(canFollowUp
              ? [
                  { icon: '📝', label: 'Register', nav: ['FollowUp', 'NewcomerRegistration'] },
                  { icon: '🗓', label: 'Attendance', nav: ['More', 'Attendance'] },
                  { icon: '📷', label: 'Check-In', nav: ['More', 'CheckIn'] },
                  { icon: '📊', label: 'Reports', nav: ['More', 'Reports'] },
                ]
              : []),
            { icon: '🪪', label: 'My Card', nav: ['More', 'MemberCard'] },
            { icon: '🗓', label: 'Events', nav: ['More', 'Events'] },
            { icon: '🙏', label: 'Prayer', nav: ['More', 'Prayer'] },
            { icon: '🤝', label: 'One-to-One', nav: ['More', 'Appointments'] },
          ] as { icon: string; label: string; nav: [string, string] }[]
        ).map((q) => (
          <TouchableOpacity
            key={q.label}
            style={styles.quickTile}
            onPress={() =>
              navigation.navigate(q.nav[0], { screen: q.nav[1], initial: false })
            }
          >
            <Text style={{ fontSize: 24 }}>{q.icon}</Text>
            <Text style={styles.quickLabel}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {events.length > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.sectionTitle}>🗓 Upcoming Events</Text>
            <Text
              style={styles.seeAll}
              onPress={() => navigation.navigate('More', { screen: 'Events', initial: false })}
            >
              See all ›
            </Text>
          </View>
          {events.map((ev) => (
            <TouchableOpacity
              key={ev.id}
              style={styles.annRow}
              onPress={() => navigation.navigate('More', { screen: 'Events', initial: false })}
            >
              <Text style={styles.annTitle}>{ev.title}</Text>
              <Text style={styles.annMeta}>
                {ev.event_date}
                {ev.event_time ? ` · ${ev.event_time}` : ''}
                {ev.location ? ` · ${ev.location}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {announcements.length > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.sectionTitle}>📢 Announcements</Text>
            <Text
              style={styles.seeAll}
              onPress={() =>
                navigation.navigate('More', { screen: 'Announcements', initial: false })
              }
            >
              See all ›
            </Text>
          </View>
          {announcements.map((a) => (
            <View key={a.id} style={styles.annRow}>
              <Text style={styles.annTitle}>{a.title}</Text>
              {a.body ? (
                <Text style={styles.annMeta} numberOfLines={2}>
                  {a.body}
                </Text>
              ) : null}
              <Text style={styles.annMeta}>
                {new Date(a.created_at).toLocaleDateString()}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {canFollowUp && (stale.length > 0 || dueThisWeek > 0) && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.warning }}>
          <Text style={styles.sectionTitle}>⚠️ Needs Attention</Text>
          {dueThisWeek > 0 && (
            <Text style={styles.alertLine}>
              {dueThisWeek} of your assignments {dueThisWeek === 1 ? 'is' : 'are'} due for a weekly
              update.
            </Text>
          )}
          {stale.length > 0 && (
            <Text style={[styles.alertLine, { marginBottom: 8 }]}>
              {stale.length} newcomer{stale.length === 1 ? '' : 's'} with no follow-up in{' '}
              {STALE_DAYS}+ days:
            </Text>
          )}
          {stale.map((s) => (
            <TouchableOpacity key={s.id} style={styles.staleRow} onPress={() => openNewcomer(s.id)}>
              <Text style={styles.staleName}>
                {s.full_name}
                {s.mine ? '  (yours)' : ''}
              </Text>
              <Text style={styles.staleAge}>
                {s.daysSince == null ? 'never followed up' : `${s.daysSince}d ago`}
              </Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {isLeader && stats && (
        <View style={styles.grid}>
          <StatCard label="Active Newcomers" value={stats.newcomers} color={colors.warning} />
          <StatCard label="Members" value={stats.members} color={colors.purple} />
          <StatCard label="G5 Groups" value={stats.g5Groups} color={colors.success} />
          <StatCard label="Bible Study Groups" value={stats.bibleStudyGroups} color={colors.primaryLight} />
        </View>
      )}

      <Card>
        <Text style={styles.sectionTitle}>Member Journey</Text>
        <Text style={styles.journey}>
          Newcomer → Follow Up → Ready → Member → G5 + Bible Study → Minister
        </Text>
        <Text style={styles.vision}>
          "Every person discipled, connected and equipped to serve."
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>📍 Find Us</Text>
        <Text style={styles.address}>7930 Eastern Avenue NW</Text>
        <Text style={styles.addressMeta}>Washington, DC 20012 · Sun 6:00 PM</Text>
        <ChurchMap />
      </Card>
    </ScrollView>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.stat, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.groupedBg },
  greeting: { ...type.title2, color: colors.text },
  roleText: { ...type.subhead, color: colors.muted, marginTop: spacing.sm, textTransform: 'capitalize' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  stat: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    width: '47%',
    // Colour is carried by a leading rule rather than a full border, so the
    // tile reads as one surface instead of a boxed-in card.
    borderLeftWidth: 3,
    ...shadow(1),
  },
  // Tabular figures keep the four stat tiles aligned as the counts change.
  statValue: { ...type.title, ...tabular, color: colors.text },
  statLabel: { ...type.caption, color: colors.muted, marginTop: 2 },

  sectionTitle: { ...type.headline, color: colors.text, marginBottom: spacing.sm },
  seeAll: { ...type.footnote, color: colors.primary },
  alertLine: { ...type.subhead, color: colors.text, marginBottom: spacing.xs },

  annRow: {
    paddingVertical: spacing.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  annTitle: { ...type.callout, fontFamily: font.semibold, color: colors.text },
  annMeta: { ...type.footnote, color: colors.muted, marginTop: 2 },

  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  quickTile: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    width: '22.4%',
    minWidth: 76,
    ...shadow(1),
  },
  quickLabel: {
    ...type.caption,
    fontFamily: font.semibold,
    color: colors.text,
    marginTop: spacing.xs,
  },

  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    gap: spacing.sm,
  },
  staleName: { flex: 1, ...type.callout, fontFamily: font.semibold, color: colors.text },
  staleAge: { ...type.caption, fontFamily: font.semibold, color: colors.danger },

  journey: { ...type.body, color: colors.text },
  vision: { ...type.subhead, color: colors.muted, fontStyle: 'italic', marginTop: spacing.md },

  address: { ...type.callout, fontFamily: font.semibold, color: colors.text, marginBottom: 2 },
  addressMeta: { ...type.footnote, color: colors.muted, marginBottom: spacing.sm },
});
