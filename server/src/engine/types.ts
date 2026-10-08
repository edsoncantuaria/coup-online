export type Role = 'duke' | 'assassin' | 'captain' | 'contessa' | 'ambassador';

export interface Action {
  type: 'income' | 'foreign_aid' | 'tax' | 'steal' | 'assassinate' | 'exchange' | 'coup';
  source: string;
  target?: string;
  payload?: any;
}

export interface Card {
  role: Role;
  isFlipped: boolean;
}

export type BotPersonality = 'cautious' | 'tyrant' | 'bluffer' | 'balanced';

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  coins: number;
  cards: Card[];
  deadCards: Role[];
  isConnected: boolean;
  isReady: boolean;
  personality?: BotPersonality;
}

export interface GameState {
  roomId: string;
  players: Player[];
  deck: Role[];
  turnIndex: number;
  phase: 'action' | 'challenge' | 'block' | 'reveal' | 'losing_influence' | 'exchanging' | 'game_over';
  currentAction?: Action | null;
  lastAction?: Action;
  exchangingCards?: Role[];
  losingInfluenceId?: string; // Player ID choice to lose influence
  /**
   * Motivo narrativo da perda atual (para overlay dramático).
   *  - coup: alvo de um Golpe
   *  - assassinate: alvo de Assassinato resolvido
   *  - challenge_lost: desafiante errou (quem foi desafiado provou a carta)
   *  - bluff_caught: foi pego blefando (ação ou bloqueio falso)
   */
  losingContext?: {
    reason: 'coup' | 'assassinate' | 'challenge_lost' | 'bluff_caught';
    causedByPlayerId?: string;
    stamp: number;
  };
  pendingChallenge?: {
    challengerId: string;
    targetId: string;
    actionType: string;
  };
  pendingBlock?: null | {
    blockerId: string;
    actionType: string;
    role: Role;
  };
  logs: string[];
  winner?: string;
  waitingForResponseIndex: number | null;
  responderCycleStartIndex: number | null;
  responses: Record<string, 'pass' | 'challenge' | 'block' | 'allow'>;
  pendingResolution?: {
    type: 'next_turn' | 'resolve_action' | 'action_fail' | 'allow_block' | 'reopen_block';
  };
  /** Último veredito de desafio para exibir reveal central na UI */
  lastReveal?: {
    role: Role;
    playerName: string;
    playerId: string;
    verdict: 'proven' | 'bluff';
    stamp: number;
  };

  /** Última perda de influência para overlay central de carta caindo */
  lastLoss?: {
    role: Role;
    playerName: string;
    playerId: string;
    stamp: number;
  };

  /** Banner da última ação resolvida (para toast na UI) */
  lastResolved?: {
    actionType: string;
    actorId: string;
    actorName: string;
    targetId?: string;
    targetName?: string;
    summary: string;
    stamp: number;
  };

  /** Estatísticas agregadas da partida para tela final e histórico */
  matchStats?: MatchStats;

  /** Última ação inválida (rejeitada por validateAction) — usada para toast na UI */
  lastInvalid?: {
    reason: string;
    actionType?: string;
    stamp: number;
  };
}

export interface PlayerStats {
  actionsTaken: number;
  challengesMade: number;
  challengesWon: number;
  challengesLost: number;
  bluffsCaught: number;
  bluffsSurvived: number;
  blocksMade: number;
  blocksSuccess: number;
  blocksFailed: number;
  coinsGained: number;
  coinsLost: number;
  cardsLost: number;
  eliminatedAtRound?: number;
}

export interface MatchStats {
  startedAt: number;
  endedAt?: number;
  round: number;
  perPlayer: Record<string, PlayerStats>;
}

export function emptyPlayerStats(): PlayerStats {
  return {
    actionsTaken: 0,
    challengesMade: 0,
    challengesWon: 0,
    challengesLost: 0,
    bluffsCaught: 0,
    bluffsSurvived: 0,
    blocksMade: 0,
    blocksSuccess: 0,
    blocksFailed: 0,
    coinsGained: 0,
    coinsLost: 0,
    cardsLost: 0,
  };
}
