import { RANKS } from './ranks';
import { CHALLENGE_DEFS, evaluateChallenge } from './challenges';
import { applyLoss, applyWin, clampRankIndex } from './progress';
import type { CampaignProgressState, CampaignRunState } from './types';
import type { PlayerStats } from '../engine/types';

export interface CampaignOutro {
  rankTitle: string;
  rankId: string;
  promoted: boolean;
  nextRankTitle: string | null;
  challenges: { id: string; title: string; ok: boolean }[];
  /** Frase narrativa curta */
  flavor: string;
  /** Vitórias seguidas após esta partida (se venceu). */
  winStreak?: number;
}

const FLAVOR_WIN = [
  'O conselho murmura: sua ascensão não passa despercebida.',
  'Um passo à frente na escada de ouro — e novos inimigos.',
  'A rainha observa. O tabuleiro inclina-se a seu favor.',
];

const FLAVOR_WIN_PROMOTED = [
  'Você sobe de posto: a corte aprende a pronunciar seu nome com respeito.',
  'Um novo selo na sua linhagem. Os corredores falam de você.',
  'A ascensão é real — rivais medem palavras quando você passa.',
];

const FLAVOR_WIN_STREAK = [
  'Sequência impressionante. Até os céticos baixam o tom.',
  'Vitória sobre vitória — o tabuleiro parece inclinar-se ao seu costume de vencer.',
  'O conselho anota: não é sorte, é domínio.',
];

const FLAVOR_LOSS = [
  'O conselho hesita. Hoje não é seu dia de brilhar.',
  'Você recua — mas na corte, quem cai levanta com astúcia.',
  'Tramas se emaranham. Volte mais forte.',
];

const FLAVOR_LOSS_HIGH_STAKES = [
  'A aposta saiu cara. A corte não perdoa facilmente um revés assim.',
  'O risco cobrou seu preço — mas quem não arrisca não reina.',
];

function pickFlavor(
  won: boolean,
  opts: {
    promoted: boolean;
    winStreakAfter: number;
    highStakesLoss: boolean;
  }
): string {
  if (!won && opts.highStakesLoss) {
    const pool = FLAVOR_LOSS_HIGH_STAKES;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
  if (won && opts.promoted) {
    const pool = FLAVOR_WIN_PROMOTED;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
  if (won && opts.winStreakAfter >= 3) {
    const pool = FLAVOR_WIN_STREAK;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
  const pool = won ? FLAVOR_WIN : FLAVOR_LOSS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Resolve progressão e cartela de fim de missão da campanha.
 */
export function resolveCampaignRecap(
  won: boolean,
  humanStats: PlayerStats | undefined,
  tally: { income: number },
  run: CampaignRunState,
  progressBefore: CampaignProgressState
): { newProgress: CampaignProgressState; outro: CampaignOutro } {
  const rank = RANKS[clampRankIndex(run.rankIndex)];
  const rankTitle = rank?.title ?? '?';
  const rankId = rank?.id ?? run.rankId;

  const challengeResults = run.challengeIds.map((id) => ({
    id,
    title: CHALLENGE_DEFS[id].title,
    ok: evaluateChallenge(id, won, humanStats, tally),
  }));

  let newProgress: CampaignProgressState = won
    ? applyWin(progressBefore)
    : applyLoss(progressBefore);

  if (!won && run.activeBonus === 'high_stakes') {
    newProgress = applyLoss(newProgress);
  }

  const winStreakAfter = won
    ? (progressBefore.winStreak ?? 0) + 1
    : 0;

  newProgress = {
    ...newProgress,
    winStreak: winStreakAfter,
  };

  const promoted =
    won && newProgress.rankIndex > progressBefore.rankIndex;

  const nextRank = RANKS[clampRankIndex(newProgress.rankIndex)];
  const nextRankTitle =
    newProgress.rankIndex < RANKS.length ? nextRank?.title ?? null : null;

  const outro: CampaignOutro = {
    rankTitle,
    rankId,
    promoted,
    nextRankTitle,
    challenges: challengeResults,
    flavor: pickFlavor(won, {
      promoted,
      winStreakAfter,
      highStakesLoss: !won && run.activeBonus === 'high_stakes',
    }),
    winStreak: won ? winStreakAfter : undefined,
  };

  return { newProgress, outro };
}
