import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useI18n } from '@/lib/i18n';
import { Field, Button } from '@/components/ui';
import { colors, type, font, familyFor, spacing, radius, shadow, isIOS } from '@/theme';
import { AuthStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export default function SignInScreen({ navigation }: Props) {
  const { lang, setLang, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const nextLangLabel = lang === 'en' ? 'አማርኛ' : 'English';

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
          style={[styles.langToggle, { fontFamily: familyFor(nextLangLabel, 'semibold') }]}
          onPress={() => setLang(lang === 'en' ? 'am' : 'en')}
        >
          🌍 {nextLangLabel}
        </Text>

        {/* Inputs sit in one grouped container — the native form pattern. */}
        <View style={styles.fieldGroup}>
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
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        <Button title={t('sign_in')} onPress={signIn} loading={loading} />
        <Button
          title="Register as Newcomer"
          variant="tinted"
          onPress={() => navigation.navigate('PublicRegister')}
          style={{ marginTop: spacing.md }}
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
  header: { alignItems: 'center', paddingTop: 88, paddingBottom: spacing.xxl },
  logo: { fontSize: 52 },
  title: {
    ...type.largeTitle,
    color: colors.white,
    marginTop: spacing.md,
  },
  subtitle: {
    ...type.subhead,
    color: '#c7d2fe',
    marginTop: spacing.xs,
  },
  form: {
    flex: 1,
    backgroundColor: colors.groupedBg,
    borderTopLeftRadius: isIOS ? 12 : 28,
    borderTopRightRadius: isIOS ? 12 : 28,
    padding: spacing.xl,
  },
  fieldGroup: {
    backgroundColor: colors.rowBg,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow(1),
  },
  link: {
    ...type.callout,
    fontFamily: font.semibold,
    textAlign: 'center',
    color: colors.primary,
    marginTop: spacing.xl,
  },
  langToggle: {
    ...type.footnote,
    textAlign: 'right',
    color: colors.primary,
    marginBottom: spacing.md,
  },
});
