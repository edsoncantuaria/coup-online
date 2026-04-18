import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  AlertTriangle,
  ShieldCheck,
  ShieldOff,
  Coins,
} from 'lucide-react-native';
import { Theme } from '../../constants/Theme';

interface Props {
  actionType: string;
  aliveOpponents: number;
}

interface Line {
  icon: React.ComponentType<any>;
  tone: 'warn' | 'info' | 'safe' | 'cost';
  text: string;
}

function linesFor(type: string, alive: number): Line[] {
  const many = alive === 1 ? '1 oponente' : `${alive} oponentes`;
  switch (type) {
    case 'income':
      return [
        {
          icon: ShieldCheck,
          tone: 'safe',
          text: 'Não pode ser bloqueada nem desafiada.',
        },
      ];
    case 'foreign_aid':
      return [
        {
          icon: ShieldOff,
          tone: 'warn',
          text: `Qualquer oponente (${many}) pode bloquear alegando Duque.`,
        },
        {
          icon: AlertTriangle,
          tone: 'info',
          text: 'Se o bloqueio for blefe, você pode desafiar.',
        },
      ];
    case 'tax':
      return [
        {
          icon: AlertTriangle,
          tone: 'warn',
          text: `Contestável (${many}). Se blefar e for pego, perde 1 influência.`,
        },
      ];
    case 'exchange':
      return [
        {
          icon: AlertTriangle,
          tone: 'warn',
          text: `Contestável (${many}). Se blefar e for pego, perde 1 influência.`,
        },
      ];
    case 'steal':
      return [
        {
          icon: AlertTriangle,
          tone: 'warn',
          text: `Contestável por qualquer um (${many}).`,
        },
        {
          icon: ShieldOff,
          tone: 'warn',
          text: 'Alvo pode bloquear com Capitão OU Embaixador.',
        },
      ];
    case 'assassinate':
      return [
        {
          icon: Coins,
          tone: 'cost',
          text: 'Custa 3 moedas MESMO se bloqueado ou desafiado.',
        },
        {
          icon: AlertTriangle,
          tone: 'warn',
          text: `Contestável (${many}).`,
        },
        {
          icon: ShieldOff,
          tone: 'warn',
          text: 'Alvo pode bloquear com Condessa.',
        },
      ];
    case 'coup':
      return [
        {
          icon: Coins,
          tone: 'cost',
          text: 'Custa 7 moedas. Imbloqueável e indesafiável.',
        },
      ];
    default:
      return [];
  }
}

const TONE_COLOR: Record<string, string> = {
  warn: Theme.colors.imperialRed,
  info: '#8FB8D8',
  safe: Theme.colors.success,
  cost: Theme.colors.gold,
};

/**
 * Painel minimalista AAA que descreve todas as consequências possíveis de
 * uma ação, respeitando as regras oficiais do Coup. Usado dentro de modais
 * (target picker / confirmação) para reforçar clareza.
 */
export default function ConsequenceHint({ actionType, aliveOpponents }: Props) {
  const lines = linesFor(actionType, aliveOpponents);
  if (lines.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>CONSEQUÊNCIAS POSSÍVEIS</Text>
      {lines.map((l, i) => {
        const Ic = l.icon;
        const color = TONE_COLOR[l.tone] || Theme.colors.textSecondary;
        return (
          <View key={i} style={styles.row}>
            <View style={[styles.iconBox, { borderColor: color }]}>
              <Ic size={10} color={color} />
            </View>
            <Text style={styles.text}>{l.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    backgroundColor: 'rgba(11,15,20,0.55)',
    width: '100%',
  },
  title: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  iconBox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  text: {
    color: Theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
    lineHeight: 14,
  },
});
