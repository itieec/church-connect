import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { Field, Button } from '@/components/ui';
import { colors } from '@/theme';

const SEX_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;
type Sex = (typeof SEX_OPTIONS)[number];

export default function PublicRegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [firstVisit, setFirstVisit] = useState(new Date().toISOString().slice(0, 10));
  const [prayerRequest, setPrayerRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function register() {
    if (!firstName.trim() || !lastName.trim()) {
      notify('Missing name', 'Please enter your first and last name.');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      notify('Contact needed', 'Please provide a phone number or email so we can reach you.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('newcomers').insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase() || null,
        phone: phone.trim() || null,
        sex: sex === 'Prefer not to say' ? 'prefer_not_to_say' : sex?.toLowerCase() ?? null,
        date_of_birth: dob.trim() || null,
        address: address.trim() || null,
        first_visit_date: firstVisit || new Date().toISOString().slice(0, 10),
        prayer_request: prayerRequest.trim() || null,
        status: 'new',
      });
      if (error) { notify('Something went wrong', error.message); return; }

      // Leaders are alerted and the 48h assignment clock starts in the
      // newcomers_notify_leaders trigger, so every registration path behaves
      // identically and anonymous visitors need no write access to notifications.
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 56 }}>🎉</Text>
        <Text style={styles.doneTitle}>Welcome, {firstName.trim()}!</Text>
        <Text style={styles.doneText}>
          We're so glad you're here. Someone from our Follow-Up team will reach out to you this week.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text style={{ fontSize: 40, textAlign: 'center' }}>⛪</Text>
      <Text style={styles.title}>Welcome!</Text>
      <Text style={styles.subtitle}>We're glad you're here. Tell us a little about yourself.</Text>

      <View style={{ marginTop: 24 }}>
        <Field label="First Name *" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <Field label="Last Name *" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <Field
          label="Phone Number *"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+1 ..."
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />

        <Text style={styles.label}>Sex</Text>
        <View style={styles.row}>
          {SEX_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSex(s)}
              style={[styles.pill, sex === s && styles.pillActive]}
            >
              <Text style={{ color: sex === s ? '#fff' : colors.text }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field
          label="Date of Birth (YYYY-MM-DD, optional)"
          value={dob}
          onChangeText={setDob}
          placeholder="1998-01-15"
        />
        <Field
          label="Address (optional)"
          value={address}
          onChangeText={setAddress}
          placeholder="123 Main St, Washington DC"
        />
        <Field
          label="First Visit Date"
          value={firstVisit}
          onChangeText={setFirstVisit}
          placeholder="2026-07-04"
        />
        <Field
          label="Prayer Request / Note (optional)"
          value={prayerRequest}
          onChangeText={setPrayerRequest}
          multiline
          placeholder="Anything you'd like us to pray about or know?"
        />

        <Button title="Submit" onPress={register} loading={loading} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  doneTitle: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 12 },
  doneText: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
