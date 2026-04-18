import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  X,
  Trophy,
  Swords,
  Coins,
  Crown,
  Target,
  Flame,
  Trash2,
} from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import type {
  MatchHistoryEntry,
  HistoryAggregate,
} from '../../utils/storage';

interface Props {
  visible: boolean;
  onClose: () => void;
  history: MatchHistoryEntry[];
  aggregate: HistoryAggregate;
  onClear: () => void;
}

function fmtDate(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' · ' + d.toLocaleTimeString().slice(0, 5);
  } catch {
    return '—';
  }
}

function fmtDuration(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MatchHistoryModal({
  visible,
  onClose,
  history,
  aggregate,
  onClear,
}: Props) {
  const handleClear = () => {
    Alert.alert(
      'Apagar histórico?',
      'Isso remove todas as batalhas registradas. Não pode ser desfeito.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: onClear,
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      supportedOrientations={['landscape']}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Trophy size={14} color={Theme.colors.gold} />
              <Text style={styles.title}>ANAIS DE COMBATE</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={18} color={Theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Bloco superior: Agregados */}
          <View style={styles.aggregateRow}>
            <BigStat
              value={`${Math.round(aggregate.winRate * 100)}%`}
              label="TAXA DE VITÓRIA"
              accent="gold"
            />
            <BigStat
              value={String(aggregate.total)}
              label="BATALHAS"
              accent="text"
            />
            <BigStat
              value={String(aggregate.wins)}
              label="VITÓRIAS"
              accent="success"
            />
            <BigStat
              value={String(aggregate.losses)}
              label="DERROTAS"
              accent="red"
            />
            <BigStat
              value={String(aggregate.bestWinStreak)}
              label="MELHOR STREAK"
              accent="flame"
            />
          </View>

          <View style={styles.aggregateRow}>
            <SmallStat
              icon={<Flame size={12} color={Theme.colors.imperialRed} />}
              value={
                aggregate.currentStreak === 0
                  ? '0'
                  : aggregate.currentStreak > 0
                  ? `${aggregate.currentStreak} VITÓRIAS`
                  : `${-aggregate.currentStreak} DERROTAS`
              }
              label="SEQUÊNCIA ATUAL"
            />
            <SmallStat
              icon={<Target size={12} color={Theme.colors.bluff} />}
              value={String(aggregate.totalBluffsCaught)}
              label="BLEFES PEGOS"
            />
            <SmallStat
              icon={<Swords size={12} color={Theme.colors.success} />}
              value={String(aggregate.totalChallengesWon)}
              label="DESAFIOS VENCIDOS"
            />
            <SmallStat
              icon={<Coins size={12} color={Theme.colors.gold} />}
              value={`${Math.round(aggregate.avgRounds)}R`}
              label="RODADAS/PARTIDA"
            />
            <SmallStat
              icon={<Crown size={12} color={Theme.colors.gold} />}
              value={fmtDuration(aggregate.avgDurationMs)}
              label="TEMPO MÉDIO"
            />
          </View>

          <Text style={styles.sectionLabel}>REGISTROS INDIVIDUAIS</Text>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator
          >
            {history.length === 0 ? (
              <Text style={styles.empty}>
                Ainda sem entradas. Cada batalha é registrada aqui.
              </Text>
            ) : (
              history.map((m) => (
                <View key={m.id} style={styles.row}>
                  <View
                    style={[
                      styles.resultPill,
                      m.result === 'win' ? styles.pillWin : styles.pillLoss,
                    ]}
                  >
                    <Text style={styles.resultText}>
                      {m.result === 'win' ? 'VITÓRIA' : 'DERROTA'}
                    </Text>
                  </View>

                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>
                      {m.playerName.toUpperCase()}
                      {m.mvp && '  👑 MVP'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {fmtDate(m.playedAt)} · {m.opponents} oponentes ·{' '}
                      {m.rounds}R · {fmtDuration(m.durationMs)}
                    </Text>
                  </View>

                  <View style={styles.rowStats}>
                    <RowStat label="AÇÕES" value={m.actionsTaken} />
                    <RowStat label="DES. OK" value={m.challengesWon} />
                    <RowStat label="BLEFES" value={m.bluffsCaught} />
                    <RowStat label="BLOQ." value={m.blocksSuccess} />
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {history.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Trash2 size={12} color={Theme.colors.textMuted} />
              <Text style={styles.clearBtnText}>LIMPAR HISTÓRICO</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function BigStat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent: 'gold' | 'red' | 'success' | 'flame' | 'text';
}) {
  const color =
    accent === 'gold'
      ? Theme.colors.goldHigh
      : accent === 'red'
      ? Theme.colors.imperialRed
      : accent === 'success'
      ? Theme.colors.success
      : accent === 'flame'
      ? '#E6A65A'
      : Theme.colors.text;
  return (
    <View style={styles.bigStat}>
      <Text style={[styles.bigValue, { color }]}>{value}</Text>
      <Text style={styles.bigLabel}>{label}</Text>
    </View>
  );
}

function SmallStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.smallStat}>
      <View style={styles.smallIcon}>{icon}</View>
      <View>
        <Text style={styles.smallValue}>{value}</Text>
        <Text style={styles.smallLabel}>{label}</Text>
      </View>
    </View>
  );
}

function RowStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.rowStat}>
      <Text style={styles.rowStatValue}>{value}</Text>
      <Text style={styles.rowStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,7,10,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  card: {
    width: '100%',
    maxWidth: 760,
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
  headerText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: Theme.colors.gold,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
  },
  aggregateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  bigStat: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: Theme.colors.surfaceHigh,
    alignItems: 'center',
  },
  bigValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  bigLabel: {
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginTop: 2,
  },
  smallStat: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
  },
  smallIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,15,20,0.6)',
  },
  smallValue: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  smallLabel: {
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  sectionLabel: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginTop: 8,
    marginBottom: 6,
  },
  empty: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
    marginBottom: 6,
  },
  resultPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 60,
    alignItems: 'center',
  },
  pillWin: {
    backgroundColor: 'rgba(79,167,106,0.18)',
    borderColor: Theme.colors.success,
  },
  pillLoss: {
    backgroundColor: 'rgba(168,58,58,0.18)',
    borderColor: Theme.colors.imperialRed,
  },
  resultText: {
    color: Theme.colors.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  rowMeta: {
    color: Theme.colors.textSecondary,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  rowStats: {
    flexDirection: 'row',
    gap: 8,
  },
  rowStat: {
    alignItems: 'center',
    minWidth: 40,
  },
  rowStatValue: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '900',
  },
  rowStatLabel: {
    color: Theme.colors.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  clearBtnText: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
