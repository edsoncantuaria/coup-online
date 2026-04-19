import type { NextRunBonusId } from './types';

export const NEXT_RUN_BONUS_DEFS: Record<
  NextRunBonusId,
  { title: string; description: string }
> = {
  coffer: {
    title: 'Bolsa do tesoureiro',
    description: 'Na próxima ascensão você começa com +1 moeda.',
  },
  informant: {
    title: 'Informante',
    description:
      'Antes da mesa, um sussurro revela uma das cartas de um rival.',
  },
  high_stakes: {
    title: 'Aposta da corte',
    description:
      'Rivais começam com +1 moeda. Se perder, o revés ao prestígio é maior.',
  },
};

export const ALL_NEXT_RUN_BONUS_IDS: NextRunBonusId[] = [
  'coffer',
  'informant',
  'high_stakes',
];
