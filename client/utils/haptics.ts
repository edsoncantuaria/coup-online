import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic helpers — mantém uma API simples para o resto do app.
 * Em web/iOS antigo, simplesmente silencia sem explodir.
 */

const safe = async (fn: () => Promise<unknown>) => {
  if (Platform.OS === 'web') return;
  try {
    await fn();
  } catch {
    // ignora — dispositivos sem suporte ou usuário em silencioso
  }
};

export const hapticLight = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

export const hapticMedium = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

export const hapticHeavy = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

export const hapticSuccess = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

export const hapticWarning = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

export const hapticError = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

export const hapticSelection = () => safe(() => Haptics.selectionAsync());
