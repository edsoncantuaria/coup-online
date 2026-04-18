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
} from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';

interface Props {
  name: string;
  size?: number;
  /** Tinta dominante (role color, accent, etc). Fallback gold. */
  tint?: string;
  /** Pulse suave contínuo (para destacar o foco do momento). */
  pulse?: boolean;
}

/**
 * Avatar circular com a inicial do nome e tinta de papel/facção.
 * Design AAA minimalista: anel + núcleo translúcido + glow.
 * Uso: dar "presença" visual ao actor/bloqueador em disputas.
 */
export default function ActorAvatar({
  name,
  size = 44,
  tint = Theme.colors.gold,
  pulse = false,
}: Props) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!pulse) return;
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(glow);
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + glow.value * 0.4,
    transform: [{ scale: 1 + glow.value * 0.08 }],
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
      {pulse && (
        <Animated.View
          style={[
            styles.halo,
            {
              width: size * 1.35,
              height: size * 1.35,
              borderRadius: (size * 1.35) / 2,
              backgroundColor: tint + '26',
              borderColor: tint + '55',
            },
            glowStyle,
          ]}
        />
      )}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: tint,
            backgroundColor: tint + '1A',
          },
        ]}
      >
        <Text
          style={[
            styles.initial,
            {
              color: tint,
              fontSize: size * 0.44,
            },
          ]}
        >
          {initial}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    borderWidth: 1,
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  initial: {
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
