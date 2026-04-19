import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {
  Crown,
  Swords,
  Coins,
  Skull,
  ShieldCheck,
  Trophy,
  Home,
  RefreshCw,
  Sparkles,
  Target,
  Check,
  X,
} from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import type { CampaignOutro } from '../../campaign/recap';
import {
  ALL_NEXT_RUN_BONUS_IDS,
  NEXT_RUN_BONUS_DEFS,
} from '../../campaign/nextRun';
import type { NextRunBonusId } from '../../campaign/types';

interface EndOfMatchProps {
  visible: boolean;
  winnerName: string;
  winnerIsHuman: boolean;
  players: any[];
  matchStats: any;
  onHome: () => void;
  onReplay: () => void;
  /** Resumo da Ascensão na Corte (modo campanha offline) */
  campaignOutro?: CampaignOutro | null;
  /** Escolha de favor para a próxima Ascensão (só campanha). */
  onPickNextAscensionBonus?: (id: NextRunBonusId | null) => void;
}

interface RankedEntry {
  id: string;
  name: string;
  isBot: boolean;
  isWinner: boolean;
  score: number;
  actionsTaken: number;
  challengesWon: number;
  bluffsCaught: number;
  blocksSuccess: number;
  coinsGained: number;
  coinsLost: number;
  cardsLost: number;
  eliminatedAtRound?: number;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function computeScore(s: any): number {
  // Score composto ponderado:
  //  - cada ação: 1
  //  - desafio vencido: 4
  //  - blefe pego: 4
  //  - bloqueio bem sucedido: 3
  //  - blefe sobrevivido: 2
  //  - coin gained: 0.3
  //  - coin lost: -0.15
  //  - card lost: -5
  return (
    (s.actionsTaken || 0) * 1 +
    (s.challengesWon || 0) * 4 +
    (s.bluffsCaught || 0) * 4 +
    (s.blocksSuccess || 0) * 3 +
    (s.bluffsSurvived || 0) * 2 +
    (s.coinsGained || 0) * 0.3 -
    (s.coinsLost || 0) * 0.15 -
    (s.cardsLost || 0) * 5
  );
}

export default function EndOfMatchScreen({
  visible,
  winnerName,
  winnerIsHuman,
  players,
  matchStats,
  onHome,
  onReplay,
  campaignOutro,
  onPickNextAscensionBonus,
}: EndOfMatchProps) {
  const [pickedBonus, setPickedBonus] = useState<NextRunBonusId | null>(null);
  const ranked = useMemo<RankedEntry[]>(() => {
    if (!matchStats?.perPlayer) return [];
    return players
      .map((p) => {
        const s = matchStats.perPlayer[p.id] || {};
        return {
          id: p.id,
          name: p.name,
          isBot: p.isBot,
          isWinner: p.name === winnerName,
          score: computeScore(s),
          actionsTaken: s.actionsTaken || 0,
          challengesWon: s.challengesWon || 0,
          bluffsCaught: s.bluffsCaught || 0,
          blocksSuccess: s.blocksSuccess || 0,
          coinsGained: s.coinsGained || 0,
          coinsLost: s.coinsLost || 0,
          cardsLost: s.cardsLost || 0,
          eliminatedAtRound: s.eliminatedAtRound,
        };
      })
      .sort((a, b) => {
        if (a.isWinner && !b.isWinner) return -1;
        if (!a.isWinner && b.isWinner) return 1;
        return b.score - a.score;
      });
  }, [matchStats, players, winnerName]);

  if (!visible) return null;

  const rounds = matchStats?.round ?? 1;
  const durationMs =
    matchStats?.endedAt && matchStats?.startedAt
      ? matchStats.endedAt - matchStats.startedAt
      : 0;

  const mvp = ranked[0];

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Título de vitória/derrota */}
          <View
            style={[
              styles.banner,
              winnerIsHuman ? styles.bannerWin : styles.bannerLoss,
            ]}
          >
            {winnerIsHuman ? (
              <Trophy color={Theme.colors.gold} size={28} />
            ) : (
              <Skull color={Theme.colors.imperialRed} size={28} />
            )}
            <Text
              style={[
                styles.bannerTitle,
                winnerIsHuman
                  ? { color: Theme.colors.goldHigh }
                  : { color: Theme.colors.imperialRed },
              ]}
            >
              {winnerIsHuman ? 'VITÓRIA REAL!' : 'DERROTA'}
            </Text>
            <Text style={styles.bannerSub}>
              {winnerIsHuman
                ? `O trono é seu, ${winnerName}.`
                : `O reino agora pertence a ${winnerName}.`}
            </Text>
          </View>

