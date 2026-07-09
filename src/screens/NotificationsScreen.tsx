import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { notify, confirmDialog } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { useUnread } from '@/lib/useUnread';
import { navigationRef } from '@/navigation';
import { Card, Empty } from '@/components/ui';
import { colors } from '@/theme';

interface FeedItem {
  id: string;
  icon: string;
  title: string;
  sub: string;
  onPress?: () => void;
}

export default function NotificationsScreen() {
  const navigation = {
    navigate: (...args: unknown[]) => {
      if (navigationRef.isReady()) (navigationRef.navigate as (...a: unknown[]) => void)(...args);
    },
  };
  const { profile, isLeader } = useAuth();
  const isAdmin = !!profile && ['super_admin', 'admin'].includes(profile.role);
  const unread = useUnread(!!profile);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!profile) return;
    const feed: FeedItem[] = [];
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // In-app notifications table
    const { data: notifRows } = await supabase
      .from('notifications')
      .select('id, title, message, type, read, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    ((notifRows as { id: string; title: string; message: string; type: string; read: boolean; created_at: string }[]) ?? []).forEach((n) => {
      feed.push({ id: `notif-${n.id}`, icon: n.type === 'newcomer_registered' ? '🆕' : '🔔', title: n.title, sub: n.message });
    });
    const unreadIds = ((notifRows as { id: string; read: boolean }[]) ?? []).filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      supabase.from('notifications').update({ read: true }).in('id', unreadIds).then(() => {});
    }

    const [ann, ev, appts, g5n, bsn, tmn, swaps, ready] = await Promise.all([
      supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .gt('created_at', twoWeeksAgo)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('events')
        .select('id, title, event_date, event_time, location')
        .eq('is_active', true)
        .gte('event_date', today)
        .order('event_date')
        .limit(3),
      supabase
        .from('appointments')
        .select('id, topic, status, scheduled_at, created_at')
        .eq('requester_id', profile.id)
        .in('status', ['confirmed', 'declined'])
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('g5_groups').select('id, group_name'),
      supabase.from('bible_study_groups').select('id, group_name'),
      supabase.from('teams').select('id, team_name'),
      isLeader
        ? supabase
            .from('team_schedules')
            .select('id, service_date, duty, person:profiles!team_schedules_person_id_fkey(full_name), team:teams(team_name)')
            .eq('status', 'swap_requested')
            .gte('service_date', today)
            .limit(10)
        : Promise.resolve({ data: [] }),
      isLeader
        ? supabase.from('new_comers').select('id, full_name').eq('status', 'ready').limit(10)
        : Promise.resolve({ data: [] }),
    ]);

    // group name lookup for unread chats
    const names: Record<string, string> = {};
    ((g5n.data as { id: string; group_name: string }[]) ?? []).forEach((g) => {
      names[`g5:${g.id}`] = g.group_name;
    });
    ((bsn.data as { id: string; group_name: string }[]) ?? []).forEach((g) => {
      names[`bible_study:${g.id}`] = g.group_name;
    });
    ((tmn.data as { id: string; team_name: string }[]) ?? []).forEach((g) => {
      names[`team:${g.id}`] = g.team_name;
    });
    setGroupNames(names);

    // Unread chats
    Object.entries(unread.perGroup).forEach(([key, count]) => {
      if (count > 0) {
        const [type, id] = key.split(':');
        feed.push({
          id: `chat-${key}`,
          icon: '💬',
          title: `${count} new message${count === 1 ? '' : 's'} in ${names[key] ?? 'a group'}`,
          sub: 'Tap to open the chat',
          onPress: () =>
            type === 'team'
              ? navigation.navigate('Main', {
                  screen: 'More',
                  params: {
                    screen: 'TeamChat',
                    params: { kind: 'team', groupId: id, groupName: names[key] ?? 'Team' },
                    initial: false,
                  },
                })
              : navigation.navigate('Main', {
                  screen: 'Groups',
                  params: {
                    screen: 'GroupChat',
                    params: { kind: type, groupId: id, groupName: names[key] ?? 'Group' },
                    initial: false,
                  },
                }),
        });
      }
    });

    // Admin: accounts waiting for approval
    if (isAdmin) {
      const { data: pendingAccounts } = await supabase
        .from('profiles')
        .select('id, full_name, created_at')
        .eq('account_approved', false)
        .order('created_at', { ascending: false })
        .limit(10);
      ((pendingAccounts as { id: string; full_name: string }[]) ?? []).forEach((p) => {
        feed.push({
          id: `acct-${p.id}`,
          icon: '🔑',
          title: `${p.full_name} is waiting for account approval`,
          sub: 'Tap to approve now',
          onPress: () =>
            confirmDialog(
              'Approve account',
              `${p.full_name} will get full access and be notified.`,
              'Approve',
              async () => {
                const { error } = await supabase
                  .from('profiles')
                  .update({ account_approved: true })
                  .eq('id', p.id);
                if (error) notify('Error', error.message);
                else {
                  notify('Approved', `${p.full_name} now has access. 🎉`);
                  load();
                }
              },
            ),
        });
      });
    }

    // Leader queues
    ((ready.data as { id: string; full_name: string }[]) ?? []).forEach((n) => {
      feed.push({
        id: `ready-${n.id}`,
        icon: '🟠',
        title: `${n.full_name} is READY for member approval`,
        sub: 'Open Follow Up to approve',
        onPress: () =>
          navigation.navigate('Main', {
            screen: 'FollowUp',
            params: { screen: 'FollowUpDetail', params: { newComerId: n.id }, initial: false },
          }),
      });
    });
    (
      (swaps.data as unknown as {
        id: string;
        service_date: string;
        duty: string | null;
        person: { full_name: string } | null;
        team: { team_name: string } | null;
      }[]) ?? []
    ).forEach((s) => {
      feed.push({
        id: `swap-${s.id}`,
        icon: '🔄',
        title: `${s.person?.full_name ?? 'Someone'} requested a swap`,
        sub: `${s.team?.team_name ?? 'Team'} · ${s.service_date}${s.duty ? ` · ${s.duty}` : ''}`,
      });
    });

    // My appointment updates
    ((appts.data as { id: string; topic: string; status: string; scheduled_at: string | null }[]) ?? []).forEach(
      (a) => {
        feed.push({
          id: `appt-${a.id}`,
          icon: a.status === 'confirmed' ? '📅' : '🤝',
          title:
            a.status === 'confirmed'
              ? `Your ${a.topic.replace('_', ' ')} time is confirmed`
              : `Update on your ${a.topic.replace('_', ' ')} request`,
          sub: a.scheduled_at ?? 'Open One-to-One for details',
          onPress: () =>
            navigation.navigate('Main', {
              screen: 'More',
              params: { screen: 'Appointments', initial: false },
            }),
        });
      },
    );

    // Events
    ((ev.data as { id: string; title: string; event_date: string; event_time: string | null; location: string | null }[]) ?? []).forEach(
      (e) => {
        feed.push({
          id: `ev-${e.id}`,
          icon: '🗓',
          title: e.title,
          sub: `${e.event_date}${e.event_time ? ` · ${e.event_time}` : ''}${e.location ? ` · ${e.location}` : ''}`,
          onPress: () =>
            navigation.navigate('Main', {
              screen: 'More',
              params: { screen: 'Events', initial: false },
            }),
        });
      },
    );

    // Announcements
    ((ann.data as { id: string; title: string; body: string | null; created_at: string }[]) ?? []).forEach(
      (a) => {
        feed.push({
          id: `ann-${a.id}`,
          icon: '📢',
          title: a.title,
          sub: a.body?.slice(0, 80) ?? new Date(a.created_at).toLocaleDateString(),
          onPress: () =>
            navigation.navigate('Main', {
              screen: 'More',
              params: { screen: 'Announcements', initial: false },
            }),
        });
      },
    );

    setItems(feed);
    // Mark seen
    AsyncStorage.setItem('notif_seen', new Date().toISOString()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isLeader, unread.perGroup]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      {items.length === 0 && <Empty text="You're all caught up! 🎉" />}
      {items.map((i) => (
        <TouchableOpacity key={i.id} disabled={!i.onPress} onPress={i.onPress}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 22 }}>{i.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{i.title}</Text>
                <Text style={styles.sub}>{i.sub}</Text>
              </View>
              {i.onPress && <Text style={{ color: colors.muted }}>›</Text>}
            </View>
          </Card>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
