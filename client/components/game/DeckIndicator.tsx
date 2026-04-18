import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../../constants/Theme';

interface Props {
  count: number;
  total?: number;
}

/**
 * Indicador decorativo do baralho restante — canto da arena.
 * Visual AAA: pilha minimalista com 3 linhas gold e número pequeno.
 */
export default function DeckIndicator({ count, total = 15 }: Props) {
  // Três "cartas" empilhadas com offset para dar profundidade,
  // só aparece se houver pelo menos 1 carta no deck.
  if (count <= 0) return null;
  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={styles.stackShadow} />
      <View style={styles.cardBack} />
      <View style={styles.cardBackMid} />
      <View style={styles.cardBackTop}>
        <Text style={styles.count}>{count}</Text>
      </View>
      <Text style={styles.label}>BARALHO</Text>
      <Text style={styles.sub}>{count}/{total}</Text>
    </View>
  );
}

const W = 32;
const H = 44;
const OFFSET = 2;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  stackShadow: {
    position: 'absolute',
    width: W,
    height: H,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    top: OFFSET * 2 + 3,
    left: OFFSET * 2,
  },
  cardBack: {
    position: 'absolute',
    width: W,
    height: H,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(22, 29, 39, 0.92)',
    top: OFFSET * 2,
    left: OFFSET * 2,
  },
  cardBackMid: {
    position: 'absolute',
    width: W,
    height: H,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(26, 34, 46, 0.95)',
    top: OFFSET,
    left: OFFSET,
  },
  cardBackTop: {
    width: W,
    height: H,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(34, 44, 58, 0.98)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    color: Theme.colors.goldHigh,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  label: {
    marginTop: 5,
    color: Theme.colors.gold,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  sub: {
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 1,
  },
});
