import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState } from '../engine/types';
import type {
  CampaignRunState,
  CampaignProgressState,
  NextRunBonusId,
} from '../campaign/types';
import { DEFAULT_CAMPAIGN_PROGRESS } from '../campaign/progress';
import { computeMatchSkillScore } from './matchSkillScore';

const KEYS = {
  playerName: '@coup/player_name',
  muted: '@coup/muted',
  /** Legado — migrado para matchHistoryV2 na primeira leitura */
  matchHistory: '@coup/match_history_v1',
  matchHistoryV2: '@coup/match_history_v2',
  resumeSnapshot: '@coup/resume_v1',
  difficulty: '@coup/difficulty_v1',
  audioSfxVol: '@coup/audio_sfx_vol',
  audioMusicVol: '@coup/audio_music_vol',
  notifyInvites: '@coup/notify_invites',
  onboardingSeen: '@coup/onboarding_seen_v1',
  campaignProgress: '@coup/campaign_progress_v1',
  pendingNextRunBonus: '@coup/pending_next_run_bonus_v1',
};

/** Partida rápida offline (sem Ascensão). */
export type MatchHistoryMode = 'quick_offline' | 'ascension' | 'multiplayer';

/**
 * Registro individual de uma partida (histórico, win rate, base para rank futuro).
 */
export interface MatchHistoryEntry {
  id: string;
  playedAt: number; // timestamp ms
  mode: MatchHistoryMode;
  /** Performance da partida (pesos fixos — usar no rank global futuro). */
  skillScore: number;
  durationMs: number;
  rounds: number;
  result: 'win' | 'loss';
  opponents: number;
  playerName: string;
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
  mvp: boolean;
  /** Ascensão: posto em que a partida ocorreu */
  ascensionRankId?: string | null;
  ascensionRankTitle?: string | null;
  /** Multijogador: sala curta para leitura humana */
  roomIdShort?: string | null;
  /** Multijogador: nome da sala se existir */
  roomDisplayName?: string | null;
  /**
   * Reservado para sincronizar com ranking global (Elo, posição).
   * Quando o servidor existir, preencher após cada partida ranqueada.
   */
  globalRankPlaceholder?: {
    schemaVersion: 1;
    note: 'local_only_until_server';
  } | null;
}

const MAX_HISTORY = 100;

