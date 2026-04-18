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
import { Skull } from 'lucide-react-native';
import Card from '../Card';
import { Theme } from '../../constants/Theme';
import { translateRole } from '../../utils/translations';

interface LossRevealOverlayProps {
  loss: {
    role: string;
    playerName: string;
    playerId: string;
    stamp: number;
  } | null;
}

const HOLD_MS = 2000;

export default function LossRevealOverlay({ loss }: LossRevealOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [local, setLocal] = useState<LossRevealOverlayProps['loss']>(null);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (!loss) return;
    setLocal(loss);
    setVisible(true);
    opacity.value = 0;
    scale.value = 0.6;
    rotate.value = 0;

    opacity.value = withSequence(
      withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: 300 }, (done) => {
          if (done) runOnJS(setVisible)(false);
        })
      )
    );
    scale.value = withSequence(
      withTiming(1, { duration: 340, easing: Easing.out(Easing.back(1.4)) }),
      withDelay(
        HOLD_MS,
        withTiming(1.2, { duration: 300, easing: Easing.in(Easing.quad) })
      )
    );
    // Leve tombada final, simulando carta caindo
    rotate.value = withDelay(
      HOLD_MS - 250,
      withTiming(-18, { duration: 500, easing: Easing.inOut(Easing.quad) })
    );
  }, [loss?.stamp]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  if (!visible || !local) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[styles.box, style]}>
        <View style={styles.headerRow}>
          <Skull size={14} color={Theme.colors.imperialRed} />
          <Text style={styles.headerText}>INFLUÊNCIA PERDIDA</Text>
          <Skull size={14} color={Theme.colors.imperialRed} />
        </View>

        <Text style={styles.name}>{local.playerName.toUpperCase()}</Text>

        <View style={styles.cardHolder}>
          <Card role={local.role as any} isFlipped isDead style={styles.card} />
          <View style={styles.xMark}>
            <Text style={styles.xText}>×</Text>
          </View>
        </View>

        <Text style={styles.role}>
          REVELOU E QUEIMOU · {translateRole(local.role).toUpperCase()}
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
    zIndex: 1600,
  },
  box: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: Theme.radius.lg,
    backgroundColor: 'rgba(7, 10, 15, 0.92)',
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    ...Theme.shadows.redGlow,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  headerText: {
    color: Theme.colors.imperialRed,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
  },
  name: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  cardHolder: {
    alignItems: 'center',
  },
  card: {
    width: 120,
    height: 170,
    opacity: 0.85,
  },
  xMark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -28,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.imperialRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  xText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 24,
  },
  role: {
    marginTop: 12,
    color: Theme.colors.imperialRed,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
