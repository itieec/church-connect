import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { Field, Button } from '@/components/ui';
import { colors } from '@/theme';
import { AuthStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signUp() {
    const cleanEmail = email.trim().toLowerCase();
    if (!fullName.trim() || !cleanEmail || password.length < 6) {
      notify('Missing info', 'Name, email and a password of 6+ characters are required.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (!error && data.user && phone.trim()) {
      await supabase.from('profiles').update({ phone: phone.trim() }).eq('id', data.user.id);
    }
    setLoading(false);
    if (error) {
      notify('Sign up failed', error.message);
    } else if (!data.session) {
      notify(
        'Check your email',
        'We sent you a confirmation link. Click it, then sign in — an admin will approve your account shortly after.',
      );
      navigation.navigate('SignIn');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
      <Text style={styles.title}>Welcome!</Text>
      <Text style={styles.subtitle}>We're glad you're here. Create your account.</Text>
      <View style={{ marginTop: 24 }}>
        <Field label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Full name" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+1 ..."
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="6+ characters"
        />
        <Button title="Create Account" onPress={signUp} loading={loading} />
        <Text style={styles.link} onPress={() => navigation.navigate('SignIn')}>
          Already have an account? Sign in
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 4 },
  link: { textAlign: 'center', color: colors.primary, marginTop: 20, fontWeight: '600' },
});
