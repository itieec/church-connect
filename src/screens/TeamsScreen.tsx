import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { useUnread } from '@/lib/useUnread';
import { Empty } from '@/components/ui';
import { colors, font } from '@/theme';
import { Team } from '@/types';
import { MoreStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'Teams'>;

const TEAM_ICONS: Record<string, string> = {
  'Bible Study': '📖',
  'Follow Up': '📞',
  G5: '🖐',
  Usher: '🚪',
  Worship: '🎵',
  Media: '📷',
  'Sound System': '🎚',
  Prayer: '🙏',
  Evangelism: '📣',
  Finance: '💰',
  Hospitality: '🍽',
  Administration: '🗂',
  Outreach: '🌍',
};

export default function TeamsScreen({ navigation }: Props) {
  const unread = useUnread(true);
  const [teams, setTeams] = useState<(Team & { count?: number })[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('teams')
      .select('*, team_members(count)')
      .eq('is_active', true)
      .order('team_name');
    const rows = ((data as any[]) ?? []).map((t) => ({
      ...t,
      count: t.team_members?.[0]?.count ?? 0,
    }));
    setTeams(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={teams}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Empty text="No teams found." />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('TeamDetail', { teamId: item.id })}
          >
            <Text style={{ fontSize: 22 }}>{TEAM_ICONS[item.team_name] ?? '👥'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.team_name}</Text>
              <Text style={styles.meta}>{item.count} member{item.count === 1 ? '' : 's'}</Text>
            </View>
            {(unread.perGroup[`team:${item.id}`] ?? 0) > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={{ color: '#fff', fontSize: 11, fontFamily: font.bold }}>
                  {unread.perGroup[`team:${item.id}`]}
                </Text>
              </View>
            )}
            <Text style={{ color: colors.muted }}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  name: { fontSize: 16, fontFamily: font.semibold, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  unreadBadge: {
    backgroundColor: colors.danger,
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 6,
  },
});
