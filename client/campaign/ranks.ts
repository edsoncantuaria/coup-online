import type { BotPersonality } from '../utils/storage';

export interface RankDefinition {
  id: string;
  title: string;
  winsRequired: number;
  bots: number;
  personalities: BotPersonality[];
  opponentArchetypes: string[];
  prelude: string;
}

/**
 * Ascensão na Corte — progressão leve. Cada posto aumenta bots e mistura personalidades.
 */
export const RANKS: RankDefinition[] = [
  {
    id: 'plebeu',
    title: 'Plebeu',
    winsRequired: 1,
    bots: 1,
    personalities: ['cautious'],
    opponentArchetypes: ['O Cético'],
    prelude: 'Ninguém te conhece. Um único rival testa se você merece subir.',
  },
  {
    id: 'mercador',
    title: 'Mercador',
    winsRequired: 1,
    bots: 2,
    personalities: ['balanced', 'bluffer'],
    opponentArchetypes: ['O Equilibrado', 'O Mentiroso'],
    prelude: 'O comércio de favores começa: dois adversários, e um deles adora blefar.',
  },
  {
    id: 'nobre',
    title: 'Nobre',
    winsRequired: 2,
    bots: 3,
    personalities: ['cautious', 'tyrant', 'balanced'],
    opponentArchetypes: ['O Prudente', 'O Tirano', 'O Neutro'],
    prelude: 'A corte observa. Três facções disputam sua ascensão.',
  },
  {
    id: 'conselheiro',
    title: 'Conselheiro',
    winsRequired: 2,
    bots: 3,
    personalities: ['bluffer', 'tyrant', 'balanced'],
    opponentArchetypes: ['O Paranoico', 'O Carrasco', 'O Calculista'],
    prelude: 'Conselhos são armadilhas. Pressão e blefe em cada mesa.',
  },
  {
    id: 'regente',
    title: 'Regente',
    winsRequired: 2,
    bots: 4,
    personalities: ['tyrant', 'bluffer', 'cautious', 'balanced'],
    opponentArchetypes: [
      'O Imperativo',
      'O Embusteiro',
      'O Paciente',
      'O Volúvel',
    ],
    prelude: 'Quatro vozes na sala — um erro e você cai do pedestal.',
  },
  {
    id: 'imperador',
    title: 'Imperador',
    winsRequired: 3,
    bots: 5,
    personalities: ['tyrant', 'bluffer', 'tyrant', 'cautious', 'balanced'],
    opponentArchetypes: [
      'O Sábio Cruel',
      'A Máscara',
      'O Carrasco',
      'O Estrategista',
      'O Fantasma',
    ],
    prelude: 'O trono é uma miragem de ouro. Cinco predadores, uma coroa.',
  },
];
