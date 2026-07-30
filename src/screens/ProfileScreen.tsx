import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Modal, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { notify, confirmDialog } from '@/lib/notify';
import { useI18n } from '@/lib/i18n';
import { Card, Button, StatusBadge, Field } from '@/components/ui';
import { colors, font } from '@/theme';

const AGE_GROUPS = ['18-24', '25-30', '31-35', '36+'];

export default function ProfileScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { lang, setLang, t } = useI18n();
  const [showEdit, setShowEdit] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);
  const [dob, setDob] = useState('');
  const [salvation, setSalvation] = useState('');
  const [saving, setSaving] = useState(false);
  const [growth, setGrowth] = useState<{ label: string; done: boolean }[]>([]);

  const loadGrowth = useCallback(async () => {
    if (!profile) return;
    const [g5, bs, tm, tr] = await Promise.all([
      supabase.from('g5_members').select('id').eq('person_id', profile.id).limit(1),
      supabase.from('bible_study_members').select('id').eq('person_id', profile.id).limit(1),
      supabase.from('team_members').select('id').eq('person_id', profile.id).limit(1),
      supabase.from('training_progress').select('id').eq('person_id', profile.id),
    ]);
    const isMember = ['member', 'minister'].includes(profile.status);
    setGrowth([
      { label: 'Newcomer', done: true },
      { label: 'Followed up', done: profile.status !== 'newcomer' },
      { label: 'Member', done: isMember },
      { label: 'Baptized', done: profile.baptized },
      { label: 'In Bible Study', done: ((bs.data as unknown[]) ?? []).length > 0 },
      { label: 'In G5 Group', done: ((g5.data as unknown[]) ?? []).length > 0 },
      { label: 'Serving', done: ((tm.data as unknown[]) ?? []).length > 0 },
      { label: 'Leadership training', done: ((tr.data as unknown[]) ?? []).length >= 5 },
      { label: 'Minister', done: profile.role === 'minister' || profile.status === 'minister' },
    ]);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      loadGrowth();
    }, [loadGrowth]),
  );

  if (!profile) return null;

  function base64ToBytes(b64: string): Uint8Array {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
    const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let p = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const a = chars.indexOf(clean[i]);
      const b = chars.indexOf(clean[i + 1]);
      const c = chars.indexOf(clean[i + 2]);
      const d = chars.indexOf(clean[i + 3]);
      bytes[p++] = (a << 2) | (b >> 4);
      if (c >= 0) bytes[p++] = ((b & 15) << 4) | (c >> 2);
      if (d >= 0) bytes[p++] = ((c & 3) << 6) | d;
    }
    return bytes.slice(0, p);
  }

  async function changePhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const path = `${profile!.id}.jpg`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, base64ToBytes(res.assets[0].base64), {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) {
      notify('Upload failed', error.message);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from('profiles').update({ photo_url: url }).eq('id', profile!.id);
    refreshProfile();
  }

  function deleteAccount() {
    confirmDialog(
      'Delete account?',
      'This permanently removes your account, profile, group memberships, and messages. This cannot be undone.',
      'Continue',
      () => {
        confirmDialog(
          'Are you absolutely sure?',
          'Last chance — your account will be deleted forever.',
          'Delete Forever',
          async () => {
            const { error } = await supabase.rpc('delete_my_account');
            if (error) {
              notify('Could not delete', error.message);
            } else {
              notify('Account deleted', 'We’re sorry to see you go. God bless!');
              await signOut();
            }
          },
        );
      },
    );
  }

  function openEdit() {
    setPhone(profile?.phone ?? '');
    setAddress(profile?.address ?? '');
    setGender(profile?.gender ?? null);
    setAgeGroup(profile?.age_group ?? null);
    setDob(profile?.date_of_birth ?? '');
    setSalvation(profile?.salvation_date ?? '');
    setShowEdit(true);
  }

  async function save() {
    for (const [label, v] of [['Birthday', dob], ['Salvation date', salvation]] as const) {
      if (v.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        notify('Invalid date', `${label} must be YYYY-MM-DD.`);
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        phone: phone.trim() || null,
        address: address.trim() || null,
        gender,
        age_group: ageGroup,
        date_of_birth: dob.trim() || null,
        salvation_date: salvation.trim() || null,
      })
      .eq('id', profile!.id);
    setSaving(false);
    if (error) notify('Error', error.message);
    else {
      setShowEdit(false);
      refreshProfile();
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        <TouchableOpacity onPress={changePhoto}>
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={{ color: '#fff', fontSize: 32, fontFamily: font.bold }}>
                {profile.full_name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={{ color: colors.primary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
            {profile.photo_url ? 'change photo' : 'add photo'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.name}>{profile.full_name}</Text>
        <View style={{ marginTop: 8 }}>
          <StatusBadge status={profile.status} />
        </View>
      </Card>

      <Card>
        <Row label="Role" value={profile.role.replace('_', ' ')} />
        <Row label="Email" value={profile.email ?? '—'} />
        <Row label="Phone" value={profile.phone ?? '—'} />
        <Row label="Address" value={profile.address ?? '—'} />
        <Row label="Gender" value={profile.gender ?? '—'} />
        <Row label="Age Group" value={profile.age_group ?? '—'} />
        <Row label="Birthday" value={profile.date_of_birth ?? '—'} />
        <Row label="Salvation Date" value={profile.salvation_date ?? '—'} />
        <Row label="Baptized" value={profile.baptized ? `Yes${profile.baptism_date ? ` (${profile.baptism_date})` : ''}` : 'Not yet'} />
        <Row label="First Visit" value={profile.first_visit_date ?? '—'} />
        <Row label="Member Since" value={profile.member_since ?? '—'} />
      </Card>

      {growth.length > 0 && (
        <Card>
          <Text style={{ fontSize: 16, fontFamily: font.bold, color: colors.text, marginBottom: 10 }}>
            My Growth Path
          </Text>
          <View style={styles.growthWrap}>
            {growth.map((g) => (
              <View key={g.label} style={[styles.growthChip, g.done && styles.growthChipDone]}>
                <Text style={{ fontSize: 12, color: g.done ? '#fff' : colors.muted }}>
                  {g.done ? '✓ ' : ''}
                  {g.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: font.bold, color: colors.text }}>🌍 {t('language')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['en', 'English'],
                ['am', 'አማርኛ'],
              ] as const
            ).map(([code, label]) => (
              <TouchableOpacity
                key={code}
                onPress={() => setLang(code)}
                style={[styles.pill, lang === code && styles.pillActive]}
              >
                <Text style={{ color: lang === code ? '#fff' : colors.text }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      <Button title="Edit My Info" variant="outline" onPress={openEdit} />
      <View style={{ height: 8 }} />
      <Button title={t('sign_out')} variant="danger" onPress={signOut} />
      <TouchableOpacity onPress={deleteAccount} style={{ marginTop: 20, alignItems: 'center' }}>
        <Text style={{ color: colors.danger, fontSize: 13 }}>Delete my account permanently</Text>
      </TouchableOpacity>

      <Modal visible={showEdit} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit My Info</Text>
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Address" value={address} onChangeText={setAddress} />
            <Field label="Birthday (YYYY-MM-DD)" value={dob} onChangeText={setDob} placeholder="2000-05-18" />
            <Field label="Salvation Date (YYYY-MM-DD)" value={salvation} onChangeText={setSalvation} placeholder="2020-01-01" />
            <Text style={styles.label}>Gender</Text>
            <View style={styles.pillRow}>
              {(['male', 'female'] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGender(g)}
                  style={[styles.pill, gender === g && styles.pillActive]}
                >
                  <Text style={{ color: gender === g ? '#fff' : colors.text }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Age Group</Text>
            <View style={styles.pillRow}>
              {AGE_GROUPS.map((a) => (
                <TouchableOpacity
                  key={a}
                  onPress={() => setAgeGroup(a)}
                  style={[styles.pill, ageGroup === a && styles.pillActive]}
                >
                  <Text style={{ color: ageGroup === a ? '#fff' : colors.text }}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title="Save" onPress={save} loading={saving} />
            <Button title="Cancel" variant="outline" onPress={() => setShowEdit(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  name: { fontSize: 22, fontFamily: font.bold, color: colors.text },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.muted, fontFamily: font.semibold },
  rowValue: { color: colors.text, textTransform: 'capitalize' },
  label: { fontSize: 13, fontFamily: font.semibold, color: colors.muted, marginBottom: 6, marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  growthWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  growthChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  growthChipDone: { backgroundColor: colors.success, borderColor: colors.success },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 4,
  },
  modalTitle: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginBottom: 12 },
});
