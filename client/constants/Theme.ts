import { Platform } from 'react-native';

export const Theme = {
  colors: {
    // Base
    background: '#0B0F14',
    secondary: '#121821',
    surface: '#161D27',
    surfaceHigh: '#1B2330',

    // Premium accents
    gold: '#C6A15B',
    goldSoft: '#8C6F3D',
    goldHigh: '#E5C478',
    goldGlow: 'rgba(198, 161, 91, 0.35)',
    goldLine: 'rgba(198, 161, 91, 0.25)',

    imperialRed: '#A83A3A',
    imperialRedDeep: '#6E1F1F',
    imperialRedGlow: 'rgba(168, 58, 58, 0.35)',

    // Text
    text: '#EADDCA',
    textSecondary: '#A1ADC1',
    textMuted: '#6B7380',

    // State colors
    border: '#2D333B',
    borderSoft: 'rgba(161, 173, 193, 0.12)',
    success: '#4FA76A',
    successSoft: 'rgba(79, 167, 106, 0.15)',
    error: '#E5564E',
    errorSoft: 'rgba(229, 86, 78, 0.15)',
    bluff: '#9B7BD4',
    bluffSoft: 'rgba(155, 123, 212, 0.18)',
    info: '#6EA3D8',
  },
  fonts: {
    // iOS/Android system fallbacks - serif para títulos de corte
    serif: Platform.select({ ios: 'Georgia', android: 'serif' }) as string,
    sans: Platform.select({ ios: 'System', android: 'sans-serif' }) as string,
  },
  typography: {
    displayTitle: {
      fontSize: 22,
      fontWeight: '700' as const,
      letterSpacing: 3,
    },
    title: {
      fontSize: 14,
      fontWeight: '900' as const,
      letterSpacing: 2.5,
    },
    subtitle: {
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 2,
    },
    body: {
      fontSize: 13,
      fontWeight: '500' as const,
      letterSpacing: 0.2,
    },
    label: {
      fontSize: 9,
      fontWeight: '800' as const,
      letterSpacing: 1.8,
    },
    caption: {
      fontSize: 10,
      fontWeight: '600' as const,
      letterSpacing: 1,
    },
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    pill: 999,
  },
  shadows: {
    premium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 15,
      elevation: 10,
    },
    soft: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 4,
    },
    goldGlow: {
      shadowColor: '#C6A15B',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 12,
      elevation: 8,
    },
    redGlow: {
      shadowColor: '#A83A3A',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 10,
      elevation: 6,
    },
  },
};

export type ThemeType = typeof Theme;
