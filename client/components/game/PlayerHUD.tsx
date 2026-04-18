import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Coins } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
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
  onSelectInfluence: (role: string) => void;
}

export default function PlayerHUD({
  me,
  isItsTurn,
  phase,
  isLosingInfluence = false,
  isTargeted = false,
  threatLabel = null,
  onSelectInfluence,
}: PlayerHUDProps) {
  const pulse = useSharedValue(0);
  const threatPulse = useSharedValue(0);
  const choosing = phase === 'losing_influence' && isLosingInfluence;

  useEffect(() => {
    if (isItsTurn || choosing) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
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
        true
      );
    } else {
      threatPulse.value = withTiming(0, { duration: 250 });
    }
  }, [isTargeted]);

  const threatStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + threatPulse.value * 0.25,
    transform: [{ scale: 1 + threatPulse.value * 0.04 }],
  }));

  const turnPillStyle = useAnimatedStyle(() => ({
    shadowOpacity: pulse.value * 0.8,
    shadowRadius: 6 + pulse.value * 12,
  }));

  const chooseHintStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + pulse.value * 0.4,
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
        <View style={styles.coinBox}>
          <Coins color={Theme.colors.gold} size={18} />
          <Text style={styles.coinText}>{me.coins}</Text>
          <Text style={styles.coinLabel}>MOEDAS</Text>
          <CoinDelta coins={me.coins} />
        </View>

        {me.coins >= 10 && isItsTurn && (
          <View style={styles.coupForcedPill}>
            <Text style={styles.coupForcedText}>
              GOLPE OBRIGATÓRIO
            </Text>
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

      {/* Cartas canto inferior direito */}
      <View style={styles.rightDock} pointerEvents="box-none">
        {choosing && (
          <Animated.Text style={[styles.chooseHint, chooseHintStyle]}>
            TOQUE UMA CARTA PARA PERDER
          </Animated.Text>
        )}
        <View style={styles.handContainer} pointerEvents="box-none">
          {me.cards?.map((card: any, i: number) => {
            const disabled = !choosing || card.isFlipped;
            const isFirst = i === 0;
            const aliveCount = me.cards.filter(
              (c: any) => !c.isFlipped
            ).length;
            const onlyOneAlive = aliveCount === 1;
            // Key inclui role+isFlipped: quando o engine substitui a carta
            // provada, a key muda, forçando remontagem + animação de entrada.
            const slotKey = `slot-${i}-${card.role}-${card.isFlipped ? 'x' : 'o'}`;
            return (
              <Animated.View
                key={slotKey}
                entering={ZoomIn.duration(360)}
                exiting={FadeOut.duration(200)}
                style={[
                  styles.cardWrapper,
                  isFirst
                    ? { transform: [{ rotate: onlyOneAlive ? '0deg' : '-3deg' }] }
                    : {
                        transform: [{ rotate: onlyOneAlive ? '0deg' : '3deg' }],
                        marginLeft: onlyOneAlive ? 16 : 10,
                      },
                  card.isFlipped && onlyOneAlive && styles.faintDeadCard,
                ]}
              >
                <TouchableOpacity
                  disabled={disabled}
                  onPress={() => onSelectInfluence(card.role)}
                  activeOpacity={0.75}
                  hitSlop={8}
                  accessibilityLabel={
                    card.isFlipped
                      ? `Carta revelada: ${card.role}`
                      : choosing
                      ? `Tocar para descartar a carta ${card.role}`
                      : 'Carta oculta'
                  }
                  accessibilityRole="button"
                >
                  <Card
                    role={card.role}
                    isFlipped
                    isDead={card.isFlipped}
                    style={[
                      styles.customCard,
                      choosing && !card.isFlipped && styles.selectableCard,
                    ]}
                  />
                </TouchableOpacity>
              </Animated.View>
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
    width: 90,
    height: 128,
  },
  selectableCard: {
    borderColor: Theme.colors.imperialRed,
    borderWidth: 2.5,
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
  chooseHint: {
    color: Theme.colors.imperialRed,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 6,
    backgroundColor: 'rgba(168,58,58,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168,58,58,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.radius.sm,
  },
});
