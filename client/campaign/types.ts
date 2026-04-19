export type ChallengeId = 'iron_will' | 'duelist' | 'ascetic';

/** Escolha após partida — vale só para a próxima Ascensão. */
export type NextRunBonusId = 'coffer' | 'informant' | 'high_stakes';

export interface CampaignRunState {
  rankIndex: number;
  rankId: string;
  challengeIds: ChallengeId[];
  tally: { income: number };
  /** Bônus ativo nesta partida (escolhido ao fim da anterior). */
  activeBonus?: NextRunBonusId | null;
  /** Dica de informante: uma carta vista de um bot (só UI). */
  intelHint?: { botName: string; role: string } | null;
}

export interface CampaignProgressState {
  /** Índice em RANKS (0..n-1) */
  rankIndex: number;
  /** Vitórias acumuladas no posto atual */
  winsInRank: number;
  /** IDs de postos já conquistados (cosmético / títulos) */
  unlockedRankIds: string[];
  /** Vitórias consecutivas na Ascensão (reseta ao perder). */
  winStreak: number;
}
