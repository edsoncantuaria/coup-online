import type { ChallengeId } from './types';
import type { PlayerStats } from '../engine/types';

export const CHALLENGE_DEFS: Record<
  ChallengeId,
  { title: string; description: string }
> = {
  iron_will: {
    title: 'Mão firme',
    description: 'Vença sem perder nenhuma carta.',
  },
  duelist: {
    title: 'Duelista',
    description: 'Vença com 3 ou mais desafios vencidos.',
  },
  ascetic: {
    title: 'Asceta',
    description: 'Vença sem usar Renda.',
  },
};

export const ALL_CHALLENGE_IDS: ChallengeId[] = [
  'iron_will',
  'duelist',
  'ascetic',
];

export function evaluateChallenge(
  id: ChallengeId,
  won: boolean,
  human: PlayerStats | undefined,
  tally: { income: number }
): boolean {
  if (!won || !human) return false;
  switch (id) {
    case 'iron_will':
      return (human.cardsLost || 0) === 0;
    case 'duelist':
      return (human.challengesWon || 0) >= 3;
    case 'ascetic':
      return tally.income === 0;
    default:
      return false;
  }
}

export function pickChallengesForRun(count: number = 2): ChallengeId[] {
  const shuffled = [...ALL_CHALLENGE_IDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, ALL_CHALLENGE_IDS.length));
}
