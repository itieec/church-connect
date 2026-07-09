import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';
import { MoreStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreHome'>;

export default function MoreScreen({ navigation }: Props) {
  const { isLeader, profile } = useAuth();
  const { t } = useI18n();
  const canRecord = isLeader || profile?.role === 'minister';
  const isAdmin = !!profile && ['super_admin', 'admin', 'main_leader'].includes(profile.role);

  type Item = { icon: string; label: string; sub: string; target: keyof MoreStackParamList; show: boolean };
  const sections: { title: string; items: Item[] }[] = [
    {
      title: '⛪ Community',
      items: [
        { icon: '📢', label: t('more_announcements'), sub: 'Church news and updates', target: 'Announcements', show: true },
        { icon: '🗓', label: t('more_events'), sub: 'Upcoming events · RSVP', target: 'Events', show: true },
        { icon: '🙏', label: t('more_prayer'), sub: 'Submit and pray for requests', target: 'Prayer', show: true },
        { icon: '🤝', label: t('more_one_to_one'), sub: 'Counseling, prayer, or mentorship time', target: 'Appointments', show: true },
      ],
    },
    {
      title: '🛠 Serving',
      items: [
        { icon: '🛠', label: t('more_teams'), sub: 'Teams, chat, serving schedule', target: 'Teams', show: true },
        { icon: '💵', label: t('more_contributions'), sub: 'Monthly giving records', target: 'Contributions', show: true },
      ],
    },
    {
      title: '📋 Leadership',
      items: [
        { icon: '🗓', label: t('more_attendance'), sub: 'Record who came to service', target: 'Attendance', show: canRecord },
        { icon: '📷', label: t('more_checkin'), sub: 'Scan member cards at the door', target: 'CheckIn', show: canRecord },
        { icon: '📊', label: t('more_reports'), sub: 'Weekly digest, growth, attendance', target: 'Reports', show: isLeader },
        { icon: '🔳', label: t('more_registration_qr'), sub: 'QR for newcomer self-registration', target: 'RegistrationQR', show: isLeader },
        { icon: '🛡', label: t('more_admin'), sub: 'Users, roles, audit log, teams', target: 'Admin', show: isAdmin },
      ],
    },
    {
      title: '👤 Me',
      items: [
        { icon: '🪪', label: t('more_member_card'), sub: 'Your QR badge for check-in', target: 'MemberCard', show: true },
        { icon: '👤', label: t('more_profile'), sub: 'Your info, language, sign out', target: 'ProfileScreen', show: true },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {sections
        .filter((s) => s.items.some((i) => i.show))
        .map((s) => (
          <View key={s.title}>
            <Text style={styles.sectionHeader}>{s.title}</Text>
            {s.items
              .filter((i) => i.show)
              .map((i) => (
                <TouchableOpacity
                  key={i.label}
                  style={styles.row}
                  onPress={() => navigation.navigate(i.target as any)}
                >
                  <Text style={{ fontSize: 24 }}>{i.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{i.label}</Text>
                    <Text style={styles.sub}>{i.sub}</Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
                </TouchableOpacity>
              ))}
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
