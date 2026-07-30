import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Card, StatusBadge } from '@/components/ui';
import { colors, font } from '@/theme';

/**
 * Digital member card — a QR badge leaders scan at check-in.
 * Payload format: cc:person:<profile uuid>
 */
export default function MemberCardScreen() {
  const { profile } = useAuth();
  if (!profile) return null;

  const payload = `cc:person:${profile.id}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(payload)}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.primary }} contentContainerStyle={styles.wrap}>
      <Card style={{ alignItems: 'center', paddingVertical: 28, width: '100%' }}>
        <Text style={{ fontSize: 32 }}>⛪</Text>
        <Text style={styles.church}>IEEC YA · Church Connect</Text>
        <Text style={styles.name}>{profile.full_name}</Text>
        <View style={{ marginVertical: 8 }}>
          <StatusBadge status={profile.status} />
        </View>
        <View style={styles.qrBox}>
          <Image source={{ uri: qr }} style={{ width: 240, height: 240 }} />
        </View>
        <Text style={styles.hint}>Show this at check-in — a leader scans it to mark you present.</Text>
        {profile.member_since ? (
          <Text style={styles.since}>Member since {profile.member_since}</Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  church: { color: colors.muted, fontSize: 12, marginTop: 4, letterSpacing: 1 },
  name: { fontSize: 24, fontFamily: font.bold, color: colors.text, marginTop: 8 },
  qrBox: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12, paddingHorizontal: 20 },
  since: { color: colors.muted, fontSize: 12, marginTop: 6 },
});
