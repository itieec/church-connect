import React from 'react';
import { View, ActivityIndicator, Text, Platform } from 'react-native';
import {
  NavigationContainer,
  LinkingOptions,
  createNavigationContainerRef,
} from '@react-navigation/native';

/** Root-level navigation ref — guarantees bell/feed navigation lands on the ROOT stack. */
export const navigationRef = createNavigationContainerRef<any>();
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/lib/i18n';
import { useUnread } from '@/lib/useUnread';
import { colors } from '@/theme';
import HeaderBell from '@/components/HeaderBell';

import SignInScreen from '@/screens/SignInScreen';
import SignUpScreen from '@/screens/SignUpScreen';
import HomeScreen from '@/screens/HomeScreen';
import NewcomerRegistrationScreen from '@/screens/NewcomerRegistrationScreen';
import FollowUpListScreen from '@/screens/FollowUpListScreen';
import FollowUpDetailScreen from '@/screens/FollowUpDetailScreen';
import GroupsScreen from '@/screens/GroupsScreen';
import GroupDetailScreen from '@/screens/GroupDetailScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import DirectoryScreen from '@/screens/DirectoryScreen';
import AttendanceScreen from '@/screens/AttendanceScreen';
import TeamsScreen from '@/screens/TeamsScreen';
import TeamDetailScreen from '@/screens/TeamDetailScreen';
import ContributionsScreen from '@/screens/ContributionsScreen';
import AnnouncementsScreen from '@/screens/AnnouncementsScreen';
import MoreScreen from '@/screens/MoreScreen';
import AdminScreen from '@/screens/AdminScreen';
import LeadershipScreen from '@/screens/LeadershipScreen';
import ReportsScreen from '@/screens/ReportsScreen';
import PublicRegisterScreen from '@/screens/PublicRegisterScreen';
import QRCodeScreen from '@/screens/QRCodeScreen';
import EventsScreen from '@/screens/EventsScreen';
import PrayerScreen from '@/screens/PrayerScreen';
import CheckInScreen from '@/screens/CheckInScreen';
import MemberCardScreen from '@/screens/MemberCardScreen';
import GroupChatScreen from '@/screens/GroupChatScreen';
import AppointmentsScreen from '@/screens/AppointmentsScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import PendingApprovalScreen from '@/screens/PendingApprovalScreen';

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  PublicRegister: undefined;
};

// Web deep links: /register opens the public newcomer form (no sign-in).
const authLinking: LinkingOptions<AuthStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      SignIn: '',
      SignUp: 'signup',
      PublicRegister: 'register',
    },
  },
};

export type FollowUpStackParamList = {
  FollowUpList: undefined;
  FollowUpDetail: { newComerId: string };
  NewcomerRegistration: undefined;
};

export type GroupsStackParamList = {
  GroupsHome: undefined;
  GroupDetail: { kind: 'g5' | 'bible_study'; groupId: string };
  GroupChat: { kind: 'g5' | 'bible_study' | 'team'; groupId: string; groupName: string };
};

export type MoreStackParamList = {
  MoreHome: undefined;
  Announcements: undefined;
  Attendance: undefined;
  Teams: undefined;
  TeamDetail: { teamId: string };
  Leadership: undefined;
  Contributions: undefined;
  Reports: undefined;
  Admin: undefined;
  RegistrationQR: undefined;
  Events: undefined;
  Prayer: undefined;
  CheckIn: undefined;
  MemberCard: undefined;
  Appointments: undefined;
  TeamChat: { kind: 'g5' | 'bible_study' | 'team'; groupId: string; groupName: string };
  ProfileScreen: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const FUStack = createNativeStackNavigator<FollowUpStackParamList>();
const GStack = createNativeStackNavigator<GroupsStackParamList>();
const MStack = createNativeStackNavigator<MoreStackParamList>();
const EStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const headerStyle = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: '#fff',
  headerRight: () => <HeaderBell />,
} as const;

function FollowUpStackNav() {
  return (
    <FUStack.Navigator screenOptions={headerStyle}>
      <FUStack.Screen
        name="FollowUpList"
        component={FollowUpListScreen}
        options={{ title: 'Follow Up' }}
      />
      <FUStack.Screen
        name="FollowUpDetail"
        component={FollowUpDetailScreen}
        options={{ title: 'Newcomer' }}
      />
      <FUStack.Screen
        name="NewcomerRegistration"
        component={NewcomerRegistrationScreen}
        options={{ title: 'Register Newcomer' }}
      />
    </FUStack.Navigator>
  );
}

function GroupsStackNav() {
  return (
    <GStack.Navigator screenOptions={headerStyle}>
      <GStack.Screen name="GroupsHome" component={GroupsScreen} options={{ title: 'Groups' }} />
      <GStack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ title: 'Group' }} />
      <GStack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={({ route }) => ({ title: `💬 ${route.params.groupName}` })}
      />
    </GStack.Navigator>
  );
}

