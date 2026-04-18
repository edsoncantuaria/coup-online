import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';
import CoinBurst from './CoinBurst';

interface CoinDeltaProps {
  /** Valor atual de moedas do jogador */
  coins: number;
}

/**
 * Exibe um pequeno "+N" / "-N" flutuante sobre o avatar quando o
 * número de moedas do jogador muda.
 */
export default function CoinDelta({ coins }: CoinDeltaProps) {
  const prev = useRef<number>(coins);
  const [delta, setDelta] = useState<number | null>(null);
  const [burstTrigger, setBurstTrigger] = useState<number | null>(null);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    const diff = coins - prev.current;
    prev.current = coins;
    if (diff === 0) return;

    setDelta(diff);
    setBurstTrigger(Date.now());
    opacity.value = 0;
    translateY.value = 0;

    opacity.value = withSequence(
      withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
      withDelay(
        900,
        withTiming(0, { duration: 380 }, (finished) => {
          if (finished) runOnJS(setDelta)(null);
        })
      )
    );
    translateY.value = withTiming(-26, {
      duration: 1500,
      easing: Easing.out(Easing.quad),
    });
  }, [coins]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (delta === null) return null;

  const isGain = delta > 0;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <CoinBurst trigger={burstTrigger} direction={isGain ? 'up' : 'down'} />
      <Animated.Text
        style={[
          styles.text,
          style,
          {
            color: isGain ? Theme.colors.gold : Theme.colors.error,
            textShadowColor: isGain
              ? 'rgba(198, 161, 91, 0.6)'
              : 'rgba(229, 86, 78, 0.55)',
          },
        ]}
      >
        {isGain ? `+${delta}` : `${delta}`}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    top: -4,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
    zIndex: 200,
  },
});
