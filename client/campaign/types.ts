export type ChallengeId = 'iron_will' | 'duelist' | 'ascetic';

export interface CampaignRunState {
  rankIndex: number;
  rankId: string;
  challengeIds: ChallengeId[];
  tally: { income: number };
}

export interface CampaignProgressState {
  /** Índice em RANKS (0..n-1) */
  rankIndex: number;
  /** Vitórias acumuladas no posto atual */
  winsInRank: number;
  /** IDs de postos já conquistados (cosmético / títulos) */
  unlockedRankIds: string[];
}
