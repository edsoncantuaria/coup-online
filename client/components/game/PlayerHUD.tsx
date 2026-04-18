import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Coins } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  Easing,
  FadeOut,
  ZoomIn,
  interpolateColor,
} from 'react-native-reanimated';
import Card from '../Card';
import { Theme } from '../../constants/Theme';
import CoinDelta from './CoinDelta';

interface PlayerHUDProps {
  me: any;
  isItsTurn: boolean;
  phase: string;
  isLosingInfluence?: boolean;
  isTargeted?: boolean;
  threatLabel?: string | null;
  /** Momento de alto drama (desafio / bloqueio / sacrifício) — tremor sutil nas cartas. */
  cardTension?: boolean;
  onSelectInfluence: (role: string) => void;
}

// Botão pressionável animado por carta: scale down ao pressionar, spring de volta.
// Adiciona glow dourado contínuo se for a vez do humano (cartas viram protagonistas).
function HeroCard({
  role,
  isFlipped,
  isFirst,
  onlyOneAlive,
  highlight,
  tension,
  disabled,
  onPress,
  slotKey,
}: {
  role: string;
  isFlipped: boolean;
  isFirst: boolean;
  onlyOneAlive: boolean;
  highlight: boolean;
  tension?: boolean;
  disabled: boolean;
  onPress: () => void;
  slotKey: string;
}) {
  const press = useSharedValue(1);
  const shine = useSharedValue(0);
  const jitter = useSharedValue(0);

  useEffect(() => {
    if (tension && !isFlipped) {
      jitter.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 52, easing: Easing.inOut(Easing.quad) }),
          withTiming(-1, { duration: 52, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 52, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else {
      jitter.value = withTiming(0, { duration: 160 });
    }
  }, [tension, isFlipped]);

  useEffect(() => {
    if (highlight && !isFlipped) {
      shine.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      shine.value = withTiming(0, { duration: 300 });
    }
  }, [highlight, isFlipped]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: onlyOneAlive ? '0deg' : isFirst ? '-3deg' : '3deg' },
      { scale: press.value },
      { translateX: jitter.value * 2.2 },
      {
        translateY:
          (highlight && !isFlipped ? -4 : 0) + jitter.value * -1.2,
      },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: shine.value * 0.85,
    shadowOpacity: 0.25 + shine.value * 0.55,
    shadowRadius: 12 + shine.value * 10,
  }));

  return (
    <Animated.View
      key={slotKey}
      entering={ZoomIn.duration(360)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.cardWrapper,
        !isFirst && { marginLeft: onlyOneAlive ? 18 : 12 },
        isFlipped && onlyOneAlive && styles.faintDeadCard,
        pressStyle,
      ]}
    >
      {/* Halo dourado contínuo quando for meu turno (cartas-heroínas) */}
      {highlight && !isFlipped && (
        <Animated.View style={[styles.cardHalo, glowStyle]} pointerEvents="none" />
      )}
      <Pressable
        disabled={disabled}
        onPressIn={() => {
          if (!disabled) press.value = withSpring(0.95, { damping: 14, stiffness: 220 });
        }}
        onPressOut={() => {
          press.value = withSpring(1, { damping: 14, stiffness: 220 });
        }}
        onPress={onPress}
        hitSlop={8}
        accessibilityLabel={
          isFlipped
            ? `Carta revelada: ${role}`
            : 'Carta oculta'
        }
        accessibilityRole="button"
      >
        <Card
          role={role}
          isFlipped
          isDead={isFlipped}
          style={styles.customCard}
        />
      </Pressable>
    </Animated.View>
  );
}

