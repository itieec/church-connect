import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { Screen, Field, Button, SegmentedControl } from '@/components/ui';
import { colors, type, spacing, radius, shadow } from '@/theme';

// Labels stay short so three segments fit a 375pt screen without clipping.
const SEX_OPTIONS = [
  ['male', 'Male'],
  ['female', 'Female'],
  ['prefer_not_to_say', 'Not specified'],
] as const;

type Sex = (typeof SEX_OPTIONS)[number][0];

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
        sex,
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
      <View style={styles.doneWrap}>
        <Text style={styles.doneMark}>🕊</Text>
        <Text style={styles.doneTitle}>Welcome, {firstName.trim()}</Text>
        <Text style={styles.doneText}>
          We're glad you're here. Someone from the follow-up team will reach out to you this week.
        </Text>
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.mark}>⛪</Text>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>
          Tell us a little about yourself so we can get in touch.
        </Text>
      </View>

      {/* Required details, grouped so the form reads as one object. */}
      <View style={styles.group}>
        <Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+1 202 555 0147"
          hint="Phone or email — whichever is easier to reach you on."
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          containerStyle={{ marginBottom: 0 }}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Sex</Text>
        <SegmentedControl
          options={SEX_OPTIONS}
          value={(sex ?? '') as Sex}
          onChange={setSex}
        />
      </View>

      {/* Everything below is optional, kept in its own group to say so. */}
      <View style={styles.group}>
        <Field
          label="Date of birth"
          value={dob}
          onChangeText={setDob}
          placeholder="1998-01-15"
          hint="Optional"
        />
        <Field
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="123 Main St, Washington DC"
          hint="Optional"
        />
        <Field label="First visit" value={firstVisit} onChangeText={setFirstVisit} placeholder="2026-07-04" />
        <Field
          label="Prayer request or note"
          value={prayerRequest}
          onChangeText={setPrayerRequest}
          multiline
          placeholder="Anything you'd like us to pray about?"
          containerStyle={{ marginBottom: 0 }}
        />
      </View>

      <Button title="Submit" onPress={register} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.xl, marginTop: spacing.lg },
  mark: { fontSize: 40 },
  title: { ...type.largeTitle, color: colors.text, marginTop: spacing.sm },
  subtitle: {
    ...type.subhead,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 280,
  },
  group: {
    backgroundColor: colors.rowBg,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow(1),
  },
  label: { ...type.footnote, color: colors.muted, marginBottom: spacing.sm },

  doneWrap: {
    flex: 1,
    backgroundColor: colors.groupedBg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  doneMark: { fontSize: 52 },
  doneTitle: { ...type.title, color: colors.text, marginTop: spacing.lg, textAlign: 'center' },
  doneText: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 300,
  },
});
