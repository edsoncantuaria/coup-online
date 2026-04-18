import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  Coins,
  Globe,
  Crown,
  Sword,
  Ship,
  RefreshCw,
  Skull,
  ScrollText,
} from 'lucide-react-native';
import ActionButton from './ActionButton';
import { Theme } from '../../constants/Theme';

interface ActionPanelProps {
  onAction: (type: string) => void;
  coins: number;
  disabledActions?: boolean;
  /** Nº de oponentes vivos - usado para preview de risco */
  aliveOpponents?: number;
  /** Total de moedas dos oponentes vivos (para validar Roubo) */
  opponentsCoinsTotal?: number;
}

export default function ActionPanel({
  onAction,
  coins,
  disabledActions,
  aliveOpponents = 0,
  opponentsCoinsTotal = 0,
}: ActionPanelProps) {
  const basicActions = [
    {
      id: 'income',
      label: 'Renda',
      icon: Coins,
      description: '+1',
      cost: 0,
    },
    {
      id: 'foreign_aid',
      label: 'Ajuda ext.',
      icon: Globe,
      description: '+2',
      cost: 0,
    },
    {
      id: 'coup',
      label: 'Golpe',
      icon: Skull,
      description: '−7',
      cost: 7,
    },
  ];

  const characterActions = [
    {
      id: 'tax',
      label: 'Taxar',
      icon: Crown,
      roleLabel: 'Duque · +3',
      cost: 0,
    },
    {
      id: 'assassinate',
      label: 'Assassinar',
      icon: Sword,
      roleLabel: 'Assassino · −3',
      cost: 3,
    },
    {
      id: 'steal',
      label: 'Roubar',
      icon: Ship,
      roleLabel: 'Capitão · +2',
      cost: 0,
    },
    {
      id: 'exchange',
      label: 'Trocar',
      icon: RefreshCw,
      roleLabel: 'Embaix. · deck',
      cost: 0,
    },
  ];

  const isDisabled = (cost: number, id: string) => {
    if (disabledActions) return true;
    if (coins < cost) return true;
    if (coins >= 10 && id !== 'coup') return true;
    // Roubo só é possível se houver pelo menos 1 moeda no campo inimigo.
    if (id === 'steal' && opponentsCoinsTotal <= 0) return true;
    // Golpe / Assassinato exigem alvo vivo
    if ((id === 'coup' || id === 'assassinate') && aliveOpponents <= 0)
      return true;
    return false;
  };

  const riskByAction: Record<string, string | undefined> = {
    income: undefined,
    foreign_aid: aliveOpponents
      ? `${aliveOpponents} bloq. Duque`
      : undefined,
    coup: undefined,
    tax: aliveOpponents ? `${aliveOpponents} contest.` : undefined,
    assassinate: aliveOpponents ? 'Condessa bloq.' : undefined,
    steal: aliveOpponents ? 'Cap./Emb. bloq.' : undefined,
    exchange: aliveOpponents ? `${aliveOpponents} contest.` : undefined,
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBox}>
        <ScrollText color={Theme.colors.textSecondary} size={12} />
        <Text style={styles.header}>AÇÕES</Text>
      </View>

      <View style={styles.scrollWrapper}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={true}
        indicatorStyle="white"
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        nestedScrollEnabled
      >

        <Text style={styles.sectionLabel}>BÁSICAS</Text>
        <View style={styles.group}>
          {basicActions.map((a) => (
            <ActionButton
              key={a.id}
              label={a.label}
              icon={a.icon}
              description={a.description}
              cost={a.cost}
              risk={riskByAction[a.id]}
              onPress={() => onAction(a.id)}
              disabled={isDisabled(a.cost, a.id)}
              variant="basic"
            />
          ))}
        </View>

        <View style={styles.bluffHeader}>
          <Text style={styles.sectionLabel}>PERSONAGEM</Text>
          <View style={styles.bluffBadge}>
            <Text style={styles.bluffBadgeText}>BLEFE</Text>
          </View>
        </View>
        <View style={styles.group}>
          {characterActions.map((a) => (
            <ActionButton
              key={a.id}
              label={a.label}
              icon={a.icon}
              roleLabel={a.roleLabel}
              cost={a.cost}
              risk={riskByAction[a.id]}
              onPress={() => onAction(a.id)}
              disabled={isDisabled(a.cost, a.id)}
              variant="character"
            />
          ))}
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 168,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(11, 15, 20, 0.68)',
    borderRightWidth: 1,
    borderRightColor: Theme.colors.borderSoft,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 0,
    overflow: 'hidden',
    zIndex: 20,
  },
  scrollWrapper: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  header: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  sectionLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 5,
    marginTop: 2,
  },
  group: {
    marginBottom: 6,
  },
  bluffHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  bluffBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: Theme.colors.bluffSoft,
    borderWidth: 1,
    borderColor: 'rgba(155, 123, 212, 0.35)',
    marginBottom: 5,
  },
  bluffBadgeText: {
    color: Theme.colors.bluff,
    fontSize: 6.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
