import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { notify, confirmDialog } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export interface ChatParams {
  kind: 'g5' | 'bible_study' | 'team';
  groupId: string;
  groupName: string;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const GROUP_TABLE: Record<ChatParams['kind'], string> = {
  g5: 'g5_groups',
  bible_study: 'bible_study_groups',
  team: 'teams',
};

export default function GroupChatScreen({ route }: { route: { params: ChatParams } }) {
  const { kind, groupId } = route.params;
  const { profile: me, isLeader } = useAuth();
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const listRef = useRef<FlatList>(null);

  const markRead = useCallback(async () => {
    if (!me) return;
    await supabase.from('chat_reads').upsert(
      {
        person_id: me.id,
        group_type: kind,
        group_id: groupId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'person_id,group_type,group_id' },
    );
  }, [me, kind, groupId]);

  const loadNames = useCallback(async (ids: string[]) => {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    if (data) {
      setNames((n) => {
        const next = { ...n };
        (data as { id: string; full_name: string }[]).forEach((p) => {
          next[p.id] = p.full_name;
        });
        return next;
      });
    }
  }, []);

  const load = useCallback(async () => {
    const [{ data }, { data: g }] = await Promise.all([
      supabase
        .from('group_messages')
        .select('id, sender_id, content, created_at')
        .eq('group_type', kind)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from(GROUP_TABLE[kind]).select('chat_locked').eq('id', groupId).single(),
    ]);
    const msgs = ((data as Message[]) ?? []).reverse();
    setMessages(msgs);
    setLocked(!!(g as { chat_locked?: boolean } | null)?.chat_locked);
    loadNames([...new Set(msgs.map((m) => m.sender_id))]);
    markRead();
  }, [kind, groupId, loadNames, markRead]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`chat-${kind}-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const m = payload.new as Message & { group_type: string };
          if (m.group_type !== kind) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          loadNames([m.sender_id]);
          markRead();
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'group_messages',
        },
        (payload) => {
          const oldId = (payload.old as { id?: string })?.id;
          if (oldId) setMessages((prev) => prev.filter((x) => x.id !== oldId));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, groupId]);

  async function send() {
    const content = text.trim();
    if (!content || !me) return;
    setSending(true);
    setText('');
    const { error } = await supabase.from('group_messages').insert({
      group_type: kind,
      group_id: groupId,
      sender_id: me.id,
      content,
    });
    setSending(false);
    if (error) {
      notify(
        t('chat_not_sent'),
        error.message.includes('policy') ? t('chat_locked_or_not_member') : error.message,
      );
      setText(content);
    }
  }

  function onLongPressMessage(m: Message) {
    if (m.sender_id !== me?.id && !isLeader) return;
    confirmDialog(t('chat_delete_title'), `"${m.content.slice(0, 80)}"`, t('chat_delete'), async () => {
      const { error } = await supabase.from('group_messages').delete().eq('id', m.id);
      if (error) notify('Error', error.message);
      else setMessages((prev) => prev.filter((x) => x.id !== m.id));
    });
  }

  async function toggleLock() {
    const { error } = await supabase
      .from(GROUP_TABLE[kind])
      .update({ chat_locked: !locked })
      .eq('id', groupId);
    if (error) notify('Error', error.message);
    else setLocked(!locked);
  }

  const canPost = !locked || isLeader;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {(locked || isLeader) && (
        <View style={styles.lockBar}>
          <Text style={{ color: locked ? colors.warning : colors.muted, fontSize: 12, flex: 1 }}>
            {locked ? `🔒 ${t('chat_locked_banner')}` : `🔓 ${t('chat_open_banner')}`}
          </Text>
          {isLeader && (
            <TouchableOpacity onPress={toggleLock}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                {locked ? t('chat_unlock') : t('chat_lock')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.empty}>{t('chat_empty')}</Text>}
        renderItem={({ item, index }) => {
          const mine = item.sender_id === me?.id;
          const prev = messages[index - 1];
          const showName = !mine && (!prev || prev.sender_id !== item.sender_id);
          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onLongPress={() => onLongPressMessage(item)}
              style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}
            >
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {showName && <Text style={styles.sender}>{names[item.sender_id] ?? '…'}</Text>}
                <Text style={{ color: mine ? '#fff' : colors.text, fontSize: 15 }}>
                  {item.content}
                </Text>
                <Text style={[styles.time, { color: mine ? '#ffffff99' : colors.muted }]}>
                  {new Date(item.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, !canPost && { opacity: 0.5 }]}
          value={text}
          onChangeText={setText}
          placeholder={canPost ? t('chat_placeholder') : t('chat_locked_placeholder')}
          placeholderTextColor={colors.muted}
          multiline
          editable={canPost}
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending || !canPost) && { opacity: 0.4 }]}
          onPress={send}
          disabled={!text.trim() || sending || !canPost}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('chat_send')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  lockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  sender: { fontSize: 11, fontWeight: '700', color: colors.primaryLight, marginBottom: 2 },
  time: { fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 110,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
});
