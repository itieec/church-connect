import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button, Card } from '@/components/ui';
import { colors, font } from '@/theme';

/**
 * Shown after sign-in until an admin approves the account.
 * Listens in realtime (plus a 15s poll) and lets the user straight in
 * the moment they're approved.
 */
export default function PendingApprovalScreen() {
  const { profile, signOut, refreshProfile } = useAuth();

  useEffect(() => {
    const iv = setInterval(refreshProfile, 15000);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (profile) {
      channel = supabase
        .channel(`approval-${profile.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${profile.id}`,
          },
          () => refreshProfile(),
        )
        .subscribe();
    }
    return () => {
      clearInterval(iv);
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile, refreshProfile]);

  return (
    <View style={styles.container}>
      <Card style={{ alignItems: 'center', padding: 32, maxWidth: 420, width: '90%' }}>
        <Text style={{ fontSize: 56 }}>⏳</Text>
        <Text style={styles.title}>Waiting for approval</Text>
        <Text style={styles.body}>
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}! Your account was created
          successfully. An admin needs to approve it before you can enter the app — this usually
          happens quickly.
        </Text>
        <Text style={[styles.body, { marginTop: 8 }]}>
          This page will unlock automatically the moment you're approved, and you'll get a
          notification.
        </Text>
        <View style={{ marginTop: 20, width: '100%', gap: 8 }}>
          <Button title="Check again" variant="outline" onPress={refreshProfile} />
          <Button title="Sign Out" variant="danger" onPress={signOut} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: { fontSize: 22, fontFamily: font.bold, color: colors.text, marginTop: 10 },
  body: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
