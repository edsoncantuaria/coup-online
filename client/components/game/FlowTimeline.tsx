import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';

export type FlowStep = 'action' | 'block' | 'challenge_block';
export type StepState = 'done' | 'active' | 'future';

interface StepDef {
  id: FlowStep;
  label: string;
}

interface Props {
  /** Lista ordenada de passos relevantes ao ciclo da ação atual. */
  steps: StepDef[];
  /** Passo ativo atualmente. */
  active: FlowStep;
  /** Cor de destaque do passo ativo (gold por padrão). */
  activeColor?: string;
}

/**
 * Stepper horizontal minimalista que mostra em qual "corrente" do turno
 * estamos: Ação → Bloqueio → Desafio do Bloqueio.
 *
 * Aparência AAA: bolinhas conectadas por linha, ativa pulsando em gold,
 * passadas com check verde, futuras em outline neutro.
 */
export default function FlowTimeline({ steps, active, activeColor = Theme.colors.gold }: Props) {
  const activeIdx = steps.findIndex((s) => s.id === active);

  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [active]);

  const activeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={styles.row}>
      {steps.map((s, i) => {
        const state: StepState =
          i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'future';
        const isLast = i === steps.length - 1;
        return (
          <React.Fragment key={s.id}>
            <View style={styles.nodeWrap}>
              {state === 'active' ? (
                <Animated.View
                  style={[
                    styles.dot,
                    {
                      borderColor: activeColor,
                      backgroundColor: activeColor + '33',
                    },
                    activeStyle,
                  ]}
                >
                  <View
                    style={[styles.dotCore, { backgroundColor: activeColor }]}
                  />
                </Animated.View>
              ) : state === 'done' ? (
                <View
                  style={[
                    styles.dot,
                    {
                      borderColor: Theme.colors.success,
                      backgroundColor: Theme.colors.success + '22',
                    },
                  ]}
                >
                  <Check size={9} color={Theme.colors.success} strokeWidth={3} />
                </View>
              ) : (
                <View
                  style={[
                    styles.dot,
                    {
                      borderColor: Theme.colors.border,
                      backgroundColor: 'transparent',
                    },
                  ]}
                />
              )}
              <Text
                style={[
                  styles.label,
                  state === 'active' && { color: activeColor },
                  state === 'done' && { color: Theme.colors.success },
                  state === 'future' && { color: Theme.colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </View>
            {!isLast && (
              <View
                style={[
                  styles.connector,
                  i < activeIdx && { backgroundColor: Theme.colors.success },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const DOT = 16;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  nodeWrap: {
    alignItems: 'center',
    gap: 4,
    minWidth: 72,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: Theme.colors.textMuted,
  },
  connector: {
    width: 28,
    height: 1,
    backgroundColor: Theme.colors.border,
    marginBottom: 14,
  },
});
