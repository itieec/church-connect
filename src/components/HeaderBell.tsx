import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useUnread } from '@/lib/useUnread';
import { navigationRef } from '@/navigation';
import { colors } from '@/theme';

/** Bell icon shown in every header. Badge = unread chats + new announcements + leader queues. */
export default function HeaderBell() {
  const { profile, isLeader } = useAuth();
  const unread = useUnread(!!profile);
  const [extra, setExtra] = useState(0);

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      const lastSeen = (await AsyncStorage.getItem('notif_seen')) ?? '2000-01-01';
      const queries: PromiseLike<{ count: number | null }>[] = [
        supabase
          .from('announcements')
          .select('id', { count: 'exact', head: true })
          .gt('created_at', lastSeen),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('read', false),
      ];
      if (isLeader) {
        queries.push(
          supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('newcomers')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ready_for_next_step'),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('account_approved', false),
        );
      } else {
        queries.push(
          supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('requester_id', profile.id)
            .in('status', ['confirmed', 'declined'])
            .gt('created_at', lastSeen),
        );
      }
      const results = await Promise.all(queries);
      setExtra(results.reduce((s, r) => s + (r.count ?? 0), 0));
    } catch {
      // ignore network errors
    }
  }, [profile, isLeader]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 60000);
    return () => clearInterval(iv);
  }, [refresh]);

  const total = unread.total + extra;

  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={() => {
        if (navigationRef.isReady()) navigationRef.navigate('Notifications');
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ fontSize: 20 }}>🔔</Text>
      {total > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{total > 99 ? '99+' : total}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: 14, padding: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: colors.danger,
    borderRadius: 999,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
