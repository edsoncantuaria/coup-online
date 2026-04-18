import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  interpolateColor,
} from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';

interface Props {
  /** Segundos restantes (0..max). */
  seconds: number;
  /** Tempo máximo, para calcular o preenchimento. */
  max?: number;
  /** Tamanho externo do anel. */
  size?: number;
  /** Cor primária do anel (quando há tempo). */
  color?: string;
  /** Cor de urgência (quando <= warnThreshold). */
  warnColor?: string;
  /** Limiar de urgência em segundos. */
  warnThreshold?: number;
}

/**
 * Timer circular minimalista sem SVG. O anel externo muda de tonalidade
 * conforme o tempo aperta; o número ao centro é a leitura direta.
 *
 * Design AAA: glow externo sutil + pulse crescente nos últimos segundos.
 */
export default function CircularTimer({
  seconds,
  max = 30,
  size = 54,
  color = Theme.colors.gold,
  warnColor = Theme.colors.imperialRed,
  warnThreshold = 10,
}: Props) {
  const pulse = useSharedValue(0);
  const urgency = useSharedValue(0);

  useEffect(() => {
    urgency.value = withTiming(seconds <= warnThreshold ? 1 : 0, {
      duration: 400,
    });

    if (seconds <= warnThreshold && seconds > 0) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [seconds]);

  const ringStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      urgency.value,
      [0, 1],
      [color + '22', warnColor + '33'],
    );
    const bd = interpolateColor(urgency.value, [0, 1], [color, warnColor]);
    return {
      backgroundColor: bg,
      borderColor: bd,
      transform: [{ scale: 1 + pulse.value * 0.06 }],
    };
  });

  const numberStyle = useAnimatedStyle(() => {
    const c = interpolateColor(urgency.value, [0, 1], [color, warnColor]);
    return { color: c };
  });

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.18 }],
  }));

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: warnColor + '33',
          },
          haloStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          ringStyle,
        ]}
      >
        <Animated.Text style={[styles.text, numberStyle]}>
          {seconds}
        </Animated.Text>
        <Text style={styles.unit}>s</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexDirection: 'row',
  },
  text: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.colors.textMuted,
    marginLeft: 2,
    marginTop: 4,
  },
});
