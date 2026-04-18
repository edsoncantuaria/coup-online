import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { Coins } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../constants/Theme';
import CoinDelta from './CoinDelta';

interface PlayerNodeProps {
  player: {
    id: string;
    name: string;
    coins: number;
    cards: { role: string; isFlipped: boolean }[];
  };
  isActing?: boolean;
  isWaiting?: boolean;
  isTargeted?: boolean;
  onLongPress?: () => void;
}

/**
 * Glifos minimalistas para a carta revelada — estilo AAA/heráldica,
 * usando símbolos Unicode já acessíveis em todas as fontes do sistema.
 */
const ROLE_GLYPH: Record<string, string> = {
  duke: '♛',
  captain: '⚔',
  assassin: '✦',
  ambassador: '✉',
  contessa: '✿',
};

const ROLE_TINT: Record<string, string> = {
  duke: '#E7B197',
  captain: '#8FB8D8',
  assassin: '#B39AD9',
  ambassador: '#F2D68A',
  contessa: '#DCD4E6',
};

const PlayerNode = ({
  player,
  isActing,
  isWaiting,
  isTargeted,
  onLongPress,
}: PlayerNodeProps) => {
  const isDead = player.cards && player.cards.every((c) => c.isFlipped);
  const glow = useSharedValue(0);
  const pulse = useSharedValue(0);
  const targetPulse = useSharedValue(0);
  /** Respiração sutil no avatar ativo — presença viva sem competir com cartas. */
  const avatarBreath = useSharedValue(0);

  useEffect(() => {
    if (isActing) {
      glow.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      glow.value = withTiming(0, { duration: 300 });
    }
  }, [isActing]);

  useEffect(() => {
    if (isWaiting) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
  }, [isWaiting]);

  useEffect(() => {
    if (isTargeted && !isDead) {
      targetPulse.value = withRepeat(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      targetPulse.value = withTiming(0, { duration: 300 });
    }
  }, [isTargeted, isDead]);

  useEffect(() => {
    if (isActing && !isDead) {
      avatarBreath.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      avatarBreath.value = withTiming(0, { duration: 280 });
    }
  }, [isActing, isDead]);

  const avatarBreathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + avatarBreath.value * 0.035 }],
    opacity: 0.92 + avatarBreath.value * 0.08,
  }));

  const ringStyle = useAnimatedStyle(() => {
    // Prioridade visual: alvo > aguardando resposta > atuando > normal
    if (isTargeted && !isDead) {
      return {
        borderColor: interpolateColor(
          targetPulse.value,
          [0, 1],
          [Theme.colors.imperialRedDeep, '#FF5A5A']
        ),
        shadowColor: Theme.colors.imperialRed,
        shadowOpacity: 0.5 + targetPulse.value * 0.5,
        shadowRadius: 10 + targetPulse.value * 16,
      };
    }
    return {
      borderColor: isWaiting
        ? interpolateColor(pulse.value, [0, 1], [
            Theme.colors.imperialRedDeep,
            Theme.colors.imperialRed,
          ])
        : interpolateColor(glow.value, [0, 1], [
            'rgba(45, 51, 59, 0.9)',
            Theme.colors.gold,
          ]),
      shadowColor: isWaiting ? Theme.colors.imperialRed : Theme.colors.gold,
      shadowOpacity: (isWaiting ? pulse.value : glow.value) * 0.9,
      shadowRadius: (isWaiting ? pulse.value : glow.value) * 14,
    };
  });

  // Halo externo — mais contido para não “vazar” para o centro da mesa.
  const haloStyle = useAnimatedStyle(() => {
    const base = isActing && !isDead ? 1 : 0;
    const val = glow.value * base;
    return {
      opacity: 0.12 + val * 0.22,
      transform: [{ scale: 1 + val * 0.09 }],
    };
  });

  return (
    <Pressable
      style={styles.nodeWrapper}
      onLongPress={onLongPress}
      delayLongPress={320}
      hitSlop={4}
    >
      {isActing && !isDead && (
        <Animated.View style={[styles.avatarHalo, haloStyle]} pointerEvents="none" />
      )}
      <Animated.View style={[styles.avatarRing, ringStyle, isDead && styles.deadRing]}>
        <Animated.View style={[styles.avatar, avatarBreathStyle]}>
          <Text style={styles.avatarLetter}>{player.name[0]?.toUpperCase()}</Text>
        </Animated.View>
        {isActing && !isDead && !isTargeted && (
          <View style={styles.actingPill}>
            <Text style={styles.actingPillText}>TURNO</Text>
          </View>
        )}
        {isTargeted && !isDead && (
          <View style={styles.targetPill}>
            <Text style={styles.targetPillText}>ALVO</Text>
          </View>
        )}
      </Animated.View>

      <Text style={styles.playerName} numberOfLines={1}>
        {player.name.toUpperCase()}
      </Text>

      <View style={styles.statsRow}>
        <Coins color={Theme.colors.gold} size={11} />
        <Text style={styles.coins}>{player.coins}</Text>
      </View>
      <CoinDelta coins={player.coins} />

      <View style={styles.cardsRow}>
        {player.cards?.map((c, i) => (
          <View
            key={i}
            style={[
              styles.miniCard,
              c.isFlipped && styles.miniCardDead,
            ]}
          >
            {c.isFlipped ? (
              <Text
                style={[
                  styles.miniCardGlyph,
                  { color: ROLE_TINT[c.role] || Theme.colors.imperialRed },
                ]}
              >
                {ROLE_GLYPH[c.role] || '×'}
              </Text>
            ) : (
              <View style={styles.miniCardInner} />
            )}
          </View>
        ))}
      </View>
    </Pressable>
  );
};

