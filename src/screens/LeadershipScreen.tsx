import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { Screen, ListSection, ListRow, Avatar, Empty, SkeletonList } from '@/components/ui';
import { colors, type, spacing } from '@/theme';

interface LeaderRow {
  team_type: string;
  team_name: string;
  leader_id: string;
  full_name: string;
  position: string;
}

/** Order the sections so the follow-up team leads, then the rest. */
const SECTION_ORDER = ['Follow-Up', 'Ministry Team', 'G5 Group', 'Bible Study'];

const POSITION_LABEL: Record<string, string> = {
  leader: 'Leader',
  assistant_leader: 'Assistant Leader',
};

export default function LeadershipScreen() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('team_leaders')
      .select('*')
      .order('team_type')
      .order('team_name');
    setRows((data as LeaderRow[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (rows === null) {
    return (
      <Screen>
        <SkeletonList rows={6} />
      </Screen>
    );
  }

  if (rows.length === 0) {
    return (
      <Screen>
        <Empty
          icon="🧭"
          text="No leaders assigned yet. Set a leader on a ministry team, G5 group or Bible study and they will appear here."
        />
      </Screen>
    );
  }

  const groups = SECTION_ORDER.map((t) => ({
    type: t,
    items: rows.filter((r) => r.team_type === t),
  })).filter((g) => g.items.length > 0);

  return (
    <Screen>
      <Text style={styles.intro}>
        Every leadership position across the ministry, in one place.
      </Text>

      {groups.map((g) => (
        <ListSection key={g.type} title={g.type} footer={countLabel(g.items.length)}>
          {g.items.map((r, i) => (
            <ListRow
              key={`${r.team_name}-${r.leader_id}-${r.position}-${i}`}
              label={r.full_name}
              sublabel={`${r.team_name} · ${POSITION_LABEL[r.position] ?? r.position}`}
              chevron={false}
              leading={<Avatar name={r.full_name} size={36} />}
            />
          ))}
        </ListSection>
      ))}
    </Screen>
  );
}

function countLabel(n: number) {
  return n === 1 ? '1 position' : `${n} positions`;
}

const styles = {
  intro: {
    ...type.subhead,
    color: colors.muted,
    marginBottom: spacing.lg,
  } as const,
};
