import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Shield,
  Swords,
  Crown,
  Sparkles,
  Minus,
  Plus,
  Play,
} from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import type { BotPersonality } from '../../utils/storage';

interface Props {
  visible: boolean;
  initialBots: number;
  initialPersonalities: BotPersonality[];
  onClose: () => void;
  onStart: (config: {
    bots: number;
    personalities: BotPersonality[];
  }) => void;
}

const MIN_BOTS = 1;
const MAX_BOTS = 5;

const PERSONAS: {
  id: BotPersonality;
  label: string;
  hint: string;
  color: string;
  Icon: React.ComponentType<any>;
}[] = [
  {
    id: 'cautious',
    label: 'PRUDENTE',
    hint: 'Pouco blefe, pouco desafio. Previsível.',
    color: '#6EA3D8',
    Icon: Shield,
  },
  {
    id: 'balanced',
    label: 'NEUTRO',
    hint: 'Comportamento equilibrado.',
    color: Theme.colors.gold,
    Icon: Sparkles,
  },
  {
    id: 'tyrant',
    label: 'TIRANO',
    hint: 'Prefere golpe e assassinato. Pressão constante.',
    color: Theme.colors.imperialRed,
    Icon: Crown,
  },
  {
    id: 'bluffer',
    label: 'BLEFADOR',
    hint: 'Bluffa muito. Desafia com agressividade.',
    color: Theme.colors.bluff,
    Icon: Swords,
  },
];

function ensureSize(arr: BotPersonality[], n: number): BotPersonality[] {
  const out = [...arr];
  while (out.length < n) out.push('balanced');
  out.length = n;
  return out;
}

export default function DifficultyModal({
  visible,
  initialBots,
  initialPersonalities,
  onClose,
  onStart,
}: Props) {
  const [bots, setBots] = useState<number>(
    Math.min(MAX_BOTS, Math.max(MIN_BOTS, initialBots))
  );
  const [personalities, setPersonalities] = useState<BotPersonality[]>(
    ensureSize(initialPersonalities, initialBots)
  );

  const currentList = useMemo(
    () => ensureSize(personalities, bots),
    [personalities, bots]
  );

  const setBotPersonality = (idx: number, p: BotPersonality) => {
    const next = ensureSize(personalities, bots).map((x, i) =>
      i === idx ? p : x
    );
    setPersonalities(next);
  };

  const changeBots = (delta: number) => {
    const next = Math.min(MAX_BOTS, Math.max(MIN_BOTS, bots + delta));
    setBots(next);
    setPersonalities(ensureSize(personalities, next));
  };

  const insets = useSafeAreaInsets();

  const handleStart = () => {
    onStart({
      bots,
      personalities: currentList,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['landscape']}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: 14 + insets.top,
            paddingBottom: 14 + insets.bottom,
            paddingLeft: 14 + insets.left,
            paddingRight: 14 + insets.right,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Swords size={14} color={Theme.colors.gold} />
              <Text style={styles.title}>PREPARAR CAMPANHA</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="Fechar"
            >
              <X size={18} color={Theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Contagem de bots */}
            <View style={styles.countBlock}>
              <Text style={styles.sectionLabel}>NÚMERO DE OPONENTES</Text>
              <View style={styles.counter}>
                <Pressable
                  style={({ pressed }) => [
                    styles.counterBtn,
                    pressed && { opacity: 0.8 },
                    bots <= MIN_BOTS && { opacity: 0.4 },
                  ]}
                  onPress={() => changeBots(-1)}
                  disabled={bots <= MIN_BOTS}
                  accessibilityLabel="Menos bots"
                >
                  <Minus size={14} color={Theme.colors.text} />
                </Pressable>
                <Text style={styles.counterValue}>{bots}</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.counterBtn,
                    pressed && { opacity: 0.8 },
                    bots >= MAX_BOTS && { opacity: 0.4 },
                  ]}
                  onPress={() => changeBots(1)}
                  disabled={bots >= MAX_BOTS}
                  accessibilityLabel="Mais bots"
                >
                  <Plus size={14} color={Theme.colors.text} />
                </Pressable>
              </View>
              <Text style={styles.hint}>
                Partida terá {bots + 1} jogadores.
              </Text>
            </View>

            {/* Personalidades por slot */}
            <Text style={[styles.sectionLabel, { marginTop: 6 }]}>
              PERFIL DOS OPONENTES
            </Text>
            {currentList.map((current, i) => (
              <View key={`slot-${i}`} style={styles.slotRow}>
                <Text style={styles.slotLabel}>BOT {i + 1}</Text>
                <View style={styles.slotOptions}>
                  {PERSONAS.map((p) => {
                    const selected = p.id === current;
                    const Icon = p.Icon;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setBotPersonality(i, p.id)}
                        style={({ pressed }) => [
                          styles.persona,
                          selected && {
                            borderColor: p.color,
                            backgroundColor: p.color + '22',
                          },
                          pressed && { opacity: 0.85 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={p.label}
                      >
                        <Icon size={11} color={p.color} />
                        <Text
                          style={[
                            styles.personaLabel,
                            selected && { color: p.color },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* Legenda */}
            <View style={styles.legend}>
              {PERSONAS.map((p) => {
                const Icon = p.Icon;
                return (
                  <View key={p.id} style={styles.legendRow}>
                    <Icon size={10} color={p.color} />
                    <Text style={[styles.legendLabel, { color: p.color }]}>
                      {p.label}
                    </Text>
                    <Text style={styles.legendHint}>{p.hint}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.startBtn}
            onPress={handleStart}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Play size={14} color="#0B0F14" />
            <Text style={styles.startBtnText}>INICIAR CAMPANHA</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,7,10,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '96%',
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.gold,
    padding: 16,
    ...Theme.shadows.premium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: Theme.colors.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
  countBlock: {
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: Theme.colors.surfaceHigh,
    marginBottom: 10,
  },
  sectionLabel: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginBottom: 6,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: 'rgba(11,15,20,0.6)',
  },
  counterValue: {
    color: Theme.colors.goldHigh,
    fontSize: 22,
    fontWeight: '900',
    minWidth: 32,
    textAlign: 'center',
  },
  hint: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  slotLabel: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    minWidth: 46,
  },
  slotOptions: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
  },
  personaLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  legend: {
    marginTop: 10,
    gap: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
    minWidth: 72,
  },
  legendHint: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.colors.gold,
    borderWidth: 1,
    borderColor: Theme.colors.goldHigh,
  },
  startBtnText: {
    color: '#0B0F14',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
});
