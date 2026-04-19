import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Coins } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';

interface CoinBurstProps {
  trigger: number | null;
  direction: 'up' | 'down';
}

function Particle({
  dx,
  dy,
  delay,
  direction,
}: {
  dx: number;
  dy: number;
  delay: number;
  direction: 'up' | 'down';
}) {
  const t = useSharedValue(0);
  const color = direction === 'up' ? Theme.colors.goldHigh : Theme.colors.error;

  useEffect(() => {
    t.value = 0;
    t.value = withDelay(
      delay,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.1 ? t.value * 10 : 1 - (t.value - 0.1) * 1.11,
    transform: [
      { translateX: t.value * dx },
      { translateY: t.value * dy },
      { rotate: `${t.value * 360}deg` },
      { scale: 0.5 + t.value * 0.6 },
    ] as NonNullable<ViewStyle['transform']>,
  }));

  return (
    <Animated.View style={[styles.particle, style]} pointerEvents="none">
      <Coins size={12} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

/**
 * Pequena explosão de moedas ao redor do avatar/coin. Direção `up` quando
 * ganha moedas (subida festiva) e `down` quando perde (cai).
 */
export default function CoinBurst({ trigger, direction }: CoinBurstProps) {
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (trigger === null) return;
    setActive(trigger);
    const t = setTimeout(() => setActive(null), 1100);
    return () => clearTimeout(t);
  }, [trigger]);

  if (active === null) return null;

  const sign = direction === 'up' ? -1 : 1;
  // 4 partículas com dispersão em arco
  const particles = [
    { dx: -18, dy: sign * 18 },
    { dx: -6, dy: sign * 26 },
    { dx: 8, dy: sign * 24 },
    { dx: 20, dy: sign * 16 },
  ];

  return (
    <View style={styles.wrap} pointerEvents="none">
      {particles.map((p, i) => (
        <Particle
          key={`${active}-${i}`}
          dx={p.dx}
          dy={p.dy}
          delay={i * 50}
          direction={direction}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 210,
  },
  particle: {
    position: 'absolute',
  },
});