interface ArenaTableProps {
  players: any[];
  currentPlayerId: string | null;
  waitingForResponseId: string | null;
  targetId?: string | null;
  statusTitle?: string;
  statusSubtitle?: string;
  statusKind?: 'idle' | 'action' | 'challenge' | 'block' | 'losing' | 'exchange' | 'over' | 'lobby';
  turnTimer?: number | null;
  transitioning?: boolean;
  /** Segundos restantes no delay de transição (usados para banner "Em preparação..."). */
  transitionRemaining?: number | null;
  /** Nome do próximo jogador que vai atuar — mostrado no banner de preparação. */
  nextPlayerName?: string | null;
  /** Quando true, ativa o "foco dinâmico": vinheta periférica + glow central dourado. */
  spotlight?: boolean;
  /**
   * Intensidade do foco dinâmico:
   *  - idle:   nada (sem tensão)
   *  - focus:  seu turno / escolha pendente
   *  - climax: conflito ativo (desafio, bloqueio, sacrifício, reveal)
   * Quando passado, ignora "spotlight" booleano.
   */
  intensity?: 'idle' | 'focus' | 'climax';
  /** Quando true, o badge central não é desenhado aqui (usa-se TableCenterBadge por cima do HUD). */
  hideCenterBadge?: boolean;
  onPlayerLongPress?: (player: any) => void;
}

const kindColor = (kind?: string): string => {
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
};

