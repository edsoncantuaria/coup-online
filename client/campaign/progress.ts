import { RANKS } from './ranks';
import type { CampaignProgressState } from './types';

export const DEFAULT_CAMPAIGN_PROGRESS: CampaignProgressState = {
  rankIndex: 0,
  winsInRank: 0,
  unlockedRankIds: [],
  winStreak: 0,
};

export function clampRankIndex(idx: number): number {
  return Math.max(0, Math.min(RANKS.length - 1, idx));
}

/**
 * Aplica vitória: avança no posto ou sobe de ranque.
 */
export function applyWin(
  prev: CampaignProgressState
): CampaignProgressState {
  const idx = clampRankIndex(prev.rankIndex);
  const rank = RANKS[idx];
  if (!rank) return prev;

  const unlocked = [...prev.unlockedRankIds];
  let rankIndex = idx;
  let winsInRank = prev.winsInRank + 1;

  if (winsInRank >= rank.winsRequired) {
    if (!unlocked.includes(rank.id)) unlocked.push(rank.id);
    if (rankIndex < RANKS.length - 1) {
      rankIndex += 1;
      winsInRank = 0;
    } else {
      winsInRank = rank.winsRequired;
    }
  }

  return {
    rankIndex,
    winsInRank,
    unlockedRankIds: unlocked,
    winStreak: prev.winStreak ?? 0,
  };
}

/**
 * Derrota: recua um pouco no posto atual (nunca abaixo de 0).
 */
export function applyLoss(prev: CampaignProgressState): CampaignProgressState {
  return {
    ...prev,
    winsInRank: Math.max(0, prev.winsInRank - 1),
  };
}
