import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface UnreadState {
  total: number;
  perGroup: Record<string, number>; // key: `${group_type}:${group_id}`
  refresh: () => void;
}

/**
 * Counts unread chat messages across all groups the current user belongs to.
 * Polls every 30s and exposes a manual refresh.
 */
export function useUnread(enabled: boolean): UnreadState {
  const [total, setTotal] = useState(0);
  const [perGroup, setPerGroup] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;

      const [g5, bs, tm, reads] = await Promise.all([
        supabase.from('g5_members').select('group_id').eq('person_id', uid),
        supabase.from('bible_study_members').select('group_id').eq('person_id', uid),
        supabase.from('team_members').select('team_id').eq('person_id', uid),
        supabase.from('chat_reads').select('group_type, group_id, last_read_at').eq('person_id', uid),
      ]);

      const groups: { type: string; id: string }[] = [
        ...((g5.data as { group_id: string }[]) ?? []).map((r) => ({ type: 'g5', id: r.group_id })),
        ...((bs.data as { group_id: string }[]) ?? []).map((r) => ({
          type: 'bible_study',
          id: r.group_id,
        })),
        ...((tm.data as { team_id: string }[]) ?? []).map((r) => ({ type: 'team', id: r.team_id })),
      ];
      if (groups.length === 0) {
        setTotal(0);
        setPerGroup({});
        return;
      }

      const readMap: Record<string, string> = {};
      ((reads.data as { group_type: string; group_id: string; last_read_at: string }[]) ?? []).forEach(
        (r) => {
          readMap[`${r.group_type}:${r.group_id}`] = r.last_read_at;
        },
      );

      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: msgs } = await supabase
        .from('group_messages')
        .select('group_type, group_id, created_at, sender_id')
        .in('group_id', groups.map((g) => g.id))
        .gt('created_at', since)
        .limit(2000);

      const counts: Record<string, number> = {};
      ((msgs as { group_type: string; group_id: string; created_at: string; sender_id: string }[]) ?? []).forEach(
        (m) => {
          if (m.sender_id === uid) return;
          const key = `${m.group_type}:${m.group_id}`;
          if (!groups.some((g) => g.type === m.group_type && g.id === m.group_id)) return;
          const lastRead = readMap[key];
          if (!lastRead || m.created_at > lastRead) {
            counts[key] = (counts[key] ?? 0) + 1;
          }
        },
      );
      setPerGroup(counts);
      setTotal(Object.values(counts).reduce((s, n) => s + n, 0));
    } catch {
      // network hiccups: keep previous counts
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [enabled, refresh]);

  return { total, perGroup, refresh };
}