export function normalizeMatchHistoryEntry(raw: unknown): MatchHistoryEntry {
  const e = raw as Record<string, unknown>;
  const modeRaw = e.mode;
  const mode: MatchHistoryMode =
    modeRaw === 'ascension' ||
    modeRaw === 'multiplayer' ||
    modeRaw === 'quick_offline'
      ? modeRaw
      : 'quick_offline';

  const skillScore =
    typeof e.skillScore === 'number' && Number.isFinite(e.skillScore)
      ? e.skillScore
      : computeMatchSkillScore({
          actionsTaken: Number(e.actionsTaken) || 0,
          challengesWon: Number(e.challengesWon) || 0,
          bluffsCaught: Number(e.bluffsCaught) || 0,
          blocksSuccess: Number(e.blocksSuccess) || 0,
          bluffsSurvived: Number(e.bluffsSurvived) || 0,
          coinsGained: Number(e.coinsGained) || 0,
          coinsLost: Number(e.coinsLost) || 0,
          cardsLost: Number(e.cardsLost) || 0,
        });

  return {
    id: String(e.id ?? `m-${Date.now()}`),
    playedAt: Number(e.playedAt) || Date.now(),
    mode,
    skillScore,
    durationMs: Number(e.durationMs) || 0,
    rounds: Number(e.rounds) || 1,
    result: e.result === 'loss' ? 'loss' : 'win',
    opponents: Number(e.opponents) || 0,
    playerName: String(e.playerName ?? '—'),
    actionsTaken: Number(e.actionsTaken) || 0,
    challengesMade: Number(e.challengesMade) || 0,
    challengesWon: Number(e.challengesWon) || 0,
    challengesLost: Number(e.challengesLost) || 0,
    bluffsCaught: Number(e.bluffsCaught) || 0,
    bluffsSurvived: Number(e.bluffsSurvived) || 0,
    blocksMade: Number(e.blocksMade) || 0,
    blocksSuccess: Number(e.blocksSuccess) || 0,
    blocksFailed: Number(e.blocksFailed) || 0,
    coinsGained: Number(e.coinsGained) || 0,
    coinsLost: Number(e.coinsLost) || 0,
    cardsLost: Number(e.cardsLost) || 0,
    mvp: Boolean(e.mvp),
    ascensionRankId:
      e.ascensionRankId != null ? String(e.ascensionRankId) : undefined,
    ascensionRankTitle:
      e.ascensionRankTitle != null ? String(e.ascensionRankTitle) : undefined,
    roomIdShort:
      e.roomIdShort != null ? String(e.roomIdShort) : undefined,
    roomDisplayName:
      e.roomDisplayName != null ? String(e.roomDisplayName) : undefined,
    globalRankPlaceholder:
      e.globalRankPlaceholder &&
      typeof e.globalRankPlaceholder === 'object'
        ? (e.globalRankPlaceholder as MatchHistoryEntry['globalRankPlaceholder'])
        : undefined,
  };
}

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
  async getAudioSfxVol(): Promise<number> {
    try {
      const v = await AsyncStorage.getItem(KEYS.audioSfxVol);
      if (v == null) return 1;
      const n = parseFloat(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    } catch {
      return 1;
    }
  },
  async setAudioSfxVol(vol: number): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.audioSfxVol, String(vol));
    } catch {
      /* ignora */
    }
  },
  async getAudioMusicVol(): Promise<number> {
    try {
      const v = await AsyncStorage.getItem(KEYS.audioMusicVol);
      if (v == null) return 1;
      const n = parseFloat(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    } catch {
      return 1;
    }
  },
  async setAudioMusicVol(vol: number): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.audioMusicVol, String(vol));
    } catch {
      /* ignora */
    }
  },
  async getNotifyInvites(): Promise<boolean> {
    try {
      const v = await AsyncStorage.getItem(KEYS.notifyInvites);
      return v === '1';
    } catch {
      return false;
    }
  },
  async setNotifyInvites(on: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.notifyInvites, on ? '1' : '0');
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
    const rawV2 = await AsyncStorage.getItem(KEYS.matchHistoryV2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeMatchHistoryEntry);
    }
    const rawV1 = await AsyncStorage.getItem(KEYS.matchHistory);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      if (!Array.isArray(parsed)) return [];
      const migrated = parsed.map(normalizeMatchHistoryEntry);
      await AsyncStorage.setItem(
        KEYS.matchHistoryV2,
        JSON.stringify(migrated)
      );
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

export async function appendMatchHistory(
  entry: MatchHistoryEntry
): Promise<void> {
  try {
    const list = await getMatchHistory();
    const normalized = normalizeMatchHistoryEntry(entry);
    const next = [normalized, ...list].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(KEYS.matchHistoryV2, JSON.stringify(next));
  } catch {
    /* ignora */
  }
}

export async function clearMatchHistory(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEYS.matchHistory, KEYS.matchHistoryV2]);
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
  /** Média da pontuação de performance (partidas com registro). */
  avgSkillScore: number;
  /** Melhor performance registrada. */
  bestSkillScore: number;
}

