/**
 * Badge central (rodada / timer) renderizado ACIMA das cartas do jogador.
 * Por defeito fica **discreto** (mesa respira); ao **tocar**, destaca-se
 * plenamente por 4s — imersão + leitura sob demanda.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';
import { hapticLight } from '../../utils/haptics';

const EMPHASIS_DURATION_MS = 4000;

function kindColor(
  kind?: 'idle' | 'action' | 'challenge' | 'block' | 'losing' | 'exchange' | 'over' | 'lobby',
): string {
  switch (kind) {
    case 'challenge':
      return Theme.colors.imperialRed;
    case 'block':
      return '#B48A3E';
    case 'losing':
      return Theme.colors.imperialRed;
    case 'exchange':
      return '#6D9FC8';
    default:
      return Theme.colors.gold;
  }
}

interface Props {
  statusTitle?: string;
  statusSubtitle?: string;
  statusKind?: 'idle' | 'action' | 'challenge' | 'block' | 'losing' | 'exchange' | 'over' | 'lobby';
  turnTimer?: number | null;
  transitioning?: boolean;
  transitionRemaining?: number | null;
  nextPlayerName?: string | null;
}

export default function TableCenterBadge({
  statusTitle,
  statusSubtitle,
  statusKind,
  turnTimer,
  transitioning,
  transitionRemaining,
  nextPlayerName,
}: Props) {
  const accent = kindColor(statusKind);
  const statusPulse = useSharedValue(0);
  /** 0 = repouso (discreto), 1 = destacado após toque (4s). */
  const emphasis = useSharedValue(0);
  const emphasisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    statusPulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(statusPulse);
  }, []);

  // Novo estado de rodada → volta ao modo discreto.
  useEffect(() => {
    if (emphasisTimerRef.current) {
      clearTimeout(emphasisTimerRef.current);
      emphasisTimerRef.current = null;
    }
    emphasis.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
  }, [statusTitle, statusSubtitle, transitioning]);

  useEffect(() => {
    return () => {
      if (emphasisTimerRef.current) clearTimeout(emphasisTimerRef.current);
    };
  }, []);

  const onPressBadge = () => {
    hapticLight();
    if (emphasisTimerRef.current) {
      clearTimeout(emphasisTimerRef.current);
      emphasisTimerRef.current = null;
    }
    emphasis.value = withSpring(1, { damping: 15, stiffness: 200 });
    emphasisTimerRef.current = setTimeout(() => {
      emphasis.value = withTiming(0, {
        duration: 550,
        easing: Easing.out(Easing.cubic),
      });
      emphasisTimerRef.current = null;
    }, EMPHASIS_DURATION_MS);
  };

  const badgeShellStyle = useAnimatedStyle(() => ({
    // Repouso: mesa visível; destaque: leitura total (4s após toque).
    opacity: 0.5 + emphasis.value * 0.5,
    transform: [{ scale: 0.96 + emphasis.value * 0.04 }],
  }));

  const timerRingStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + statusPulse.value * 0.4,
  }));

  if (!statusTitle) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={onPressBadge}
        accessibilityRole="button"
        accessibilityLabel="Destacar status da rodada por 4 segundos"
        hitSlop={12}
      >
        <Animated.View
          style={[
            styles.centerBadge,
            { borderColor: accent, shadowColor: accent },
            badgeShellStyle,
          ]}
        >
        {transitioning && (
          <View style={[styles.transitionTag, { borderColor: accent }]}>
            <View style={[styles.transitionDot, { backgroundColor: accent }]} />
            <Text style={[styles.transitionText, { color: accent }]}>
              {nextPlayerName
                ? `EM PREPARAÇÃO · ${nextPlayerName.toUpperCase()}`
                : 'RESOLVENDO'}
            </Text>
            {typeof transitionRemaining === 'number' &&
              transitionRemaining > 0 && (
                <View
                  style={[
                    styles.transitionCountdown,
                    { borderColor: accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.transitionCountdownText,
                      { color: accent },
                    ]}
                  >
                    {transitionRemaining}s
                  </Text>
                </View>
              )}
          </View>
        )}
        <Text style={[styles.centerBadgeLabel, { color: accent }]}>
          {statusKind === 'losing'
            ? 'SACRIFÍCIO'
            : statusKind === 'challenge'
            ? 'DESAFIO'
            : statusKind === 'block'
            ? 'BLOQUEIO'
            : statusKind === 'exchange'
            ? 'TROCA'
            : statusKind === 'over'
            ? 'FIM'
            : 'RODADA'}
        </Text>
        <Text style={styles.centerBadgeText} numberOfLines={2}>
          {statusTitle.toUpperCase()}
        </Text>
        {!!statusSubtitle && (
          <Text style={styles.centerBadgeSubtitle} numberOfLines={2}>
            {statusSubtitle}
          </Text>
        )}
        {typeof turnTimer === 'number' && turnTimer > 0 && (
          <Animated.View
            style={[
              styles.timerBadge,
              timerRingStyle,
              turnTimer <= 10 && { borderColor: Theme.colors.imperialRed },
            ]}
          >
            <Text
              style={[
                styles.timerText,
                turnTimer <= 10 && { color: Theme.colors.imperialRed },
              ]}
            >
              {turnTimer}s
            </Text>
          </Animated.View>
        )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 28,
    elevation: 28,
  },
  centerBadge: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: Theme.radius.md,
    // Base escura; opacidade final vem do animated (repouso mais translúcido).
    backgroundColor: 'rgba(7, 10, 15, 0.88)',
    borderWidth: 1,
    alignItems: 'center',
    maxWidth: '78%',
    minWidth: 200,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 10,
  },
  centerBadgeLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 3.5,
    marginBottom: 4,
  },
  centerBadgeText: {
    color: Theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    textAlign: 'center',
  },
  centerBadgeSubtitle: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 320,
  },
  transitionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(7,10,15,0.75)',
    marginBottom: 8,
    maxWidth: '100%',
  },
  transitionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  transitionText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  transitionCountdown: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  transitionCountdownText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  timerBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  timerText: {
    color: Theme.colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
