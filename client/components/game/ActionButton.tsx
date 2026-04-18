import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { LucideIcon, ChevronRight } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';

interface ActionButtonProps {
  label: string;
  icon: LucideIcon;
  description?: string;
  roleLabel?: string;
  cost?: number;
  variant?: 'basic' | 'character';
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
  onPress,
  disabled,
}: ActionButtonProps) {
  const scale = useSharedValue(1);
  const accentColor = variant === 'character' ? Theme.colors.bluff : Theme.colors.gold;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={() => {
          if (!disabled) scale.value = withSpring(0.97, { damping: 15, stiffness: 200 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200 });
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
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor:
                variant === 'character' ? Theme.colors.bluffSoft : 'rgba(198, 161, 91, 0.1)',
              borderColor:
                variant === 'character' ? 'rgba(155, 123, 212, 0.3)' : Theme.colors.goldLine,
            },
          ]}
        >
          <Icon
            color={disabled ? Theme.colors.textMuted : accentColor}
            size={18}
            strokeWidth={1.8}
          />
        </View>

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
        </View>

        {cost !== undefined && cost > 0 ? (
          <View style={styles.costBadge}>
            <Text style={styles.costText}>-{cost}</Text>
          </View>
        ) : (
          <ChevronRight
            color={disabled ? Theme.colors.textMuted : Theme.colors.textSecondary}
            size={14}
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(22, 29, 39, 0.7)',
    gap: 10,
    marginBottom: 6,
  },
  disabled: {
    opacity: 0.4,
  },
  iconBox: {
    width: 34,
    height: 34,
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
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  description: {
    color: Theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  disabledText: {
    color: Theme.colors.textMuted,
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
