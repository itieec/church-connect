import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/lib/i18n';
import { Screen, ListSection, ListRow } from '@/components/ui';
import { MoreStackParamList } from '@/navigation';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreHome'>;

export default function MoreScreen({ navigation }: Props) {
  const { isLeader, profile } = useAuth();
  const { t } = useI18n();
  const canRecord = isLeader || profile?.role === 'minister';
  const isAdmin = !!profile && ['super_admin', 'admin', 'main_leader'].includes(profile.role);

  type Item = {
    icon: string;
    label: string;
    sub: string;
    target: keyof MoreStackParamList;
    show: boolean;
  };

  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'Community',
      items: [
        { icon: '📢', label: t('more_announcements'), sub: 'Church news and updates', target: 'Announcements', show: true },
        { icon: '🗓', label: t('more_events'), sub: 'Upcoming events · RSVP', target: 'Events', show: true },
        { icon: '🙏', label: t('more_prayer'), sub: 'Submit and pray for requests', target: 'Prayer', show: true },
        { icon: '🤝', label: t('more_one_to_one'), sub: 'Counseling, prayer, or mentorship time', target: 'Appointments', show: true },
      ],
    },
    {
      title: 'Serving',
      items: [
        { icon: '🛠', label: t('more_teams'), sub: 'Teams, chat, serving schedule', target: 'Teams', show: true },
        { icon: '💵', label: t('more_contributions'), sub: 'Monthly giving records', target: 'Contributions', show: true },
      ],
    },
    {
      title: 'Leadership',
      items: [
        { icon: '🗓', label: t('more_attendance'), sub: 'Record who came to service', target: 'Attendance', show: canRecord },
        { icon: '📷', label: t('more_checkin'), sub: 'Scan member cards at the door', target: 'CheckIn', show: canRecord },
        { icon: '📊', label: t('more_reports'), sub: 'Weekly digest, growth, attendance', target: 'Reports', show: isLeader },
        { icon: '🔳', label: t('more_registration_qr'), sub: 'QR for newcomer self-registration', target: 'RegistrationQR', show: isLeader },
        { icon: '🛡', label: t('more_admin'), sub: 'Users, roles, audit log, teams', target: 'Admin', show: isAdmin },
      ],
    },
    {
      title: 'Me',
      items: [
        { icon: '🪪', label: t('more_member_card'), sub: 'Your QR badge for check-in', target: 'MemberCard', show: true },
        { icon: '👤', label: t('more_profile'), sub: 'Your info, language, sign out', target: 'ProfileScreen', show: true },
      ],
    },
  ];

  return (
    <Screen>
      {sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <ListSection key={s.title} title={s.title}>
            {s.items.map((i) => (
              <ListRow
                key={i.label}
                icon={i.icon}
                label={i.label}
                sublabel={i.sub}
                onPress={() => navigation.navigate(i.target as any)}
              />
            ))}
          </ListSection>
        ))}
    </Screen>
  );
}
