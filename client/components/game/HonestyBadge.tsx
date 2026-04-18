import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check, AlertTriangle, Eye } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';

interface Props {
  role: string;        // papel exigido pelo bloqueio (ex: 'duke', 'captain'...)
  hasIt: boolean;      // se o jogador realmente tem essa influência viva
  /** Rótulo forçado (ex: "OU CAPITÃO OU EMBAIXADOR" para steal duplo) */
  labelOverride?: string;
}

const ROLE_PT: Record<string, string> = {
  duke: 'DUQUE',
  captain: 'CAPITÃO',
  ambassador: 'EMBAIXADOR',
  assassin: 'ASSASSINO',
  contessa: 'CONDESSA',
};

/**
 * Badge minimalista que revela AO PRÓPRIO JOGADOR se sua declaração
 * seria honesta ou um blefe. Informação privada do humano.
 *
 * Verde = possui a carta exigida (declaração legítima).
 * Âmbar = não possui a carta (seria blefe, contestável).
 */
export default function HonestyBadge({ role, hasIt, labelOverride }: Props) {
  const tone = hasIt ? Theme.colors.success : Theme.colors.gold;
  const label =
    labelOverride ||
    (hasIt
      ? `VOCÊ TEM ${ROLE_PT[role] || role.toUpperCase()}`
      : `SERÁ BLEFE (SEM ${ROLE_PT[role] || role.toUpperCase()})`);
  const Icon = hasIt ? Check : AlertTriangle;

  return (
    <View
      style={[
        styles.pill,
        { borderColor: tone, backgroundColor: tone + '1F' },
      ]}
    >
      <Icon size={9} color={tone} strokeWidth={3} />
      <Text style={[styles.text, { color: tone }]}>{label}</Text>
    </View>
  );
}

export function ChallengeOddsBadge({
  role,
  remaining,
  total,
}: {
  role: string;
  remaining: number;
  total: number;
}) {
  // Cor semafórica: ≤1 restante → mais verde (mais provável blefe).
  const tone =
    remaining <= 1
      ? Theme.colors.success
      : remaining === 2
      ? '#D0A860'
      : Theme.colors.imperialRed;
  return (
    <View
      style={[
        styles.pill,
        { borderColor: tone, backgroundColor: tone + '1F' },
      ]}
    >
      <Eye size={9} color={tone} strokeWidth={2.4} />
      <Text style={[styles.text, { color: tone }]}>
        {ROLE_PT[role] || role.toUpperCase()} · {remaining}/{total} em jogo
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
  text: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
});
