export type Role = 'duke' | 'assassin' | 'captain' | 'contessa' | 'inquisitor';

export interface Action {
  type: 'income' | 'foreign_aid' | 'tax' | 'steal' | 'assassinate' | 'exchange' | 'examine' | 'coup';
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
  phase: 'action' | 'challenge' | 'block' | 'reveal' | 'examine_resolve' | 'game_over';
  currentAction?: Action;
  lastAction?: Action;
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
  responses: Record<string, 'pass' | 'challenge' | 'block' | 'allow'>;
}
