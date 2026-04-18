import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  playerName: '@coup/player_name',
  muted: '@coup/muted',
  matchHistory: '@coup/match_history_v1',
  resumeSnapshot: '@coup/resume_v1',
  difficulty: '@coup/difficulty_v1',
};

/**
 * Registro individual de uma partida (para histórico + win rate).
 */
export interface MatchHistoryEntry {
  id: string;
  playedAt: number; // timestamp ms
  durationMs: number;
  rounds: number;
  result: 'win' | 'loss';
  opponents: number;
  playerName: string;
  actionsTaken: number;
  challengesMade: number;
  challengesWon: number;
  bluffsCaught: number;
  bluffsSurvived: number;
  blocksMade: number;
  blocksSuccess: number;
  coinsGained: number;
  coinsLost: number;
  cardsLost: number;
  mvp: boolean; // true se o humano foi o maior pontuador do "score" composto
}

const MAX_HISTORY = 50;

export const storage = {
  async getPlayerName(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.playerName);
    } catch {
      return null;
    }
  },
  async setPlayerName(name: string): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.playerName, name);
    } catch {
      /* ignora */
    }
  },
  async getMuted(): Promise<boolean> {
    try {
      const v = await AsyncStorage.getItem(KEYS.muted);
      return v === '1';
    } catch {
      return false;
    }
  },
  async setMuted(muted: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.muted, muted ? '1' : '0');
    } catch {
      /* ignora */
    }
  },
};

/* ------------------------------------------------------------------ */
/* Histórico de partidas                                              */
/* ------------------------------------------------------------------ */

export async function getMatchHistory(): Promise<MatchHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.matchHistory);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendMatchHistory(
  entry: MatchHistoryEntry
): Promise<void> {
  try {
    const list = await getMatchHistory();
    const next = [entry, ...list].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(KEYS.matchHistory, JSON.stringify(next));
  } catch {
    /* ignora */
  }
}

export async function clearMatchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.matchHistory);
  } catch {
    /* ignora */
  }
}

export interface HistoryAggregate {
  total: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
  currentStreak: number; // positivo = vitórias seguidas, negativo = derrotas seguidas
  bestWinStreak: number;
  totalBluffsCaught: number;
  totalChallengesWon: number;
  avgRounds: number;
  avgDurationMs: number;
}

export function aggregateHistory(list: MatchHistoryEntry[]): HistoryAggregate {
  if (list.length === 0) {
    return {
      total: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      currentStreak: 0,
      bestWinStreak: 0,
      totalBluffsCaught: 0,
      totalChallengesWon: 0,
      avgRounds: 0,
      avgDurationMs: 0,
    };
  }
  const wins = list.filter((m) => m.result === 'win').length;
  const losses = list.length - wins;
  // list está em ordem decrescente (mais recente primeiro)
  let currentStreak = 0;
  if (list[0]) {
    const sign = list[0].result === 'win' ? 1 : -1;
    for (const m of list) {
      if (sign > 0 && m.result === 'win') currentStreak++;
      else if (sign < 0 && m.result === 'loss') currentStreak--;
      else break;
    }
  }
  let bestWinStreak = 0;
  let cur = 0;
  // melhor sequência de vitórias: varre na ordem cronológica ascendente
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].result === 'win') {
      cur++;
      if (cur > bestWinStreak) bestWinStreak = cur;
    } else {
      cur = 0;
    }
  }

  const totalRounds = list.reduce((s, m) => s + (m.rounds || 0), 0);
  const totalDuration = list.reduce((s, m) => s + (m.durationMs || 0), 0);

  return {
    total: list.length,
    wins,
    losses,
    winRate: list.length ? wins / list.length : 0,
    currentStreak,
    bestWinStreak,
    totalBluffsCaught: list.reduce((s, m) => s + m.bluffsCaught, 0),
    totalChallengesWon: list.reduce((s, m) => s + m.challengesWon, 0),
    avgRounds: list.length ? totalRounds / list.length : 0,
    avgDurationMs: list.length ? totalDuration / list.length : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Resume de partida em andamento                                     */
/* ------------------------------------------------------------------ */

export async function saveResumeSnapshot(snapshot: any): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.resumeSnapshot, JSON.stringify(snapshot));
  } catch {
    /* ignora */
  }
}

export async function loadResumeSnapshot<T = any>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.resumeSnapshot);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearResumeSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.resumeSnapshot);
  } catch {
    /* ignora */
  }
}

/* ------------------------------------------------------------------ */
/* Dificuldade                                                        */
/* ------------------------------------------------------------------ */

export type BotPersonality = 'cautious' | 'tyrant' | 'bluffer' | 'balanced';

export interface DifficultyConfig {
  bots: number;
  personalities: BotPersonality[];
}

const DEFAULT_DIFFICULTY: DifficultyConfig = {
  bots: 3,
  personalities: ['balanced', 'balanced', 'balanced'],
};

export async function getDifficulty(): Promise<DifficultyConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.difficulty);
    if (!raw) return DEFAULT_DIFFICULTY;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.bots === 'number') return parsed;
    return DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

export async function setDifficulty(cfg: DifficultyConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.difficulty, JSON.stringify(cfg));
  } catch {
    /* ignora */
  }
}
