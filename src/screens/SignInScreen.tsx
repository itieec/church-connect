import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useI18n } from '@/lib/i18n';
import { Field, Button } from '@/components/ui';
import { colors } from '@/theme';
import { AuthStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export default function SignInScreen({ navigation }: Props) {
  const { lang, setLang, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      notify('Missing info', 'Enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    setLoading(false);
    if (error) {
      const msg =
        error.message === 'Email not confirmed'
          ? 'Check your inbox and click the confirmation link first, then sign in again.'
          : error.message;
      notify('Sign in failed', msg);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>⛪</Text>
        <Text style={styles.title}>Church Connect</Text>
        <Text style={styles.subtitle}>IEEC YA Ministry System</Text>
      </View>
      <View style={styles.form}>
        <Text
          style={styles.langToggle}
          onPress={() => setLang(lang === 'en' ? 'am' : 'en')}
        >
          🌍 {lang === 'en' ? 'አማርኛ' : 'English'}
        </Text>
        <Field
          label={t('email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />
        <Button title={t('sign_in')} onPress={signIn} loading={loading} />
        <Button
          title="Register as Newcomer →"
          variant="outline"
          onPress={() => navigation.navigate('PublicRegister')}
        />
        <Text style={styles.link} onPress={() => navigation.navigate('SignUp')}>
          {t('new_here')}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  header: { alignItems: 'center', paddingTop: 100, paddingBottom: 40 },
  logo: { fontSize: 56 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginTop: 8 },
  subtitle: { fontSize: 14, color: '#c7d2fe', marginTop: 4 },
  form: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  link: { textAlign: 'center', color: colors.primary, marginTop: 20, fontWeight: '600' },
  langToggle: {
    textAlign: 'right',
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 8,
    fontSize: 13,
  },
});
