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
}

export default function ActionPanel({
  onAction,
  coins,
  disabledActions,
  aliveOpponents = 0,
}: ActionPanelProps) {
  const basicActions = [
    {
      id: 'income',
      label: 'Renda',
      icon: Coins,
      description: '+1 moeda',
      cost: 0,
    },
    {
      id: 'foreign_aid',
      label: 'Ajuda Estrangeira',
      icon: Globe,
      description: '+2 moedas · bloqueável',
      cost: 0,
    },
    {
      id: 'coup',
      label: 'Golpe',
      icon: Skull,
      description: 'Imbloqueável · inevitável',
      cost: 7,
    },
  ];

  const characterActions = [
    {
      id: 'tax',
      label: 'Taxar',
      icon: Crown,
      roleLabel: 'Duque · +3 moedas',
      cost: 0,
    },
    {
      id: 'assassinate',
      label: 'Assassinar',
      icon: Sword,
      roleLabel: 'Assassino · −1 carta do alvo',
      cost: 3,
    },
    {
      id: 'steal',
      label: 'Roubar',
      icon: Ship,
      roleLabel: 'Capitão · 2 moedas do alvo',
      cost: 0,
    },
    {
      id: 'exchange',
      label: 'Trocar',
      icon: RefreshCw,
      roleLabel: 'Embaixador · troca cartas',
      cost: 0,
    },
  ];

  const isDisabled = (cost: number, id: string) =>
    !!disabledActions ||
    coins < cost ||
    (coins >= 10 && id !== 'coup');

  // Preview de risco: quem pode contestar/bloquear
  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;
  const riskByAction: Record<string, string | undefined> = {
    income: undefined,
    foreign_aid: aliveOpponents
      ? `${aliveOpponents} pode${aliveOpponents > 1 ? 'm' : ''} bloquear (Duque)`
      : undefined,
    coup: undefined,
    tax: aliveOpponents
      ? `${aliveOpponents} ${plural(aliveOpponents, 'pode contestar', 'podem contestar')}`
      : undefined,
    assassinate: aliveOpponents
      ? `Contestável · bloqueio de Condessa`
      : undefined,
    steal: aliveOpponents
      ? `Contestável · alvo bloqueia c/ Capitão/Embaix.`
      : undefined,
    exchange: aliveOpponents
      ? `${aliveOpponents} ${plural(aliveOpponents, 'pode contestar', 'podem contestar')}`
      : undefined,
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBox}>
        <ScrollText color={Theme.colors.gold} size={14} />
        <Text style={styles.header}>AÇÕES</Text>
      </View>
      <Text style={styles.subheader}>Escolha uma ação para seu turno.</Text>

      <View style={styles.scrollWrapper}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={true}
        indicatorStyle="white"
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        nestedScrollEnabled
      >

        <Text style={styles.sectionLabel}>AÇÕES BÁSICAS</Text>
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
          <Text style={styles.sectionLabel}>AÇÕES DE PERSONAGEM</Text>
          <View style={styles.bluffBadge}>
            <Text style={styles.bluffBadgeText}>PODE BLEFAR</Text>
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
    width: 200,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(11, 15, 20, 0.65)',
    borderRightWidth: 1,
    borderRightColor: Theme.colors.goldLine,
    paddingHorizontal: 10,
    paddingTop: 10,
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
    paddingBottom: 24,
  },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  header: {
    color: Theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
  subheader: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  sectionLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 4,
  },
  group: {
    marginBottom: 10,
  },
  bluffHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  bluffBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.colors.bluffSoft,
    borderWidth: 1,
    borderColor: 'rgba(155, 123, 212, 0.35)',
    marginBottom: 8,
  },
  bluffBadgeText: {
    color: Theme.colors.bluff,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});
