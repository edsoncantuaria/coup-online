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
}

const FLAVOR_WIN = [
  'O conselho murmura: sua ascensão não passa despercebida.',
  'Um passo à frente na escada de ouro — e novos inimigos.',
  'A rainha observa. O tabuleiro inclina-se a seu favor.',
];

const FLAVOR_LOSS = [
  'O conselho hesita. Hoje não é seu dia de brilhar.',
  'Você recua — mas na corte, quem cai levanta com astúcia.',
  'Tramas se emaranham. Volte mais forte.',
];

function pickFlavor(won: boolean): string {
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

  let newProgress: CampaignProgressState;
  if (won) {
    newProgress = applyWin(progressBefore);
  } else {
    newProgress = applyLoss(progressBefore);
  }

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
    flavor: pickFlavor(won),
  };

  return { newProgress, outro };
}
