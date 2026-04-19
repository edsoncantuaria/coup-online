import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Crown,
  ChevronRight,
  Swords,
  Target,
  Sparkles,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../constants/Theme';
import { RANKS } from '../../campaign/ranks';
import { clampRankIndex } from '../../campaign/progress';
import { getCampaignProgress, getPendingNextRunBonus } from '../../utils/storage';
import { NEXT_RUN_BONUS_DEFS } from '../../campaign/nextRun';
import type { NextRunBonusId } from '../../campaign/types';
import type { CampaignProgressState } from '../../campaign/types';
import { CHALLENGE_DEFS } from '../../campaign/challenges';

type Props = {
  visible: boolean;
  playerName: string;
  onClose: () => void;
  onStartAscension: () => void;
};

export default function CampaignModal({
  visible,
  playerName,
  onClose,
  onStartAscension,
}: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<CampaignProgressState | null>(null);
  const [pendingBonus, setPendingBonus] = useState<NextRunBonusId | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    (async () => {
      const [p, bonus] = await Promise.all([
        getCampaignProgress(),
        getPendingNextRunBonus(),
      ]);
      setProgress(p);
      setPendingBonus(bonus);
      setLoading(false);
    })();
  }, [visible]);

  const idx = progress ? clampRankIndex(progress.rankIndex) : 0;
  const rank = RANKS[idx];
  const isMax = idx >= RANKS.length - 1;
  const progressPct =
    progress && rank
      ? Math.min(1, progress.winsInRank / rank.winsRequired)
      : 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { paddingBottom: Math.max(16, insets.bottom + 12) },
          ]}
        >
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X color={Theme.colors.textMuted} size={20} />
          </Pressable>

          <View style={styles.header}>
            <Crown color={Theme.colors.gold} size={28} />
            <Text style={styles.title}>ASCENSÃO NA CORTE</Text>
            <Text style={styles.sub}>
              Suba de plebeu a imperador. Cada vitória abre novos rivais e
              desafios.
            </Text>
          </View>

          {loading || !progress || !rank ? (
            <ActivityIndicator color={Theme.colors.gold} style={{ margin: 24 }} />
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              <View style={styles.rankCard}>
                <Text style={styles.rankKicker}>SEU POSTO</Text>
                <Text style={styles.rankTitle}>{rank.title}</Text>
                <Text style={styles.rankPrelude}>{rank.prelude}</Text>

                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${progressPct * 100}%` }]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {progress.winsInRank} / {rank.winsRequired} vitórias
                  {isMax && progress.winsInRank >= rank.winsRequired
                    ? ' · Mestre da Corte'
                    : ''}
                </Text>
                {(progress.winStreak ?? 0) >= 2 && (
                  <Text style={styles.streakLine}>
                    Sequência: {progress.winStreak ?? 0} vitórias
                  </Text>
                )}
              </View>

              {pendingBonus && (
                <View style={styles.pendingBonus}>
                  <Text style={styles.pendingBonusKicker}>FAVOR PENDENTE</Text>
                  <Text style={styles.pendingBonusTitle}>
                    {NEXT_RUN_BONUS_DEFS[pendingBonus].title}
                  </Text>
                  <Text style={styles.pendingBonusBody}>
                    {NEXT_RUN_BONUS_DEFS[pendingBonus].description}
                  </Text>
                </View>
              )}

              <View style={styles.opponentsBlock}>
                <View style={styles.blockTitleRow}>
                  <Swords size={12} color={Theme.colors.gold} />
                  <Text style={styles.blockTitle}>RIVAIS DESTE POSTO</Text>
                </View>
                {rank.opponentArchetypes.map((label, i) => (
                  <Text key={i} style={styles.opponentLine}>
                    · {label}
                  </Text>
                ))}
              </View>

              <View style={styles.challengeHint}>
                <Target size={14} color={Theme.colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.challengeHintTitle}>Próxima partida</Text>
                  <Text style={styles.challengeHintBody}>
                    Ao iniciar, você recebe 2 desafios aleatórios (ex.: sem
                    Renda, sem perder carta…). Cumprir não é obrigatório para
                    subir — mas prova sua astúcia.
                  </Text>
                </View>
              </View>

              <View style={styles.pool}>
                <Text style={styles.poolTitle}>POOL DE DESAFIOS</Text>
                {Object.entries(CHALLENGE_DEFS).map(([id, d]) => (
                  <Text key={id} style={styles.poolLine}>
                    <Sparkles size={10} color={Theme.colors.textMuted} />{' '}
                    <Text style={styles.poolName}>{d.title}</Text> — {d.description}
                  </Text>
                ))}
              </View>
            </ScrollView>
          )}

          {!loading && progress && rank && (
            <Pressable
              style={styles.primaryWrap}
              onPress={onStartAscension}
              disabled={!playerName.trim()}
            >
              <LinearGradient
                colors={[
                  Theme.colors.goldHigh,
                  Theme.colors.gold,
                  Theme.colors.goldSoft,
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.primaryBtn,
                  !playerName.trim() && { opacity: 0.45 },
                ]}
              >
                <Text style={styles.primaryText}>ENTRAR NA ARENA</Text>
                <ChevronRight color="#1A1306" size={20} />
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    maxHeight: '92%',
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 2,
    padding: 6,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  title: {
    fontFamily: Theme.fonts.serif,
    color: Theme.colors.gold,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 6,
  },
  sub: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  scroll: {
    paddingBottom: 8,
    gap: 12,
  },
  rankCard: {
    padding: 14,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: Theme.colors.surfaceHigh,
  },
  rankKicker: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  rankTitle: {
    color: Theme.colors.gold,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 4,
    fontFamily: Theme.fonts.serif,
  },
  rankPrelude: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(198,161,91,0.15)',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Theme.colors.gold,
    borderRadius: 4,
  },
  progressLabel: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  streakLine: {
    color: Theme.colors.goldSoft,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  pendingBonus: {
    padding: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(198, 161, 91, 0.45)',
    backgroundColor: 'rgba(198, 161, 91, 0.08)',
    gap: 4,
  },
  pendingBonusKicker: {
    color: Theme.colors.gold,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
  },
  pendingBonusTitle: {
    color: Theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  pendingBonusBody: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  opponentsBlock: {
    padding: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  blockTitle: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  opponentLine: {
    color: Theme.colors.text,
    fontSize: 12,
    lineHeight: 20,
  },
  challengeHint: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: Theme.radius.md,
    backgroundColor: 'rgba(198,161,91,0.06)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  challengeHintTitle: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  challengeHintBody: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  pool: {
    paddingVertical: 8,
  },
  poolTitle: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  poolLine: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 17,
    marginBottom: 4,
  },
  poolName: {
    color: Theme.colors.text,
    fontWeight: '800',
  },
  primaryWrap: {
    marginTop: 8,
    borderRadius: Theme.radius.md,
    overflow: 'hidden',
    ...Theme.shadows.goldGlow,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  primaryText: {
    color: '#1A1306',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
