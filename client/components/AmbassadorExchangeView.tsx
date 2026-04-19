import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import { Check, RefreshCw } from 'lucide-react-native';
import Card from './Card';
import { Theme } from '../constants/Theme';

interface Props {
  options: string[];
  neededCount: number;
  onConfirm: (kept: string[]) => void;
}

export default function AmbassadorExchangeView({
  options,
  neededCount,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (role: string, idx: number) => {
    const key = `${role}-${idx}`;
    if (selected.includes(key)) {
      setSelected(selected.filter((k) => k !== key));
    } else if (selected.length < neededCount) {
      setSelected([...selected, key]);
    }
  };

  const canConfirm = selected.length === neededCount;

  return (
    <View style={styles.overlay}>
      <View style={styles.alertBox}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBox}>
              <RefreshCw color={Theme.colors.gold} size={16} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={styles.title}>TROCA DO EMBAIXADOR</Text>
              <Text style={styles.subtitle}>
                Selecione {neededCount} carta{neededCount > 1 ? 's' : ''} para manter
                na sua mão
              </Text>
            </View>
          </View>

          <View style={styles.counter}>
            <Text style={styles.counterCurrent}>{selected.length}</Text>
            <Text style={styles.counterTotal}>/{neededCount}</Text>
          </View>
        </View>

        {/* Carrossel de cartas */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
        >
          {options.map((role, idx) => {
            const key = `${role}-${idx}`;
            const isSelected = selected.includes(key);
            const disabled = !isSelected && selected.length >= neededCount;
            return (
              <FlippingCard
                key={key}
                role={role}
                index={idx}
                isSelected={isSelected}
                disabled={disabled}
                onPress={() => !disabled && toggleSelect(role, idx)}
              />
            );
          })}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.hint}>
            {canConfirm
              ? 'As cartas não escolhidas voltam ao baralho.'
              : `Escolha mais ${neededCount - selected.length} carta${
                  neededCount - selected.length > 1 ? 's' : ''
                }.`}
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.confirmBtn,
              !canConfirm && styles.confirmBtnDisabled,
            ]}
            disabled={!canConfirm}
            onPress={() => onConfirm(selected.map((k) => k.split('-')[0]))}
          >
            <Text
              style={[
                styles.confirmText,
                !canConfirm && styles.confirmTextDisabled,
              ]}
            >
              AUTORIZAR TROCA
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * Card minimalista AAA com:
 *  - flip 3D de entrada (rotação Y em cascata por índice)
 *  - leve elevação e inclinação ao selecionar
 *  - Shadow dourado quando ativa
 */
function FlippingCard({
  role,
  index,
  isSelected,
  disabled,
  onPress,
}: {
  role: string;
  index: number;
  isSelected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const flip = useSharedValue(0);
  const lift = useSharedValue(0);
  const select = useSharedValue(0);

  React.useEffect(() => {
    flip.value = withDelay(
      index * 90,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  React.useEffect(() => {
    select.value = withTiming(isSelected ? 1 : 0, { duration: 220 });
  }, [isSelected]);

  const frontStyle = useAnimatedStyle(() => {
    // flip de -90° → 0° (efeito de carta "virando para a mão")
    const rotate = interpolate(flip.value, [0, 1], [-90, 0]);
    // elevação + rotação leve quando selecionada
    const translateY = interpolate(
      select.value,
      [0, 1],
      [0, -6]
    );
    const tilt = interpolate(select.value, [0, 1], [0, 4]);
    return {
      opacity: flip.value,
      transform: [
        { perspective: 600 },
        { rotateY: `${rotate}deg` },
        { rotateZ: `${tilt}deg` },
        { translateY },
      ] as NonNullable<ViewStyle['transform']>,
    };
  });

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.85}
      onPress={onPress}
      onPressIn={() => {
        lift.value = withTiming(1, { duration: 100 });
      }}
      onPressOut={() => {
        lift.value = withTiming(0, { duration: 180 });
      }}
    >
      <Animated.View
        style={[
          styles.cardWrapper,
          isSelected && styles.cardWrapperSelected,
          disabled && styles.cardWrapperDisabled,
          frontStyle,
        ]}
      >
        <Card role={role} isFlipped={true} isDead={false} style={styles.card} />
        {isSelected && (
          <Animated.View
            entering={FadeIn.duration(220)}
            style={styles.checkOverlay}
          >
            <Check color={Theme.colors.background} size={14} strokeWidth={3} />
          </Animated.View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    zIndex: 2000,
  },
  alertBox: {
    backgroundColor: Theme.colors.surface,
    width: '100%',
    maxWidth: 820,
    maxHeight: '94%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Theme.colors.goldLine,
    ...Theme.shadows.premium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  title: {
    color: Theme.colors.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  subtitle: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
    fontStyle: 'italic',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(198, 161, 91, 0.08)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  counterCurrent: {
    color: Theme.colors.gold,
    fontSize: 18,
    fontWeight: '900',
  },
  counterTotal: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },

  scrollRow: {
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
  },
  cardWrapper: {
    padding: 4,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardWrapperSelected: {
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
    ...Theme.shadows.goldGlow,
  },
  cardWrapperDisabled: {
    opacity: 0.4,
  },
  card: {
    width: 108,
    height: 150,
  },
  checkOverlay: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.surface,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderSoft,
    gap: 12,
  },
  hint: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    flex: 1,
    fontStyle: 'italic',
  },
  confirmBtn: {
    backgroundColor: Theme.colors.gold,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    ...Theme.shadows.goldGlow,
  },
  confirmBtnDisabled: {
    backgroundColor: Theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmText: {
    color: Theme.colors.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  confirmTextDisabled: {
    color: Theme.colors.textMuted,
  },
});
