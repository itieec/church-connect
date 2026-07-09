import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { I18nProvider } from '@/lib/i18n';
import RootNavigator from '@/navigation';

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </I18nProvider>
  );
}