function EventsStackNav() {
  return (
    <EStack.Navigator screenOptions={headerStyle}>
      <EStack.Screen name="EventsHome" component={EventsScreen} options={{ title: 'Events' }} />
    </EStack.Navigator>
  );
}

function MoreStackNav() {
  return (
    <MStack.Navigator screenOptions={headerStyle}>
      <MStack.Screen name="MoreHome" component={MoreScreen} options={{ title: 'More' }} />
      <MStack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ title: 'Announcements' }}
      />
      <MStack.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{ title: 'Attendance' }}
      />
      <MStack.Screen name="Teams" component={TeamsScreen} options={{ title: 'Ministry Teams' }} />
      <MStack.Screen name="TeamDetail" component={TeamDetailScreen} options={{ title: 'Team' }} />
      <MStack.Screen
        name="Leadership"
        component={LeadershipScreen}
        options={{ title: 'Leadership' }}
      />
      <MStack.Screen
        name="Contributions"
        component={ContributionsScreen}
        options={{ title: 'Contributions' }}
      />
      <MStack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: 'Reports & Analytics' }}
      />
      <MStack.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin' }} />
      <MStack.Screen
        name="RegistrationQR"
        component={QRCodeScreen}
        options={{ title: 'Registration QR' }}
      />
      <MStack.Screen name="Events" component={EventsScreen} options={{ title: 'Events' }} />
      <MStack.Screen name="Prayer" component={PrayerScreen} options={{ title: 'Prayer' }} />
      <MStack.Screen name="CheckIn" component={CheckInScreen} options={{ title: 'QR Check-In' }} />
      <MStack.Screen
        name="MemberCard"
        component={MemberCardScreen}
        options={{ title: 'My Member Card' }}
      />
      <MStack.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{ title: 'One-to-One' }}
      />
      <MStack.Screen
        name="TeamChat"
        component={GroupChatScreen}
        options={({ route }) => ({ title: `💬 ${route.params.groupName}` })}
      />
      <MStack.Screen
        name="ProfileScreen"
        component={ProfileScreen}
        options={{ title: 'My Profile' }}
      />
    </MStack.Navigator>
  );
}

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{label}</Text>;
}

function MainTabs() {
  const { isLeader, profile } = useAuth();
  const { t } = useI18n();
  const unread = useUnread(!!profile);
  const canFollowUp = isLeader || profile?.role === 'minister' || !!profile?.follow_up_role;

  return (
    <Tabs.Navigator
      screenOptions={{
        ...headerStyle,
        tabBarActiveTintColor: colors.primary,
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: t('tab_home'),
          tabBarIcon: ({ focused }) => <TabIcon label="🏠" focused={focused} />,
        }}
      />
      {canFollowUp && (
        <Tabs.Screen
          name="FollowUp"
          component={FollowUpStackNav}
          options={{
            headerShown: false,
            title: t('tab_followup'),
            tabBarIcon: ({ focused }) => <TabIcon label="📋" focused={focused} />,
          }}
        />
      )}
      {canFollowUp && (
        <Tabs.Screen
          name="People"
          component={DirectoryScreen}
          options={{
            title: t('tab_people'),
            tabBarIcon: ({ focused }) => <TabIcon label="🧑‍🤝‍🧑" focused={focused} />,
          }}
        />
      )}
      <Tabs.Screen
        name="Groups"
        component={GroupsStackNav}
        options={{
          headerShown: false,
          title: t('tab_groups'),
          tabBarBadge: unread.total > 0 ? unread.total : undefined,
          tabBarIcon: ({ focused }) => <TabIcon label="👥" focused={focused} />,
        }}
      />
      {!canFollowUp && (
        <Tabs.Screen
          name="EventsTab"
          component={EventsStackNav}
          options={{
            headerShown: false,
            title: t('more_events'),
            tabBarIcon: ({ focused }) => <TabIcon label="🗓" focused={focused} />,
          }}
        />
      )}
      <Tabs.Screen
        name="More"
        component={MoreStackNav}
        options={{
          headerShown: false,
          title: t('tab_more'),
          tabBarIcon: ({ focused }) => <TabIcon label="☰" focused={focused} />,
        }}
      />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Account approval gate: signed in but not yet approved by an admin
  if (session && profile && !profile.account_approved && profile.role !== 'super_admin') {
    return <PendingApprovalScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={Platform.OS === 'web' && !session ? (authLinking as LinkingOptions<{}>) : undefined}
    >
      {session ? (
        <RootStack.Navigator>
          <RootStack.Screen
            name="Main"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{
              title: '🔔 Notifications',
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: '#fff',
            }}
          />
        </RootStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="SignIn" component={SignInScreen} />
          <AuthStack.Screen name="SignUp" component={SignUpScreen} />
          <AuthStack.Screen name="PublicRegister" component={PublicRegisterScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
