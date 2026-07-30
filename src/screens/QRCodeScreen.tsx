import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Image, Platform } from 'react-native';
import Constants from 'expo-constants';
import { Card, Field } from '@/components/ui';
import { colors, font } from '@/theme';

function defaultUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { publicRegistrationUrl?: string };
  if (extra.publicRegistrationUrl && !extra.publicRegistrationUrl.startsWith('YOUR_')) {
    return extra.publicRegistrationUrl;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/register`;
  }
  return '';
}

/**
 * Shows a QR code that opens the public newcomer self-registration form.
 * Print it or display it on a screen at the Saturday program.
 */
export default function QRCodeScreen() {
  const [url, setUrl] = useState(defaultUrl());

  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(url)}`
    : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={styles.title}>Newcomer Registration QR</Text>
        <Text style={styles.meta}>
          Newcomers scan this with their phone camera and register themselves — no account needed.
          They're auto-assigned to a Follow Up team member.
        </Text>
      </Card>

      <Field
        label="Registration form URL"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        placeholder="https://your-app.vercel.app/register"
      />

      {qrSrc ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Image source={{ uri: qrSrc }} style={{ width: 260, height: 260 }} />
          <Text style={[styles.meta, { marginTop: 12, textAlign: 'center' }]}>{url}</Text>
        </Card>
      ) : (
        <Card>
          <Text style={styles.meta}>
            Enter the URL where the app is hosted to generate the QR code. While testing on your
            own Wi-Fi, you can use the Metro URL, e.g. http://192.168.1.225:8081/register — for
            the Saturday program, host the web app publicly (e.g. Vercel) and set
            "publicRegistrationUrl" in app.json.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginBottom: 6 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
