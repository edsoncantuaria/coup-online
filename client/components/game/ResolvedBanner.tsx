import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';
import { Swords, Coins, Skull, Handshake, ShieldCheck } from 'lucide-react-native';

interface ResolvedBannerProps {
  data: {
    actionType: string;
    actorName: string;
    targetName?: string;
    summary: string;
    stamp: number;
  } | null;
}

const SHOW_MS = 2200;

function pickIcon(actionType: string) {
  switch (actionType) {
    case 'assassinate':
      return <Skull size={16} color={Theme.colors.imperialRed} />;
    case 'coup':
      return <Swords size={16} color={Theme.colors.imperialRed} />;
    case 'steal':
      return <Coins size={16} color={Theme.colors.gold} />;
    case 'tax':
    case 'income':
    case 'foreign_aid':
      return <Coins size={16} color={Theme.colors.gold} />;
    case 'exchange':
      return <Handshake size={16} color={Theme.colors.info} />;
    default:
      return <ShieldCheck size={16} color={Theme.colors.success} />;
  }
}

export default function ResolvedBanner({ data }: ResolvedBannerProps) {
  const [local, setLocal] = useState(data);
  const [visible, setVisible] = useState(false);
  const translateY = useSharedValue(-50);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!data) return;
    if (local?.stamp === data.stamp) return;
    setLocal(data);
    setVisible(true);
    translateY.value = -50;
    opacity.value = 0;
    translateY.value = withSequence(
      withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withDelay(
        SHOW_MS,
        withTiming(-50, { duration: 260, easing: Easing.in(Easing.cubic) })
      )
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 220 }),
      withDelay(
        SHOW_MS,
        withTiming(0, { duration: 260 }, (done) => {
          if (done) runOnJS(setVisible)(false);
        })
      )
    );
  }, [data?.stamp]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || !local) return null;

  return (
    <Animated.View style={[styles.wrap, style]} pointerEvents="none">
      <View style={styles.pill}>
        {pickIcon(local.actionType)}
        <Text style={styles.text} numberOfLines={1}>
          {local.summary}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.pill,
    backgroundColor: 'rgba(11,15,20,0.92)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    ...Theme.shadows.premium,
    maxWidth: '80%',
  },
  text: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
