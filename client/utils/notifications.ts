/**
 * Notificações push — permissão + preferência de "convites" para multiplayer.
 * No multiplayer online ainda não ativo: apenas prepara o canal e a intenção do usuário.
 */

import { Platform } from 'react-native';

let configured = false;

export async function configureNotificationHandler(): Promise<void> {
  if (configured || Platform.OS === 'web') return;
  configured = true;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    /* noop — dev sem native module */
  }
}

export async function getNotificationPermissionStatus(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  if (Platform.OS === 'web') return 'denied';
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'denied';
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Notifications = await import('expo-notifications');
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Registra interesse em convites (quando backend existir, associar token aqui). */
export async function syncInvitePreference(enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === 'web') return;
  try {
    await configureNotificationHandler();
    const Notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('invites', {
        name: 'Convites',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C6A15B',
      });
    }
    // Token push quando houver EAS + FCM/APNs no projeto.
    // const token = await Notifications.getExpoPushTokenAsync({ projectId: '...' });
  } catch {
    /* noop */
  }
}