export default function PlayerHUD({
  me,
  isItsTurn,
  phase,
  isLosingInfluence = false,
  isTargeted = false,
  threatLabel = null,
  cardTension = false,
  onSelectInfluence,
}: PlayerHUDProps) {
  const pulse = useSharedValue(0);
  const threatPulse = useSharedValue(0);
  const coinPulse = useSharedValue(0);
  const choosing = phase === 'losing_influence' && isLosingInfluence;

  useEffect(() => {
    if (isItsTurn || choosing) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
  }, [isItsTurn, choosing]);

  useEffect(() => {
    if (isTargeted) {
      threatPulse.value = withRepeat(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      threatPulse.value = withTiming(0, { duration: 250 });
    }
  }, [isTargeted]);

  // Flash dourado no coinBox quando moedas mudam (vida nas moedas).
  // Micro-delay (40ms) desloca o impacto do log/UI — ritmo mais natural.
  useEffect(() => {
    const t = setTimeout(() => {
      coinPulse.value = withSequence(
        withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 }),
        withTiming(0, { duration: 1100, easing: Easing.out(Easing.cubic) }),
      );
    }, 40);
    return () => clearTimeout(t);
  }, [me?.coins]);

  const threatStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + threatPulse.value * 0.25,
    transform: [{ scale: 1 + threatPulse.value * 0.04 }],
  }));

  const turnPillStyle = useAnimatedStyle(() => ({
    shadowOpacity: pulse.value * 0.8,
    shadowRadius: 6 + pulse.value * 12,
  }));

  const coinBoxStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      coinPulse.value,
      [0, 1],
      [Theme.colors.goldLine, Theme.colors.goldHigh],
    ),
    shadowOpacity: coinPulse.value * 0.9,
    shadowRadius: 4 + coinPulse.value * 14,
  }));

  const coinScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + coinPulse.value * 0.08 }],
  }));

  if (!me) return null;

  return (
    <>
      {/* Info canto inferior esquerdo */}
      <View style={styles.leftDock} pointerEvents="box-none">
        {isTargeted && threatLabel && (
          <Animated.View style={[styles.threatPill, threatStyle]}>
            <Text style={styles.threatPillText} numberOfLines={1}>
              {threatLabel}
            </Text>
          </Animated.View>
        )}
        <Animated.View style={[styles.coinBox, coinBoxStyle]}>
          <Animated.View style={coinScaleStyle}>
            <Coins color={Theme.colors.gold} size={18} />
          </Animated.View>
          <Animated.Text style={[styles.coinText, coinScaleStyle]}>
            {me.coins}
          </Animated.Text>
          <Text style={styles.coinLabel}>MOEDAS</Text>
          <CoinDelta coins={me.coins} />
        </Animated.View>

        {me.coins >= 10 && isItsTurn && (
          <View style={styles.coupForcedPill}>
            <Text style={styles.coupForcedText}>GOLPE OBRIGATÓRIO</Text>
          </View>
        )}

        <Animated.View
          style={[
            styles.turnPill,
            isItsTurn ? styles.turnPillActive : styles.turnPillIdle,
            isItsTurn && turnPillStyle,
            isItsTurn && Theme.shadows.goldGlow,
          ]}
        >
          <View
            style={[
              styles.turnDot,
              isItsTurn
                ? { backgroundColor: Theme.colors.gold }
                : { backgroundColor: Theme.colors.textMuted },
            ]}
          />
          <Text
            style={[
              styles.turnPillText,
              isItsTurn
                ? { color: Theme.colors.gold }
                : { color: Theme.colors.textSecondary },
            ]}
          >
            {isItsTurn ? 'SUA VEZ DE AGIR' : 'AGUARDANDO NOBRES'}
          </Text>
        </Animated.View>
      </View>

      {/* Cartas canto inferior direito — protagonistas */}
      <View style={styles.rightDock} pointerEvents="box-none">
        <View style={styles.handContainer} pointerEvents="box-none">
          {me.cards?.map((card: any, i: number) => {
            const disabled = !choosing || card.isFlipped;
            const isFirst = i === 0;
            const aliveCount = me.cards.filter(
              (c: any) => !c.isFlipped,
            ).length;
            const onlyOneAlive = aliveCount === 1;
            const slotKey = `slot-${i}-${card.role}-${card.isFlipped ? 'x' : 'o'}`;
            return (
              <HeroCard
                key={slotKey}
                slotKey={slotKey}
                role={card.role}
                isFlipped={card.isFlipped}
                isFirst={isFirst}
                onlyOneAlive={onlyOneAlive}
                highlight={isItsTurn && phase === 'action'}
                tension={cardTension}
                disabled={disabled}
                onPress={() => onSelectInfluence(card.role)}
              />
            );
          })}
        </View>
        <Text style={styles.handLabel}>SUAS CARTAS</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  leftDock: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    alignItems: 'flex-start',
    gap: 8,
    zIndex: 10,
  },
  rightDock: {
    position: 'absolute',
    right: 12,
    bottom: 6,
    alignItems: 'flex-end',
    zIndex: 10,
  },

  coinBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Theme.radius.pill,
    backgroundColor: 'rgba(11,15,20,0.65)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    shadowColor: Theme.colors.gold,
    shadowOffset: { width: 0, height: 0 },
  },
  coinText: {
    color: Theme.colors.gold,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  coinLabel: {
    // Dourado só no importante: aqui vira label neutro.
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginLeft: 2,
  },

  turnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
    shadowColor: Theme.colors.gold,
  },
  turnPillIdle: {
    backgroundColor: 'rgba(11,15,20,0.55)',
    borderColor: Theme.colors.border,
  },
  turnPillActive: {
    backgroundColor: 'rgba(198, 161, 91, 0.14)',
    borderColor: Theme.colors.gold,
  },
  turnPillText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  turnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  handContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  cardWrapper: {
    ...Theme.shadows.premium,
  },
  customCard: {
    // Protagonistas: +24% em área (90×128 → 112×160)
    width: 112,
    height: 160,
  },
  cardHalo: {
    position: 'absolute',
    inset: -4,
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Theme.colors.gold,
    backgroundColor: 'transparent',
    shadowColor: Theme.colors.gold,
    shadowOffset: { width: 0, height: 0 },
  },
  faintDeadCard: {
    opacity: 0.35,
  },
  handLabel: {
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
    marginRight: 6,
  },
  threatPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.radius.sm,
    backgroundColor: 'rgba(168,58,58,0.22)',
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    ...Theme.shadows.redGlow,
  },
  threatPillText: {
    color: '#FFD4D4',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  coupForcedPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.radius.sm,
    backgroundColor: 'rgba(168,58,58,0.22)',
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    ...Theme.shadows.redGlow,
  },
  coupForcedText: {
    color: '#FFD4D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
