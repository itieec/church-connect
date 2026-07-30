import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button, Card } from '@/components/ui';
import { colors, font } from '@/theme';

const SERVICE_TYPES = ['saturday_program', 'sunday_service', 'bible_study', 'g5', 'other'] as const;

/**
 * Leaders scan members' digital member cards (QR payload "cc:person:<uuid>")
 * to record attendance instantly.
 */
export default function CheckInScreen() {
  const { profile: me } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [serviceType, setServiceType] = useState<(typeof SERVICE_TYPES)[number]>('saturday_program');
  const [lastResult, setLastResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [count, setCount] = useState(0);
  const busyRef = useRef(false);
  const recentRef = useRef<Set<string>>(new Set());

  const onScan = useCallback(
    async ({ data }: { data: string }) => {
      if (busyRef.current) return;
      if (!data.startsWith('cc:person:')) return;
      const personId = data.slice('cc:person:'.length);
      if (recentRef.current.has(personId)) return; // already checked in this session
      busyRef.current = true;
      try {
        const { data: person } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', personId)
          .single();
        if (!person) {
          setLastResult({ ok: false, text: 'Unknown member card.' });
          return;
        }
        const { error } = await supabase.from('attendance').upsert(
          {
            person_id: personId,
            service_date: new Date().toISOString().slice(0, 10),
            service_type: serviceType,
            present: true,
            recorded_by: me?.id ?? null,
          },
          { onConflict: 'person_id,service_date,service_type' },
        );
        if (error) {
          setLastResult({ ok: false, text: error.message });
        } else {
          recentRef.current.add(personId);
          setCount((c) => c + 1);
          setLastResult({ ok: true, text: `✓ ${(person as { full_name: string }).full_name} checked in` });
        }
      } finally {
        setTimeout(() => {
          busyRef.current = false;
        }, 1200);
      }
    },
    [serviceType, me?.id],
  );

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { padding: 24 }]}>
        <Card>
          <Text style={styles.title}>QR Check-In</Text>
          <Text style={styles.meta}>
            Camera scanning works in the mobile app (Expo Go / dev build). Open Church Connect on
            your phone, go to More → QR Check-In, and scan members' digital cards as they arrive.
            You can still record attendance manually here via More → Attendance.
          </Text>
        </Card>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={[styles.container, { padding: 24, justifyContent: 'center' }]}>
        <Card>
          <Text style={styles.title}>Camera permission needed</Text>
          <Text style={[styles.meta, { marginBottom: 12 }]}>
            To scan member cards, allow camera access.
          </Text>
          <Button title="Allow Camera" onPress={requestPermission} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pillRow}>
        {SERVICE_TYPES.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setServiceType(s)}
            style={[styles.pill, serviceType === s && styles.pillActive]}
          >
            <Text style={{ color: serviceType === s ? '#fff' : colors.text, fontSize: 11 }}>
              {s.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.cameraWrap}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
        <View style={styles.frame} pointerEvents="none" />
      </View>

      <View style={styles.footer}>
        {lastResult && (
          <Text
            style={{
              color: lastResult.ok ? colors.success : colors.danger,
              fontFamily: font.bold,
              fontSize: 16,
              textAlign: 'center',
            }}
          >
            {lastResult.text}
          </Text>
        )}
        <Text style={styles.counter}>{count} checked in this session</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginBottom: 6 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  cameraWrap: { flex: 1, margin: 12, borderRadius: 16, overflow: 'hidden' },
  frame: {
    position: 'absolute',
    top: '25%',
    left: '15%',
    right: '15%',
    bottom: '25%',
    borderWidth: 3,
    borderColor: '#ffffffaa',
    borderRadius: 16,
  },
  footer: { padding: 16, paddingBottom: 24 },
  counter: { textAlign: 'center', color: colors.muted, marginTop: 6, fontSize: 13 },
});
