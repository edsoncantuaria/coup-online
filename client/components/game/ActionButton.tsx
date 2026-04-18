import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { LucideIcon, ChevronRight } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';

interface ActionButtonProps {
  label: string;
  icon: LucideIcon;
  description?: string;
  roleLabel?: string;
  cost?: number;
  variant?: 'basic' | 'character';
  risk?: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function ActionButton({
  label,
  icon: Icon,
  description,
  roleLabel,
  cost,
  variant = 'basic',
  risk,
  onPress,
  disabled,
}: ActionButtonProps) {
  const scale = useSharedValue(1);
  const pressT = useSharedValue(0);
  const accentColor = variant === 'character' ? Theme.colors.bluff : Theme.colors.gold;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowColor: accentColor,
    shadowOpacity: interpolate(pressT.value, [0, 1], [0, 0.55]),
    shadowRadius: interpolate(pressT.value, [0, 1], [0, 14]),
    shadowOffset: { width: 0, height: 0 },
  }));
  const iconBoxStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pressT.value, [0, 1], [1, 1.08]) },
    ],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={() => {
          if (disabled) return;
          scale.value = withSpring(0.96, { damping: 14, stiffness: 220 });
          pressT.value = withTiming(1, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 180 });
          pressT.value = withTiming(0, { duration: 240 });
        }}
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.container,
          {
            borderColor:
              variant === 'character'
                ? 'rgba(155, 123, 212, 0.25)'
                : Theme.colors.goldLine,
          },
          disabled && styles.disabled,
        ]}
      >
        <Animated.View
          style={[
            styles.iconBox,
            {
              backgroundColor:
                variant === 'character' ? Theme.colors.bluffSoft : 'rgba(198, 161, 91, 0.1)',
              borderColor:
                variant === 'character' ? 'rgba(155, 123, 212, 0.3)' : Theme.colors.goldLine,
            },
            iconBoxStyle,
          ]}
        >
          <Icon
            color={disabled ? Theme.colors.textMuted : accentColor}
            size={18}
            strokeWidth={1.85}
          />
        </Animated.View>

        <View style={styles.textBox}>
          <Text style={[styles.label, disabled && styles.disabledText]}>
            {label.toUpperCase()}
          </Text>
          {!!(description || roleLabel) && (
            <Text
              style={[
                styles.description,
                roleLabel ? { color: accentColor } : null,
                disabled && styles.disabledText,
              ]}
              numberOfLines={1}
            >
              {roleLabel ?? description}
            </Text>
          )}
          {!!risk && !disabled && (
            <Text style={styles.risk} numberOfLines={1}>
              {risk}
            </Text>
          )}
        </View>

        {cost !== undefined && cost > 0 ? (
          <View style={styles.costBadge}>
            <Text style={styles.costText}>-{cost}</Text>
          </View>
        ) : (
          <ChevronRight
            color={disabled ? Theme.colors.textMuted : Theme.colors.textSecondary}
            size={12}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    backgroundColor: 'rgba(22, 29, 39, 0.72)',
    gap: 8,
    marginBottom: 5,
  },
  disabled: {
    opacity: 0.4,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textBox: {
    flex: 1,
  },
  label: {
    color: Theme.colors.text,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  description: {
    color: Theme.colors.textSecondary,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  disabledText: {
    color: Theme.colors.textMuted,
  },
  risk: {
    color: Theme.colors.imperialRed,
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 1,
    opacity: 0.85,
  },
  costBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(168, 58, 58, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168, 58, 58, 0.4)',
  },
  costText: {
    color: '#E7A1A1',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
