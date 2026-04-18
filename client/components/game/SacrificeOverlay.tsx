import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Swords, Skull, Flame, Crown } from 'lucide-react-native';
import Card from '../Card';
import { Theme } from '../../constants/Theme';
import CircularTimer from './CircularTimer';
import ActorAvatar from './ActorAvatar';

export type SacrificeReason =
  | 'coup'
  | 'assassinate'
  | 'challenge_lost'
  | 'bluff_caught';

interface Props {
  /** Cartas do jogador (role + isFlipped). */
  cards: { role: string; isFlipped: boolean }[];
  reason: SacrificeReason;
  causedByName?: string | null;
  timer: number | null;
  maxTimer?: number;
  onPick: (role: string) => void;
}

// Dicionários narrativos ────────────────────────────────────────────
const ROLE_PT: Record<string, string> = {
  duke: 'DUQUE',
  assassin: 'ASSASSINO',
  captain: 'CAPITÃO',
  ambassador: 'EMBAIXADOR',
  contessa: 'CONDESSA',
};

const ROLE_TINT: Record<string, string> = {
  duke: '#C6A15B',
  assassin: '#A84A4A',
  captain: '#5E83B5',
  ambassador: '#4E9477',
  contessa: '#B56B57',
};

/** Uma linha curta com "o que essa carta te dá" — ajuda na decisão. */
const ROLE_ABILITY: Record<string, string> = {
  duke: 'Cobra 3 moedas · bloqueia Ajuda Externa',
  assassin: 'Assassina (paga 3 moedas)',
  captain: 'Rouba 2 moedas · bloqueia roubos',
  ambassador: 'Troca cartas · bloqueia roubos',
  contessa: 'Bloqueia assassinatos',
};

/** Título principal: a pergunta dramática. */
const REASON_QUESTION: Record<SacrificeReason, string> = {
  coup: 'O GOLPE TE ATINGIU',
  assassinate: 'O ASSASSINATO SE CONCRETIZOU',
  challenge_lost: 'VOCÊ ACUSOU EM VÃO',
  bluff_caught: 'FOI PEGO BLEFANDO',
};

/** Sub-contexto: explica por que está perdendo. */
const REASON_SUBTITLE: Record<SacrificeReason, string> = {
  coup: 'ESCOLHA QUAL INFLUÊNCIA CAI EM DESGRAÇA',
  assassinate: 'ESCOLHA A INFLUÊNCIA A SER DESCARTADA',
  challenge_lost: 'O DESAFIO FALHOU · PAGUE COM UMA CARTA',
  bluff_caught: 'O BLEFE FALHOU · PAGUE COM UMA CARTA',
};

const REASON_ICON: Record<SacrificeReason, typeof Swords> = {
  coup: Flame,
  assassinate: Skull,
  challenge_lost: Swords,
  bluff_caught: Crown,
};

/** Frase de flavor (uma por motivo). */
const REASON_FLAVOR: Record<SacrificeReason, string> = {
  coup: '"A corte tremeu. Um dos seus aliados tomba."',
  assassinate: '"Uma lâmina silenciosa encontrou seu alvo."',
  challenge_lost: '"A acusação caiu por terra. O trono cobra o preço."',
  bluff_caught: '"As máscaras caíram. A verdade sempre pesa."',
};

// ─────────────────────────────────────────────────────────────────────