export function aggregateHistory(
  list: MatchHistoryEntry[],
  modeFilter: MatchHistoryMode | 'all' = 'all'
): HistoryAggregate {
  const filtered =
    modeFilter === 'all'
      ? list
      : list.filter((m) => m.mode === modeFilter);
  if (filtered.length === 0) {
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
      avgSkillScore: 0,
      bestSkillScore: 0,
    };
  }
  const wins = filtered.filter((m) => m.result === 'win').length;
  const losses = filtered.length - wins;
  // Ordem decrescente (mais recente primeiro)
  let currentStreak = 0;
  if (filtered[0]) {
    const sign = filtered[0].result === 'win' ? 1 : -1;
    for (const m of filtered) {
      if (sign > 0 && m.result === 'win') currentStreak++;
      else if (sign < 0 && m.result === 'loss') currentStreak--;
      else break;
    }
  }
  let bestWinStreak = 0;
  let cur = 0;
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (filtered[i].result === 'win') {
      cur++;
      if (cur > bestWinStreak) bestWinStreak = cur;
    } else {
      cur = 0;
    }
  }

  const totalRounds = filtered.reduce((s, m) => s + (m.rounds || 0), 0);
  const totalDuration = filtered.reduce((s, m) => s + (m.durationMs || 0), 0);
  const totalSkill = filtered.reduce(
    (s, m) => s + (Number.isFinite(m.skillScore) ? m.skillScore : 0),
    0
  );
  const bestSkillScore = filtered.reduce(
    (s, m) => Math.max(s, Number.isFinite(m.skillScore) ? m.skillScore : 0),
    0
  );

  return {
    total: filtered.length,
    wins,
    losses,
    winRate: filtered.length ? wins / filtered.length : 0,
    currentStreak,
    bestWinStreak,
    totalBluffsCaught: filtered.reduce((s, m) => s + m.bluffsCaught, 0),
    totalChallengesWon: filtered.reduce((s, m) => s + m.challengesWon, 0),
    avgRounds: filtered.length ? totalRounds / filtered.length : 0,
    avgDurationMs: filtered.length ? totalDuration / filtered.length : 0,
    avgSkillScore: filtered.length ? totalSkill / filtered.length : 0,
    bestSkillScore,
  };
}

/* ------------------------------------------------------------------ */
/* Primeira abertura — onboarding rápido                               */
/* ------------------------------------------------------------------ */

export async function getOnboardingSeen(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.onboardingSeen);
    return v === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.onboardingSeen, '1');
  } catch {
    /* ignora */
  }
}

/* ------------------------------------------------------------------ */
/* Resume de partida em andamento                                     */
/* ------------------------------------------------------------------ */

export const RESUME_SNAPSHOT_VERSION = 1 as const;

export interface OfflineResumeSnapshot {
  version: typeof RESUME_SNAPSHOT_VERSION;
  mode: 'offline';
  savedAt: number;
  engineState: GameState;
  campaignRun?: CampaignRunState | null;
}

export function isOfflineResumeSnapshot(
  data: unknown
): data is OfflineResumeSnapshot {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  if (o.version !== RESUME_SNAPSHOT_VERSION || o.mode !== 'offline')
    return false;
  if (typeof o.savedAt !== 'number') return false;
  const es = o.engineState;
  if (!es || typeof es !== 'object') return false;
  const g = es as Record<string, unknown>;
  if (typeof g.phase !== 'string' || !Array.isArray(g.players)) return false;
  return true;
}

export async function saveResumeSnapshot(snapshot: OfflineResumeSnapshot): Promise<void> {
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
/* Campanha offline — Ascensão na Corte                               */
/* ------------------------------------------------------------------ */

export async function getCampaignProgress(): Promise<CampaignProgressState> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.campaignProgress);
    if (!raw) return { ...DEFAULT_CAMPAIGN_PROGRESS };
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.rankIndex === 'number' &&
      typeof parsed.winsInRank === 'number' &&
      Array.isArray(parsed.unlockedRankIds)
    ) {
      return {
        rankIndex: parsed.rankIndex,
        winsInRank: parsed.winsInRank,
        unlockedRankIds: parsed.unlockedRankIds,
        winStreak:
          typeof parsed.winStreak === 'number' ? parsed.winStreak : 0,
      };
    }
    return { ...DEFAULT_CAMPAIGN_PROGRESS };
  } catch {
    return { ...DEFAULT_CAMPAIGN_PROGRESS };
  }
}

export async function setCampaignProgress(
  state: CampaignProgressState
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.campaignProgress, JSON.stringify(state));
  } catch {
    /* ignora */
  }
}

export async function resetCampaignProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.campaignProgress);
  } catch {
    /* ignora */
  }
}

export async function getPendingNextRunBonus(): Promise<NextRunBonusId | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.pendingNextRunBonus);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: string };
    if (
      v?.id === 'coffer' ||
      v?.id === 'informant' ||
      v?.id === 'high_stakes'
    ) {
      return v.id;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setPendingNextRunBonus(
  id: NextRunBonusId | null
): Promise<void> {
  try {
    if (id == null) {
      await AsyncStorage.removeItem(KEYS.pendingNextRunBonus);
    } else {
      await AsyncStorage.setItem(
        KEYS.pendingNextRunBonus,
        JSON.stringify({ id })
      );
    }
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
