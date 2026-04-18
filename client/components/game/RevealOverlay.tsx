import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import Card from '../Card';
import { Theme } from '../../constants/Theme';
import { translateRole } from '../../utils/translations';

interface RevealOverlayProps {
  reveal: {
    role: string;
    playerName: string;
    playerId: string;
    verdict: 'proven' | 'bluff';
    stamp: number;
  } | null;
}

const HOLD_MS = 2400;

export default function RevealOverlay({ reveal }: RevealOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [localData, setLocalData] = useState<RevealOverlayProps['reveal']>(null);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.7);

  useEffect(() => {
    if (!reveal) return;
    setLocalData(reveal);
    setVisible(true);
    opacity.value = 0;
    scale.value = 0.7;

    opacity.value = withSequence(
      withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: 280 }, (finished) => {
          if (finished) runOnJS(setVisible)(false);
        })
      )
    );
    scale.value = withSequence(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.4)) }),
      withDelay(HOLD_MS, withTiming(0.92, { duration: 280 }))
    );
  }, [reveal?.stamp]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible || !localData) return null;

  const isProven = localData.verdict === 'proven';
  const accent = isProven ? Theme.colors.success : Theme.colors.error;
  const title = isProven ? 'PROVADO' : 'BLEFE';
  const Icon = isProven ? CheckCircle2 : XCircle;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[styles.box, containerStyle]}>
        <View style={styles.playerLine}>
          <Text style={styles.playerName}>
            {localData.playerName.toUpperCase()}
          </Text>
        </View>

        <View style={styles.cardHolder}>
          <Card role={localData.role} isFlipped isDead={false} style={styles.card} />
          <View
            style={[
              styles.verdictBadge,
              { backgroundColor: accent, borderColor: '#FFF' },
            ]}
          >
            <Icon color="#FFF" size={14} strokeWidth={2.4} />
            <Text style={styles.verdictText}>{title}</Text>
          </View>
        </View>

        <Text style={[styles.subText, { color: accent }]}>
          {isProven
            ? `Revelou ${translateRole(localData.role)} e comprou nova carta`
            : `Não era ${translateRole(localData.role)}`}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
  },
  box: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderRadius: Theme.radius.lg,
    backgroundColor: 'rgba(7, 10, 15, 0.88)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    ...Theme.shadows.premium,
  },
  playerLine: {
    marginBottom: 10,
  },
  playerName: {
    color: Theme.colors.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },
  cardHolder: {
    alignItems: 'center',
  },
  card: {
    width: 120,
    height: 170,
  },
  verdictBadge: {
    position: 'absolute',
    top: -12,
    right: -18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    transform: [{ rotate: '6deg' }],
  },
  verdictText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subText: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
