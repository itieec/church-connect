import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Registers the device for push notifications and stores the Expo push token
 * on the user's profile. Safe to call anywhere:
 * - Web / simulators: no-op.
 * - Expo Go (SDK 53+): remote push unsupported — no-op with a console note.
 * - Dev build / production build: registers normally.
 */
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Dynamic imports so the app runs even before these packages are installed.
    const Device = await import('expo-device');
    const Notifications = await import('expo-notifications');

    if (!Device.isDevice) return;

    // Expo Go can't receive remote pushes since SDK 53 — skip quietly.
    const Constants = (await import('expo-constants')).default;
    if (Constants.appOwnership === 'expo') {
      console.log('[push] Expo Go detected — build a dev client to enable push notifications.');
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined))
      .data;

    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch (e) {
    console.log('[push] registration skipped:', (e as Error).message);
  }
}
