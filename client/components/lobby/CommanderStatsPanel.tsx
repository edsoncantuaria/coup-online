import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Trophy, Flame, Swords, Target } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import type {
  HistoryAggregate,
  MatchHistoryEntry,
} from '../../utils/storage';

interface Props {
  aggregate: HistoryAggregate;
  recent: MatchHistoryEntry[];
  onOpenHistory: () => void;
  compact?: boolean;
}

export default function CommanderStatsPanel({
  aggregate,
  recent,
  onOpenHistory,
  compact = false,
}: Props) {
  const hasData = aggregate.total > 0;
  const winPercent = Math.round(aggregate.winRate * 100);

  return (
    <Pressable
      onPress={hasData ? onOpenHistory : undefined}
      style={({ pressed }) => [
        styles.wrap,
        compact && styles.wrapCompact,
        pressed && hasData && { opacity: 0.85 },
      ]}
      accessibilityLabel="Abrir histórico de partidas"
      accessibilityRole="button"
    >
      <View style={styles.headerRow}>
        <Trophy size={12} color={Theme.colors.gold} />
        <Text style={styles.header}>ANAIS DE COMBATE</Text>
        {hasData && (
          <Text style={styles.headerAction}>VER ›</Text>
        )}
      </View>

      {!hasData ? (
        <Text style={styles.empty} numberOfLines={compact ? 2 : 3}>
          Nenhuma batalha registrada ainda. Comece uma campanha para entrar para a história.
        </Text>
      ) : (
        <>
          <View style={styles.mainRow}>
            <View style={styles.wrColumn}>
              <Text style={[styles.wrValue, compact && styles.wrValueCompact]}>
                {winPercent}%
              </Text>
              <Text style={styles.wrLabel}>TAXA DE VITÓRIA</Text>
              <Text style={styles.wrFraction}>
                {aggregate.wins}V · {aggregate.losses}D · {aggregate.total} BATALHAS
              </Text>
            </View>

            <View style={styles.miniStats}>
              <MiniStat
                icon={<Flame size={10} color={Theme.colors.imperialRed} />}
                value={
                  aggregate.currentStreak === 0
                    ? '0'
                    : aggregate.currentStreak > 0
                    ? `${aggregate.currentStreak}V`
                    : `${-aggregate.currentStreak}D`
                }
                label="SEQ. ATUAL"
              />
              <MiniStat
                icon={<Trophy size={10} color={Theme.colors.gold} />}
                value={String(aggregate.bestWinStreak)}
                label="MELHOR STREAK"
              />
              {!compact && (
                <MiniStat
                  icon={<Target size={10} color={Theme.colors.bluff} />}
                  value={String(aggregate.totalBluffsCaught)}
                  label="BLEFES PEGOS"
                />
              )}
              {!compact && (
                <MiniStat
                  icon={<Swords size={10} color={Theme.colors.success} />}
                  value={String(aggregate.totalChallengesWon)}
                  label="DESAFIOS OK"
                />
              )}
            </View>
          </View>

          {/* Timeline das últimas partidas */}
          {!compact && (
            <View style={styles.timeline}>
              <Text style={styles.timelineLabel}>ÚLTIMAS {Math.min(recent.length, 10)}</Text>
              <View style={styles.timelineRow}>
                {recent.slice(0, 10).map((m) => (
                  <View
                    key={m.id}
                    style={[
                      styles.dot,
                      m.result === 'win' ? styles.dotWin : styles.dotLoss,
                      m.mvp && styles.dotMvp,
                    ]}
                  />
                ))}
                {recent.length === 0 && <Text style={styles.empty}>—</Text>}
              </View>
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

function MiniStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.miniItem}>
      {icon}
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(11, 15, 20, 0.55)',
  },
  wrapCompact: {
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  header: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    flex: 1,
  },
  headerAction: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  empty: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  wrColumn: {
    alignItems: 'flex-start',
    minWidth: 110,
  },
  wrValue: {
    color: Theme.colors.goldHigh,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 32,
  },
  wrValueCompact: {
    fontSize: 22,
    lineHeight: 24,
  },
  wrLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginTop: 2,
  },
  wrFraction: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 3,
  },
  miniStats: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  miniItem: {
    minWidth: 76,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Theme.radius.sm,
    backgroundColor: 'rgba(22,29,39,0.85)',
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    alignItems: 'center',
  },
  miniValue: {
    color: Theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  miniLabel: {
    color: Theme.colors.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  timeline: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineLabel: {
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  dotWin: {
    backgroundColor: Theme.colors.success,
    borderColor: 'rgba(79,167,106,0.8)',
  },
  dotLoss: {
    backgroundColor: Theme.colors.imperialRed,
    borderColor: 'rgba(168,58,58,0.8)',
  },
  dotMvp: {
    borderColor: Theme.colors.goldHigh,
    borderWidth: 2,
  },
});