          {campaignOutro && (
            <View style={styles.campaignBlock}>
              <View style={styles.campaignHeader}>
                <Target size={14} color={Theme.colors.gold} />
                <Text style={styles.campaignKicker}>ASCENSÃO NA CORTE</Text>
              </View>
              <Text style={styles.campaignFlavor}>{campaignOutro.flavor}</Text>
              {campaignOutro.winStreak != null && campaignOutro.winStreak >= 2 && (
                <Text style={styles.campaignStreak}>
                  Sequência: {campaignOutro.winStreak} vitórias na Ascensão
                </Text>
              )}
              {campaignOutro.promoted && (
                <Text style={styles.campaignPromo}>
                  ✦ Novo posto na corte desbloqueado
                </Text>
              )}
              <Text style={styles.campaignRankLine}>
                Posto atual:{' '}
                <Text style={styles.campaignRankName}>
                  {campaignOutro.rankTitle.toUpperCase()}
                </Text>
                {campaignOutro.nextRankTitle ? (
                  <Text style={styles.campaignNext}>
                    {' '}
                    · Próximo: {campaignOutro.nextRankTitle}
                  </Text>
                ) : null}
              </Text>
              <Text style={styles.challengeTitle}>Desafios da mesa</Text>
              {campaignOutro.challenges.map((c) => (
                <View key={c.id} style={styles.challengeRow}>
                  {c.ok ? (
                    <Check size={14} color={Theme.colors.success} />
                  ) : (
                    <X size={14} color={Theme.colors.textMuted} />
                  )}
                  <Text
                    style={[
                      styles.challengeText,
                      !c.ok && styles.challengeTextMuted,
                    ]}
                  >
                    {c.title}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {campaignOutro && onPickNextAscensionBonus && (
            <View style={styles.bonusPickBlock}>
              <Text style={styles.bonusPickKicker}>PRÓXIMA ASCENSÃO</Text>
              <Text style={styles.bonusPickHint}>
                Escolha um favor da corte (vale só na próxima partida da
                campanha).
              </Text>
              {ALL_NEXT_RUN_BONUS_IDS.map((id) => {
                const def = NEXT_RUN_BONUS_DEFS[id];
                const sel = pickedBonus === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.bonusRow, sel && styles.bonusRowSelected]}
                    onPress={() => {
                      const next = sel ? null : id;
                      setPickedBonus(next);
                      onPickNextAscensionBonus(next);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.bonusTitle}>{def.title}</Text>
                    <Text style={styles.bonusDesc}>{def.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Resumo da partida */}
          <View style={styles.summaryRow}>
            <SummaryItem
              icon={<Swords size={14} color={Theme.colors.gold} />}
              label="RODADAS"
              value={String(rounds)}
            />
            <SummaryItem
              icon={<Sparkles size={14} color={Theme.colors.gold} />}
              label="DURAÇÃO"
              value={formatDuration(durationMs)}
            />
            <SummaryItem
              icon={<Crown size={14} color={Theme.colors.gold} />}
              label="MVP"
              value={mvp?.name?.toUpperCase() || '—'}
            />
          </View>

          {/* Ranking */}
          <View style={styles.rankBlock}>
            <Text style={styles.rankTitle}>CLASSIFICAÇÃO DA CORTE</Text>
            {ranked.map((r, i) => (
              <View
                key={r.id}
                style={[
                  styles.rankRow,
                  r.isWinner && styles.rankRowWin,
                  i === 0 && !r.isWinner && styles.rankRowMvp,
                ]}
              >
                <View style={styles.rankLeft}>
                  <Text style={styles.rankPos}>#{i + 1}</Text>
                  <View>
                    <Text style={styles.rankName}>
                      {r.name.toUpperCase()}
                      {r.isWinner ? '  👑' : ''}
                    </Text>
                    <Text style={styles.rankScore}>
                      PONTUAÇÃO {Math.round(r.score)}
                    </Text>
                  </View>
                </View>

                <View style={styles.rankStats}>
                  <StatChip
                    icon={<Swords size={10} color={Theme.colors.text} />}
                    value={r.actionsTaken}
                    label="AÇÕES"
                  />
                  <StatChip
                    icon={<ShieldCheck size={10} color={Theme.colors.success} />}
                    value={r.challengesWon}
                    label="DESAF."
                  />
                  <StatChip
                    icon={<Sparkles size={10} color={Theme.colors.bluff} />}
                    value={r.bluffsCaught}
                    label="BLEFES"
                  />
                  <StatChip
                    icon={<Coins size={10} color={Theme.colors.gold} />}
                    value={r.coinsGained}
                    label="MOEDAS"
                  />
                  <StatChip
                    icon={<Skull size={10} color={Theme.colors.imperialRed} />}
                    value={r.cardsLost}
                    label="PERDAS"
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Footer com ações */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, styles.footerBtnSecondary]}
            onPress={onHome}
            accessibilityRole="button"
          >
            <Home size={16} color={Theme.colors.text} />
            <Text style={styles.footerBtnText}>INÍCIO</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.footerBtn, styles.footerBtnPrimary]}
            onPress={onReplay}
            accessibilityRole="button"
          >
            <RefreshCw size={16} color="#0B0F14" />
            <Text style={[styles.footerBtnText, { color: '#0B0F14' }]}>
              {campaignOutro ? 'VOLTAR À CORTE' : 'NOVA BATALHA'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryIconRow}>{icon}</View>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function StatChip({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.chip}>
      {icon}
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 7, 10, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    zIndex: 3000,
  },
  card: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '96%',
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.gold,
    overflow: 'hidden',
    ...Theme.shadows.premium,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 6,
  },
  banner: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    marginBottom: 12,
  },
  bannerWin: {
    backgroundColor: 'rgba(198, 161, 91, 0.14)',
    borderColor: Theme.colors.gold,
  },
  bannerLoss: {
    backgroundColor: 'rgba(168, 58, 58, 0.16)',
    borderColor: Theme.colors.imperialRed,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: 2,
  },
  bannerSub: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  campaignBlock: {
    marginBottom: 12,
    padding: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(198, 161, 91, 0.06)',
    gap: 6,
  },
  campaignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  campaignKicker: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  campaignFlavor: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  campaignPromo: {
    color: Theme.colors.success,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  campaignRankLine: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  campaignRankName: {
    color: Theme.colors.text,
    fontWeight: '900',
  },
  campaignNext: {
    color: Theme.colors.textMuted,
    fontWeight: '600',
  },
  challengeTitle: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 6,
  },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  challengeText: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  challengeTextMuted: {
    color: Theme.colors.textMuted,
  },
  campaignStreak: {
    color: Theme.colors.goldSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  bonusPickBlock: {
    marginBottom: 12,
    padding: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(198, 161, 91, 0.35)',
    backgroundColor: 'rgba(15, 22, 32, 0.6)',
    gap: 8,
  },
  bonusPickKicker: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  bonusPickHint: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  bonusRow: {
    padding: 10,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  bonusRowSelected: {
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(198, 161, 91, 0.12)',
  },
  bonusTitle: {
    color: Theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bonusDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: Theme.colors.surfaceHigh,
    alignItems: 'center',
    gap: 4,
  },
  summaryIconRow: {
    marginBottom: 2,
  },
  summaryValue: {
    color: Theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  summaryLabel: {
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
  },
  rankBlock: {
    gap: 8,
  },
  rankTitle: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
    gap: 10,
  },
  rankRowWin: {
    borderColor: Theme.colors.gold,
    backgroundColor: 'rgba(198, 161, 91, 0.08)',
  },
  rankRowMvp: {
    borderColor: Theme.colors.goldLine,
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  rankPos: {
    color: Theme.colors.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    minWidth: 26,
  },
  rankName: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  rankScore: {
    color: Theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: 2,
  },
  rankStats: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '60%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Theme.radius.sm,
    backgroundColor: 'rgba(11,15,20,0.6)',
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
  },
  chipValue: {
    color: Theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
  },
  chipLabel: {
    color: Theme.colors.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.goldLine,
    backgroundColor: Theme.colors.secondary,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
  },
  footerBtnSecondary: {
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
  },
  footerBtnPrimary: {
    borderColor: Theme.colors.gold,
    backgroundColor: Theme.colors.gold,
  },
  footerBtnText: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
});

export { computeScore };
