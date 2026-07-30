import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet, View, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { Field, Button } from '@/components/ui';
import { colors, font } from '@/theme';
import { FollowUpStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<FollowUpStackParamList, 'NewcomerRegistration'>;

const SEX_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;

export default function NewcomerRegistrationScreen({ navigation }: Props) {
  const { profile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sex, setSex] = useState<string | null>(null);
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [firstVisit, setFirstVisit] = useState(new Date().toISOString().slice(0, 10));
  const [prayerRequest, setPrayerRequest] = useState('');
  const [loading, setLoading] = useState(false);

  async function register() {
    if (!firstName.trim() || !lastName.trim()) {
      notify('Missing name', 'First and last name are required.');
      return;
    }
    setLoading(true);
    try {
      const { data: nc, error } = await supabase
        .from('newcomers')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          email: email.trim().toLowerCase() || null,
          sex: sex === 'Prefer not to say' ? 'prefer_not_to_say' : sex?.toLowerCase() ?? null,
          date_of_birth: dob.trim() || null,
          address: address.trim() || null,
          first_visit_date: firstVisit || new Date().toISOString().slice(0, 10),
          prayer_request: prayerRequest.trim() || null,
          status: 'new',
        })
        .select('id')
        .single();

      if (error) { notify('Error', error.message); return; }

      const newcomerId = (nc as { id: string }).id;

      // Auto-assign to the registering leader
      if (profile?.id) {
        await supabase.from('follow_up_assignments').insert({
          newcomer_id: newcomerId,
          assigned_to: profile.id,
          assigned_by: profile.id,
          assigned_at: new Date().toISOString(),
          active: true,
        });
      }

      // Notify all follow-up leaders
      const { data: leaders } = await supabase
        .from('profiles')
        .select('id')
        .in('follow_up_role', ['leader', 'assistant_leader']);
      if (leaders && leaders.length > 0) {
        await supabase.from('notifications').insert(
          (leaders as { id: string }[]).map((l) => ({
            user_id: l.id,
            title: 'New Newcomer Registered',
            message: `New newcomer registered: ${firstName.trim()} ${lastName.trim()}. Please review and assign.`,
            type: 'newcomer_registration',
            read: false,
          })),
        );
      }

      notify('Registered', `${firstName.trim()} ${lastName.trim()} added and assigned to you.`);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.welcome}>Register New Visitor</Text>

      <Field label="First Name *" value={firstName} onChangeText={setFirstName} placeholder="First name" />
      <Field label="Last Name *" value={lastName} onChangeText={setLastName} placeholder="Last name" />
      <Field label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+1 ..." />
      <Field
        label="Email (optional)"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="their@email.com"
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
        placeholder="123 Main St"
      />
      <Field
        label="First Visit Date"
        value={firstVisit}
        onChangeText={setFirstVisit}
        placeholder="2026-07-05"
      />
      <Field
        label="Prayer Request / Notes (optional)"
        value={prayerRequest}
        onChangeText={setPrayerRequest}
        multiline
        placeholder="Any prayer needs or notes..."
      />
      <Button title="Register" onPress={register} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  welcome: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: font.semibold, color: colors.muted, marginBottom: 6 },
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
});
