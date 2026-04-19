import React, { useMemo, useState } from 'react';
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
  Globe,
  Zap,
} from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import type { MatchHistoryEntry, MatchHistoryMode } from '../../utils/storage';
import { aggregateHistory } from '../../utils/storage';

interface Props {
  visible: boolean;
  onClose: () => void;
  history: MatchHistoryEntry[];
  onClear: () => void;
}

const MODE_FILTER: { id: MatchHistoryMode | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'quick_offline', label: 'Partida rápida' },
  { id: 'ascension', label: 'Ascensão' },
  { id: 'multiplayer', label: 'Multijogador' },
];

function modeBadgeLabel(mode: MatchHistoryMode): string {
  switch (mode) {
    case 'quick_offline':
      return 'RÁPIDA';
    case 'ascension':
      return 'ASCENSÃO';
    case 'multiplayer':
      return 'ONLINE';
    default:
      return '—';
  }
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
  onClear,
}: Props) {
  const [filter, setFilter] = useState<MatchHistoryMode | 'all'>('all');

  const aggregate = useMemo(
    () => aggregateHistory(history, filter),
    [history, filter]
  );

  const filteredList = useMemo(
    () =>
      filter === 'all'
        ? history
        : history.filter((m) => m.mode === filter),
    [history, filter]
  );

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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {MODE_FILTER.map((opt) => {
              const sel = filter === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.filterChip, sel && styles.filterChipOn]}
                  onPress={() => setFilter(opt.id)}
                >
                  <Text
                    style={[styles.filterChipText, sel && styles.filterChipTextOn]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

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
              icon={<Zap size={12} color={Theme.colors.gold} />}
              value={Math.round(aggregate.avgSkillScore).toString()}
              label="PERF. MÉDIA"
            />
            <SmallStat
              icon={<Crown size={12} color={Theme.colors.goldHigh} />}
              value={Math.round(aggregate.bestSkillScore).toString()}
              label="MELHOR PERF."
            />
            <SmallStat
              icon={<Flame size={12} color={Theme.colors.imperialRed} />}
              value={
                aggregate.currentStreak === 0
                  ? '0'
                  : aggregate.currentStreak > 0
                  ? `${aggregate.currentStreak} VIT.`
                  : `${-aggregate.currentStreak} DER.`
              }
              label="SEQUÊNCIA"
            />
            <SmallStat
              icon={<Target size={12} color={Theme.colors.bluff} />}
              value={String(aggregate.totalBluffsCaught)}
              label="BLEFES PEGOS"
            />
            <SmallStat
              icon={<Swords size={12} color={Theme.colors.success} />}
              value={String(aggregate.totalChallengesWon)}
              label="DESAF. OK"
            />
            <SmallStat
              icon={<Coins size={12} color={Theme.colors.gold} />}
              value={`${Math.round(aggregate.avgRounds)}R`}
              label="RODADAS Ø"
            />
            <SmallStat
              icon={<Trophy size={12} color={Theme.colors.gold} />}
              value={fmtDuration(aggregate.avgDurationMs)}
              label="TEMPO Ø"
            />
          </View>

          <View style={styles.rankFuture}>
            <Globe size={14} color={Theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rankFutureTitle}>RANKING GLOBAL (EM BREVE)</Text>
              <Text style={styles.rankFutureBody}>
                A pontuação de performance acima usa pesos fixos no aparelho —
                pronta para cruzar com partidas online e gerar um ranking justo
                (ex.: posição 120 entre 1000 jogadores). Isso exigirá conta e
                servidor; por enquanto o histórico permanece local e verificável.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>REGISTROS</Text>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator
          >
            {filteredList.length === 0 ? (
              <Text style={styles.empty}>
                {history.length === 0
                  ? 'Ainda sem entradas. Cada batalha é registrada aqui.'
                  : 'Nenhuma partida neste filtro.'}
              </Text>
            ) : (
              filteredList.map((m) => (
                <View key={m.id} style={styles.row}>
                  <View
                    style={[
                      styles.modePill,
                      m.mode === 'ascension' && styles.modeAsc,
                      m.mode === 'multiplayer' && styles.modeOnline,
                      m.mode === 'quick_offline' && styles.modeQuick,
                    ]}
                  >
                    <Text style={styles.modePillText}>
                      {modeBadgeLabel(m.mode)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.resultPill,
                      m.result === 'win' ? styles.pillWin : styles.pillLoss,
                    ]}
                  >
                    <Text style={styles.resultText}>
                      {m.result === 'win' ? 'V' : 'D'}
                    </Text>
                  </View>

                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>
                      {m.playerName.toUpperCase()}
                      {m.mvp && '  👑 MVP'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {fmtDate(m.playedAt)} · {m.opponents} rivais · {m.rounds}R ·{' '}
                      {fmtDuration(m.durationMs)}
                    </Text>
                    {m.mode === 'ascension' && m.ascensionRankTitle ? (
                      <Text style={styles.rowSub}>
                        Posto: {m.ascensionRankTitle}
                      </Text>
                    ) : null}
                    {m.mode === 'multiplayer' && (m.roomDisplayName || m.roomIdShort) ? (
                      <Text style={styles.rowSub} numberOfLines={1}>
                        Sala: {m.roomDisplayName || m.roomIdShort}
                      </Text>
                    ) : null}
                    <Text style={styles.rowDetail}>
                      Perf. {Math.round(m.skillScore)} · Ações {m.actionsTaken} ·
                      Des. {m.challengesWon}/{m.challengesMade} · Blefes{' '}
                      {m.bluffsCaught} · Bloq. {m.blocksSuccess}/{m.blocksMade} ·
                      Cartas −{m.cardsLost}
                    </Text>
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.smallValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.smallLabel}>{label}</Text>
      </View>
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
    maxWidth: 820,
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
    marginBottom: 10,
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
  },
  filterChipOn: {
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(198, 161, 91, 0.12)',
  },
  filterChipText: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  filterChipTextOn: {
    color: Theme.colors.gold,
  },
  aggregateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  rankFuture: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    marginBottom: 8,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: 'rgba(11,15,20,0.5)',
  },
  rankFutureTitle: {
    color: Theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
  },
  rankFutureBody: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
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
    minWidth: 100,
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
    marginTop: 4,
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
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
    marginBottom: 6,
  },
  modePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 56,
    alignItems: 'center',
  },
  modeQuick: {
    borderColor: Theme.colors.textMuted,
    backgroundColor: 'rgba(120,130,140,0.15)',
  },
  modeAsc: {
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(198, 161, 91, 0.12)',
  },
  modeOnline: {
    borderColor: '#6B9FD4',
    backgroundColor: 'rgba(80, 140, 200, 0.12)',
  },
  modePillText: {
    color: Theme.colors.text,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  resultPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 32,
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
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
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
  rowSub: {
    color: Theme.colors.goldSoft,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  rowDetail: {
    color: Theme.colors.textMuted,
    fontSize: 8.5,
    fontWeight: '600',
    lineHeight: 13,
    marginTop: 4,
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
