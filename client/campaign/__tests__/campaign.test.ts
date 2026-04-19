import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RANKS } from '../ranks';
import {
  applyLoss,
  applyWin,
  clampRankIndex,
  DEFAULT_CAMPAIGN_PROGRESS,
} from '../progress';
import {
  ALL_CHALLENGE_IDS,
  evaluateChallenge,
  pickChallengesForRun,
} from '../challenges';
import { resolveCampaignRecap } from '../recap';
import type { CampaignProgressState, CampaignRunState } from '../types';
import { emptyPlayerStats, type PlayerStats } from '../../engine/types';

describe('clampRankIndex', () => {
  it('limita ao intervalo dos postos', () => {
    expect(clampRankIndex(-5)).toBe(0);
    expect(clampRankIndex(RANKS.length)).toBe(RANKS.length - 1);
    expect(clampRankIndex(999)).toBe(RANKS.length - 1);
    expect(clampRankIndex(2)).toBe(2);
  });
});

describe('applyWin / applyLoss', () => {
  it('vitória inicial sobe de Plebeu para Mercador e zera vitórias no novo posto', () => {
    const next = applyWin(DEFAULT_CAMPAIGN_PROGRESS);
    expect(next.rankIndex).toBe(1);
    expect(next.winsInRank).toBe(0);
    expect(next.unlockedRankIds).toContain('plebeu');
  });

  it('vitória no último posto mantém índice e capa winsInRank em winsRequired', () => {
    const last = RANKS.length - 1;
    const lastRank = RANKS[last]!;
    const prev: CampaignProgressState = {
      rankIndex: last,
      winsInRank: lastRank.winsRequired - 1,
      unlockedRankIds: RANKS.map((r) => r.id),
      winStreak: 0,
    };
    const next = applyWin(prev);
    expect(next.rankIndex).toBe(last);
    expect(next.winsInRank).toBe(lastRank.winsRequired);
  });

  it('derrota reduz winsInRank sem descer de posto', () => {
    const prev: CampaignProgressState = {
      rankIndex: 2,
      winsInRank: 1,
      unlockedRankIds: [],
      winStreak: 0,
    };
    const next = applyLoss(prev);
    expect(next.rankIndex).toBe(2);
    expect(next.winsInRank).toBe(0);
  });

  it('derrota com winsInRank 0 mantém 0', () => {
    const next = applyLoss(DEFAULT_CAMPAIGN_PROGRESS);
    expect(next.winsInRank).toBe(0);
  });
});

describe('evaluateChallenge', () => {
  const baseHuman = (): PlayerStats => emptyPlayerStats();

  it('retorna false se não venceu ou sem stats humanas', () => {
    const h = baseHuman();
    expect(evaluateChallenge('iron_will', false, h, { income: 0 })).toBe(false);
    expect(evaluateChallenge('iron_will', true, undefined, { income: 0 })).toBe(
      false
    );
  });

  it('iron_will: exige zero cartas perdidas', () => {
    const ok = { ...baseHuman(), cardsLost: 0 };
    const bad = { ...baseHuman(), cardsLost: 1 };
    expect(evaluateChallenge('iron_will', true, ok, { income: 0 })).toBe(true);
    expect(evaluateChallenge('iron_will', true, bad, { income: 0 })).toBe(
      false
    );
  });

  it('duelist: exige 3+ desafios vencidos', () => {
    const low = { ...baseHuman(), challengesWon: 2 };
    const high = { ...baseHuman(), challengesWon: 3 };
    expect(evaluateChallenge('duelist', true, low, { income: 0 })).toBe(false);
    expect(evaluateChallenge('duelist', true, high, { income: 0 })).toBe(true);
  });

  it('ascetic: exige nenhuma renda contabilizada no tally da run', () => {
    const h = baseHuman();
    expect(evaluateChallenge('ascetic', true, h, { income: 0 })).toBe(true);
    expect(evaluateChallenge('ascetic', true, h, { income: 1 })).toBe(false);
  });
});

describe('pickChallengesForRun', () => {
  it('retorna no máximo count ids válidos e sem repetir', () => {
    const picked = pickChallengesForRun(2);
    expect(picked.length).toBeLessThanOrEqual(2);
    expect(new Set(picked).size).toBe(picked.length);
    for (const id of picked) {
      expect(ALL_CHALLENGE_IDS).toContain(id);
    }
  });
});

describe('resolveCampaignRecap', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runBase = (): CampaignRunState => ({
    rankIndex: 0,
    rankId: RANKS[0]!.id,
    challengeIds: ['iron_will', 'ascetic'],
    tally: { income: 0 },
  });

  it('vitória aplica applyWin e marca promoted ao subir de posto', () => {
    const { newProgress, outro } = resolveCampaignRecap(
      true,
      { ...emptyPlayerStats(), cardsLost: 0 },
      { income: 0 },
      runBase(),
      DEFAULT_CAMPAIGN_PROGRESS
    );
    expect(newProgress.rankIndex).toBe(1);
    expect(outro.promoted).toBe(true);
    expect(newProgress.winStreak).toBe(1);
    expect(outro.winStreak).toBe(1);
    const iron = outro.challenges.find((c) => c.id === 'iron_will');
    expect(iron?.ok).toBe(true);
  });

  it('aposta alta: derrota aplica duas perdas de prestígio no posto', () => {
    const prev: CampaignProgressState = {
      rankIndex: 2,
      winsInRank: 2,
      unlockedRankIds: [],
      winStreak: 2,
    };
    const run: CampaignRunState = {
      ...runBase(),
      activeBonus: 'high_stakes',
    };
    const { newProgress } = resolveCampaignRecap(
      false,
      emptyPlayerStats(),
      { income: 0 },
      run,
      prev
    );
    expect(newProgress.winsInRank).toBe(0);
    expect(newProgress.winStreak).toBe(0);
  });

  it('derrota aplica applyLoss e challenges ficam false', () => {
    const human: PlayerStats = {
      ...emptyPlayerStats(),
      cardsLost: 0,
      challengesWon: 5,
    };
    const { newProgress, outro } = resolveCampaignRecap(
      false,
      human,
      { income: 0 },
      runBase(),
      DEFAULT_CAMPAIGN_PROGRESS
    );
    expect(newProgress.winsInRank).toBe(0);
    expect(outro.promoted).toBe(false);
    expect(outro.challenges.every((c) => c.ok === false)).toBe(true);
  });
});
