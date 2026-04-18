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

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  coins: number;
  cards: Card[];
  deadCards: Role[];
  isConnected: boolean;
  isReady: boolean;
}

export interface GameState {
  roomId: string;
  players: Player[];
  deck: Role[];
  turnIndex: number;
  phase: 'action' | 'challenge' | 'block' | 'reveal' | 'losing_influence' | 'exchanging' | 'game_over';
  currentAction?: Action;
  lastAction?: Action;
  exchangingCards?: Role[];
  losingInfluenceId?: string; // Player ID choice to lose influence
  pendingChallenge?: {
    challengerId: string;
    targetId: string;
    actionType: string;
  };
  pendingBlock?: {
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
}