export default function SacrificeOverlay({
  cards,
  reason,
  causedByName,
  timer,
  maxTimer = 30,
  onPick,
}: Props) {
  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, []);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { scale: 0.92 + entrance.value * 0.08 },
      { translateY: (1 - entrance.value) * 14 },
    ],
  }));

  // Pulsar sutil da borda vermelha imperial — sensação de perigo.
  const dangerPulse = useSharedValue(0);
  useEffect(() => {
    dangerPulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, []);
  const dangerGlow = useAnimatedStyle(() => ({
    opacity: 0.5 + dangerPulse.value * 0.5,
  }));

  const alive = useMemo(
    () => cards.filter((c) => !c.isFlipped),
    [cards],
  );

  const Icon = REASON_ICON[reason];
  const screenW = Dimensions.get('window').width;
  const tightLayout = screenW < 620;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <BlurView
        intensity={Platform.OS === 'android' ? 34 : 50}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[
          'rgba(20,0,0,0.45)',
          'rgba(0,0,0,0.78)',
          'rgba(0,0,0,0.92)',
        ]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View style={[styles.card, cardStyle]}>
        {/* Borda superior vermelha pulsante */}
        <Animated.View style={[styles.topGlow, dangerGlow]}>
          <LinearGradient
            colors={[
              'transparent',
              Theme.colors.imperialRed,
              'transparent',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
        {/* Topo: badge de contexto + timer circular */}
        <View style={styles.topRow}>
          <View style={styles.contextPill}>
            <Icon size={12} color={Theme.colors.imperialRed} strokeWidth={2.4} />
            <Text style={styles.contextPillText}>SACRIFÍCIO</Text>
          </View>
          {timer !== null && (
            <CircularTimer
              seconds={timer}
              max={maxTimer}
              size={46}
              color={Theme.colors.gold}
              warnColor={Theme.colors.imperialRed}
            />
          )}
        </View>

        {/* Pergunta dramática */}
        <Animated.Text
          entering={FadeIn.delay(120).duration(280)}
          style={styles.question}
        >
          {REASON_QUESTION[reason]}
        </Animated.Text>

        <Animated.Text
          entering={FadeIn.delay(180).duration(260)}
          style={styles.subtitle}
        >
          {REASON_SUBTITLE[reason]}
        </Animated.Text>

        {/* Quem causou */}
        {causedByName ? (
          <Animated.View
            entering={FadeIn.delay(220).duration(300)}
            style={styles.causerRow}
          >
            <ActorAvatar
              name={causedByName}
              tint={Theme.colors.imperialRed}
              size={38}
            />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.causerLabel}>POR AÇÃO DE</Text>
              <Text style={styles.causerName} numberOfLines={1}>
                {causedByName.toUpperCase()}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Flavor */}
        <Animated.Text
          entering={FadeIn.delay(280).duration(300)}
          style={styles.flavor}
        >
          {REASON_FLAVOR[reason]}
        </Animated.Text>

        {/* Cartas para escolher */}
        <Animated.View
          entering={FadeIn.delay(360).duration(320)}
          style={[
            styles.cardsRow,
            tightLayout ? { gap: 10 } : { gap: 16 },
          ]}
        >
          {cards.map((card, i) => {
            const dead = card.isFlipped;
            const disabled = dead || alive.length === 0;
            const tint = ROLE_TINT[card.role] || Theme.colors.gold;
            return (
              <TouchableOpacity
                key={`sac-${i}-${card.role}-${dead ? 'x' : 'o'}`}
                disabled={disabled}
                activeOpacity={0.82}
                onPress={() => onPick(card.role)}
                style={[
                  styles.cardSlot,
                  dead && styles.cardSlotDead,
                ]}
              >
                <View
                  style={[
                    styles.cardGlow,
                    !dead && { borderColor: tint + '55' },
                  ]}
                >
                  <Card
                    role={card.role}
                    isFlipped
                    isDead={dead}
                    style={styles.bigCard}
                  />
                </View>
                {!dead ? (
                  <>
                    <Text
                      style={[styles.cardRole, { color: tint }]}
                      numberOfLines={1}
                    >
                      {ROLE_PT[card.role] || card.role.toUpperCase()}
                    </Text>
                    <Text style={styles.cardAbility} numberOfLines={2}>
                      {ROLE_ABILITY[card.role] || ''}
                    </Text>
                    <View style={styles.pickPill}>
                      <Text style={styles.pickPillText}>SACRIFICAR</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.deadLabel}>JÁ CAÍDA</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </Animated.View>

        <Animated.Text
          entering={FadeIn.delay(440).duration(260)}
          style={styles.footerHint}
        >
          ESTA ESCOLHA É IRREVERSÍVEL
        </Animated.Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    zIndex: 9200,
  },
  card: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '96%',
    backgroundColor: 'rgba(22, 16, 18, 0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(168, 58, 58, 0.45)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 16,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Theme.radius.pill,
    backgroundColor: 'rgba(168,58,58,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168,58,58,0.55)',
  },
  contextPillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: '#FFD4D4',
  },
  question: {
    fontSize: 18,
    fontWeight: '900',
    color: Theme.colors.text,
    letterSpacing: 2.2,
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: Theme.colors.textMuted,
    textAlign: 'center',
  },
  causerRow: {
    marginTop: 14,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(168, 58, 58, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(168, 58, 58, 0.35)',
  },
  causerLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: Theme.colors.textMuted,
  },
  causerName: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: Theme.colors.text,
    marginTop: 2,
  },
  flavor: {
    marginTop: 10,
    fontStyle: 'italic',
    fontSize: 11,
    color: Theme.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  cardsRow: {
    marginTop: 12,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardSlot: {
    flex: 1,
    maxWidth: 220,
    alignItems: 'center',
  },
  cardSlotDead: {
    opacity: 0.35,
  },
  cardGlow: {
    borderRadius: 14,
    padding: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bigCard: {
    width: 104,
    height: 148,
  },
  cardRole: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  cardAbility: {
    marginTop: 3,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 6,
    minHeight: 26,
  },
  pickPill: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Theme.radius.pill,
    backgroundColor: 'rgba(168, 58, 58, 0.22)',
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    ...Theme.shadows.redGlow,
  },
  pickPillText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: '#FFE3E0',
  },
  deadLabel: {
    marginTop: 10,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: Theme.colors.textMuted,
  },
  footerHint: {
    marginTop: 14,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 2,
    color: Theme.colors.textMuted,
    textAlign: 'center',
  },
});
