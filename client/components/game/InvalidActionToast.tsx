import React, { useEffect } from 'react';
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
import { AlertOctagon } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';

interface Props {
  data: { reason: string; stamp: number } | null;
  onDismiss?: () => void;
}

/**
 * Toast minimalista AAA para feedback de ação inválida.
 * Desliza do topo, segura ~3s, desliza de volta.
 * Não intercepta toques (pointerEvents=none).
 */
export default function InvalidActionToast({ data, onDismiss }: Props) {
  const translate = useSharedValue(-40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!data) return;
    translate.value = -40;
    opacity.value = 0;
    translate.value = withSequence(
      withTiming(0, { duration: 280, easing: Easing.out(Easing.quad) }),
      withDelay(2600, withTiming(-40, { duration: 240 }))
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 260 }),
      withDelay(
        2620,
        withTiming(
          0,
          { duration: 220 },
          () => {
            if (onDismiss) runOnJS(onDismiss)();
          }
        )
      )
    );
  }, [data?.stamp]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translate.value }],
  }));

  if (!data) return null;

  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <Animated.View style={[styles.toast, style]}>
        <View style={styles.iconBox}>
          <AlertOctagon size={12} color={Theme.colors.imperialRed} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>AÇÃO NÃO PERMITIDA</Text>
          <Text style={styles.reason} numberOfLines={2}>
            {data.reason}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 420,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    backgroundColor: 'rgba(20,8,8,0.94)',
    ...Theme.shadows.redGlow,
  },
  iconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    backgroundColor: 'rgba(168,58,58,0.2)',
  },
  label: {
    color: Theme.colors.imperialRed,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  reason: {
    color: '#FFE2E2',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
});