export default function ArenaTable({
  players,
  currentPlayerId,
  waitingForResponseId,
  targetId,
  statusTitle,
  statusSubtitle,
  statusKind,
  turnTimer,
  transitioning,
  transitionRemaining,
  nextPlayerName,
  spotlight,
  intensity,
  hideCenterBadge,
  onPlayerLongPress,
}: ArenaTableProps) {
  const accent = kindColor(statusKind);
  const statusPulse = useSharedValue(0);
  // Intensidade em escala contínua: 0 = idle, 0.55 = focus, 1 = climax.
  const spotlightValue = useSharedValue(0);
  // Pulse extra só para clímax (faz a vinheta respirar quando há conflito).
  const climaxPulse = useSharedValue(0);
  /** Dilatação temporal: mesa encolhe levemente ao entrar em clímax (cinema). */
  const tableMoment = useSharedValue(1);
  const prevIntensityRef = useRef<
    'idle' | 'focus' | 'climax' | undefined
  >(undefined);

  // Deriva o alvo de intensidade. `intensity` tem prioridade sobre `spotlight`.
  const targetIntensity: number = (() => {
    if (intensity === 'climax') return 1;
    if (intensity === 'focus') return 0.55;
    if (intensity === 'idle') return 0;
    // Fallback para o boolean legado.
    return spotlight ? 0.55 : 0;
  })();
  const isClimax = intensity === 'climax';

  useEffect(() => {
    statusPulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);

  // Antecipação ao entrar em clímax: primeiro degrau de luz, depois pico;
  // fora do clímax, transição suave para idle/focus.
  useEffect(() => {
    const prev = prevIntensityRef.current;
    prevIntensityRef.current = intensity;

    if (intensity === 'climax' && prev !== 'climax') {
      // "Time dilation" na mesa — 0.92× por ~120ms, depois snap.
      tableMoment.value = withSequence(
        withTiming(0.92, {
          duration: 120,
          easing: Easing.inOut(Easing.quad),
        }),
        withSpring(1, { damping: 14, stiffness: 240 }),
      );
      // Buildup de luz antes do pico total (anticipation).
      spotlightValue.value = withSequence(
        withTiming(0.72, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        }),
        withSpring(1, { damping: 13, stiffness: 150 }),
      );
      return;
    }

    if (intensity !== 'climax') {
      spotlightValue.value = withTiming(targetIntensity, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [intensity, targetIntensity]);

  useEffect(() => {
    if (isClimax) {
      climaxPulse.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      climaxPulse.value = withTiming(0, { duration: 300 });
    }
  }, [isClimax]);

  const timerRingStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + statusPulse.value * 0.4,
  }));

  // Vinheta periférica (vertical) — intensifica com a tensão.
  // idle → 0  | focus → ~0.55 | climax → ~0.95 + respiração.
  const vignetteStyle = useAnimatedStyle(() => {
    const base = spotlightValue.value;
    const breath = isClimax ? climaxPulse.value * 0.08 : 0;
    return {
      opacity: Math.min(1, base * 0.92 + breath),
    };
  });
  // Vinheta horizontal extra — só aparece no clímax para "apertar" a tela.
  const sideVignetteStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, spotlightValue.value - 0.55) * 1.6,
  }));
  // Glow central — em "focus" fica mais contido para as cartas dominarem.
  const centerHaloStyle = useAnimatedStyle(() => {
    const v = spotlightValue.value;
    const breath = isClimax ? climaxPulse.value * 0.05 : 0;
    const baseOpacity = 0.22 + v * 0.52;
    return {
      opacity: baseOpacity + breath * 0.12,
      transform: [{ scale: 1 + v * 0.08 + breath }],
    };
  });

  const tableMomentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tableMoment.value }],
  }));
  // Posições em arco superior para modo paisagem
  const getPosition = (index: number, total: number): ViewStyle => {
    const arc5: ViewStyle[] = [
      { top: 55, left: '6%' },
      { top: 10, left: '22%' },
      { top: -6, left: '43%' },
      { top: 10, right: '22%' },
      { top: 55, right: '6%' },
    ];
    const arc4: ViewStyle[] = [
      { top: 40, left: '8%' },
      { top: 0, left: '28%' },
      { top: 0, right: '28%' },
      { top: 40, right: '8%' },
    ];
    const arc3: ViewStyle[] = [
      { top: 40, left: '10%' },
      { top: -5, left: '42%' },
      { top: 40, right: '10%' },
    ];
    const arc2: ViewStyle[] = [
      { top: 20, left: '18%' },
      { top: 20, right: '18%' },
    ];
    const arc1: ViewStyle[] = [{ top: 0, left: '42%' }];

    const layouts: Record<number, ViewStyle[]> = {
      1: arc1,
      2: arc2,
      3: arc3,
      4: arc4,
      5: arc5,
    };
    const positions = layouts[total] || arc5;
    return positions[index] || positions[0];
  };

  return (
    <View style={styles.container}>
      {/* Vinheta periférica — escurece cantos quando foco no meu turno */}
      <Animated.View
        style={[styles.vignette, vignetteStyle]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            'rgba(0,0,0,0)',
            'rgba(0,0,0,0.15)',
            'rgba(0,0,0,0.55)',
          ]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Vinheta lateral — só no clímax: "aperta" a tela em conflito */}
      <Animated.View
        style={[styles.vignette, sideVignetteStyle]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Mesa — com dilatação temporal ao entrar em clímax */}
      <Animated.View style={[styles.tableShadow, tableMomentStyle]}>
        <LinearGradient
          colors={['#1A2230', '#0E1520', '#080C12']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.tableOuter}
        >
          <View style={styles.tableBorderGold}>
            <LinearGradient
              colors={['#1F2A39', '#131A24', '#0B1018']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.tableInner}
            >
              {/* Ornamento radial: 3 camadas (mais presença, feltro premium) */}
              <Animated.View style={[styles.centerGlowOuter, centerHaloStyle]} />
              <Animated.View style={[styles.centerGlowInner, centerHaloStyle]} />
              <View style={styles.tableGrain} pointerEvents="none" />
              <View style={styles.tableInnerVignette} pointerEvents="none" />

              {/* Status central — omitido se hideCenterBadge (overlay em [roomId]) */}
              {!!statusTitle && !hideCenterBadge && (
                <View
                  style={[
                    styles.centerBadge,
                    { borderColor: accent, shadowColor: accent },
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
                  <Text style={styles.centerBadgeText} numberOfLines={1}>
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
                </View>
              )}
            </LinearGradient>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Jogadores */}
      {players.map((p, i) => (
        <View key={p.id} style={[styles.playerSlot, getPosition(i, players.length)]}>
          <PlayerNode
            player={p}
            isActing={currentPlayerId === p.id}
            isWaiting={waitingForResponseId === p.id}
            isTargeted={targetId === p.id}
            onLongPress={onPlayerLongPress ? () => onPlayerLongPress(p) : undefined}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 14,
  },
  tableShadow: {
    width: '96%',
    height: 312,
    ...Theme.shadows.premium,
  },
  tableOuter: {
    width: '100%',
    height: '100%',
    borderRadius: 220,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  tableBorderGold: {
    flex: 1,
    borderRadius: 220,
    padding: 3,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  tableInner: {
    flex: 1,
    borderRadius: 220,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(198, 161, 91, 0.08)',
  },
  centerGlowOuter: {
    position: 'absolute',
    width: '75%',
    height: '115%',
    borderRadius: 300,
    backgroundColor: 'rgba(198, 161, 91, 0.05)',
  },
  centerGlowInner: {
    position: 'absolute',
    width: '42%',
    height: '62%',
    borderRadius: 200,
    backgroundColor: 'rgba(198, 161, 91, 0.07)',
  },
  // Grão sutil: textura "feltro/poker" simulada com listras quase imperceptíveis.
  tableGrain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  // Vinheta interna: escurece as bordas da mesa para dar volume.
  tableInnerVignette: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 220,
    borderWidth: 38,
    borderColor: 'rgba(0,0,0,0.28)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  centerBadge: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: Theme.radius.md,
    backgroundColor: 'rgba(7, 10, 15, 0.92)',
    borderWidth: 1,
    borderColor: Theme.colors.gold,
    alignItems: 'center',
    maxWidth: '82%',
    minWidth: 220,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  centerBadgeLabel: {
    color: Theme.colors.gold,
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

  playerSlot: {
    position: 'absolute',
    alignItems: 'center',
    width: 92,
  },
  nodeWrapper: {
    alignItems: 'center',
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 15, 20, 0.85)',
    borderWidth: 2,
  },
  avatarHalo: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(198, 161, 91, 0.06)',
  },
  deadRing: {
    opacity: 0.4,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: Theme.colors.text,
    fontWeight: '900',
    fontSize: 20,
  },
  actingPill: {
    position: 'absolute',
    bottom: -9,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Theme.colors.gold,
    borderWidth: 1.5,
    borderColor: Theme.colors.background,
  },
  actingPillText: {
    color: '#0B0F14',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  targetPill: {
    position: 'absolute',
    bottom: -9,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Theme.colors.imperialRed,
    borderWidth: 1.5,
    borderColor: Theme.colors.background,
  },
  targetPillText: {
    color: '#FFF',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  playerName: {
    marginTop: 12,
    color: Theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  coins: {
    color: Theme.colors.gold,
    fontSize: 11,
    fontWeight: '900',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 5,
  },
  miniCard: {
    width: 16,
    height: 22,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(22, 29, 39, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCardInner: {
    width: 10,
    height: 14,
    borderRadius: 2,
    backgroundColor: 'rgba(198, 161, 91, 0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(198, 161, 91, 0.35)',
  },
  miniCardDead: {
    backgroundColor: 'rgba(110, 31, 31, 0.35)',
    borderColor: 'rgba(168, 58, 58, 0.5)',
  },
  miniCardGlyph: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
