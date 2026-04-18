import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import * as Network from 'expo-network';
import { CoupEngine } from '../engine/CoupEngine';
import { getLanGameHost } from '../host/LanGameHost';
import {
  LanTcpClientSocket,
  parseLanUrl,
} from '../host/LanTcpClientSocket';
import { BotManager } from '../engine/BotManager';
import { pickBotName } from '../utils/botNames';
import {
  saveResumeSnapshot,
  loadResumeSnapshot,
  clearResumeSnapshot,
  getCampaignProgress,
  RESUME_SNAPSHOT_VERSION,
  type OfflineResumeSnapshot,
  isOfflineResumeSnapshot,
} from '../utils/storage';
import { RANKS } from '../campaign/ranks';
import { clampRankIndex } from '../campaign/progress';
import { pickChallengesForRun } from '../campaign/challenges';
import type { CampaignRunState } from '../campaign/types';

// Janela global entre transições para dar "fôlego" visual
export const TRANSITION_MS = 5000;
// Tempo para o humano agir antes do bot assumir
export const TURN_TIMEOUT_S = 30;

interface GameState {
  roomId: string | null;
  players: any[];
  phase: string;
  logs: string[];
  currentPlayerId: string | null;
  waitingForResponseIndex: number | null;
  losingInfluenceId: string | null;
  losingContext: {
    reason: 'coup' | 'assassinate' | 'challenge_lost' | 'bluff_caught';
    causedByPlayerId?: string;
    stamp: number;
  } | null;
  socket: Socket | null;
  isOffline: boolean;
  localEngine: CoupEngine | null;
  currentAction: any;
  pendingBlock: any;
  lastReveal: {
    role: string;
    playerName: string;
    playerId: string;
    verdict: 'proven' | 'bluff';
    stamp: number;
  } | null;
  lastLoss: {
    role: string;
    playerName: string;
    playerId: string;
    stamp: number;
  } | null;
  lastResolved: {
    actionType: string;
    actorId: string;
    actorName: string;
    targetId?: string;
    targetName?: string;
    summary: string;
    stamp: number;
  } | null;
  lastInvalid: {
    reason: string;
    actionType?: string;
    stamp: number;
  } | null;
  deckCount: number;
  matchStats: any | null;
  winnerId: string | null;

  /** Metadados da sala online (nome exibido, se há senha). */
  roomMeta: { displayName: string; hasPassword: boolean } | null;
  /** Socket caiu ou jogador foi removido — mostrar aviso e voltar ao menu. */
  onlineLeaveMessage: string | null;

  // Transições e timers
  transitioning: boolean;
  /** Segundos restantes no delay de transição entre ações (feedback visual). */
  transitionRemaining: number | null;
  turnTimer: number | null; // segundos restantes para o humano agir

  /** Missão ativa da Ascensão na Corte (offline) */
  campaignRun: CampaignRunState | null;

  // Actions
  connect: (url: string) => void;
  /** Conecta com timeout; retorna false se falhar (rede/servidor). */
  connectAsync: (url: string, timeoutMs?: number) => Promise<boolean>;
  /** Encerra socket online e limpa estado de sala (lobby). */
  disconnectOnline: () => void;
  /** Inicia servidor TCP neste aparelho (Wi‑Fi) e conecta o anfitrião. */
  startLanHostSession: () => Promise<{ port: number; baseUrl: string }>;
  /** Cria sala no servidor (nome + senha opcional). Requer socket conectado. */
  createRoom: (
    displayName: string,
    playerName: string,
    password?: string
  ) => void;
  clearOnlineLeaveMessage: () => void;
  startOfflineGame: (playerName: string) => void;
  startOfflineCampaign: (
    playerName: string,
    personalities: string[]
  ) => void;
  startCampaignAscensionMatch: (playerName: string) => Promise<void>;
  clearCampaignRun: () => void;
  bumpCampaignIncome: () => void;
  joinRoom: (roomId: string, name: string, password?: string) => void;
  sendAction: (action: any) => void;
  sendResponse: (response: any, role?: string) => void;
  selectInfluence: (role: string) => void;
  confirmExchange: (keptRoles: string[]) => void;
  getCurrentPlayer: () => any;
  startGame: () => void;
  addBot: () => void;
  checkBotTurns: () => void;
  addBotWithPersonality: (personality: string) => void;
  applyStateAfterMutation: (cooldownMs?: number) => void;
  maybeStartHumanTimer: () => void;
  clearHumanTimer: () => void;
  autoHumanAction: () => void;
  getGraveyardStats: () => { role: string; dead: number; remaining: number }[];
  persistOfflineSnapshot: () => void;
  restoreOfflineResume: () => Promise<boolean>;
}

// Timer handles fora do store para evitar serialização
let transitionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let transitionTickHandle: ReturnType<typeof setInterval> | null = null;
let humanTickHandle: ReturnType<typeof setInterval> | null = null;

function clearAllTransitionTimers() {
  if (transitionTimeoutHandle) {
    clearTimeout(transitionTimeoutHandle);
    transitionTimeoutHandle = null;
  }
  if (transitionTickHandle) {
    clearInterval(transitionTickHandle);
    transitionTickHandle = null;
  }
}

export const useGameState = create<GameState>((set, get) => {
  const bindRoomListeners = (socket: Socket) => {
    socket.on('room_update', (raw: any) => {
      const { roomMeta, ...state } = raw;
      set({
        players: [...state.players],
        phase: state.phase,
        logs: [...state.logs],
        roomId: state.roomId,
        socket,
        currentPlayerId: state.players[state.turnIndex]?.id,
        waitingForResponseIndex: state.waitingForResponseIndex || null,
        losingInfluenceId: state.losingInfluenceId || null,
        losingContext: state.losingContext ? { ...state.losingContext } : null,
        currentAction: state.currentAction ? { ...state.currentAction } : null,
        pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
        isOffline: false,
        campaignRun: null,
        roomMeta: roomMeta ?? null,
        onlineLeaveMessage: null,
      });
    });

    socket.on('disconnect', () => {
      if (get().isOffline) return;
      set({
        socket: null,
        onlineLeaveMessage:
          'Conexão perdida. Você foi removido da sala ou o servidor encerrou.',
        roomId: null,
        roomMeta: null,
        players: [],
        phase: 'lobby',
        logs: [],
        currentPlayerId: null,
        waitingForResponseIndex: null,
        losingInfluenceId: null,
        losingContext: null,
        currentAction: null,
        pendingBlock: null,
        lastReveal: null,
        lastLoss: null,
        lastResolved: null,
        lastInvalid: null,
        deckCount: 0,
        matchStats: null,
        winnerId: null,
        transitioning: false,
        transitionRemaining: null,
        turnTimer: null,
      });
    });
  };

  return {
  roomId: null,
  players: [],
  phase: 'lobby',
  logs: [],
  currentPlayerId: null,
  waitingForResponseIndex: null,
  losingInfluenceId: null,
  losingContext: null,
  socket: null,
  isOffline: false,
  localEngine: null,
  currentAction: null,
  pendingBlock: null,
  lastReveal: null,
  lastLoss: null,
  lastResolved: null,
  lastInvalid: null,
  deckCount: 0,
  matchStats: null,
  winnerId: null,

  roomMeta: null,
  onlineLeaveMessage: null,

  transitioning: false,
  transitionRemaining: null,
  turnTimer: null,

  campaignRun: null,

  disconnectOnline: () => {
    void getLanGameHost().stop();
    const s = get().socket;
    if (s) {
      if (typeof (s as unknown as { removeAllListeners?: () => void }).removeAllListeners === 'function') {
        (s as unknown as { removeAllListeners: () => void }).removeAllListeners();
      }
      if (typeof (s as unknown as { disconnect?: () => void }).disconnect === 'function') {
        (s as unknown as { disconnect: () => void }).disconnect();
      }
    }
    set({
      socket: null,
      roomId: null,
      players: [],
      phase: 'lobby',
      logs: [],
      currentPlayerId: null,
      waitingForResponseIndex: null,
      losingInfluenceId: null,
      losingContext: null,
      currentAction: null,
      pendingBlock: null,
      lastReveal: null,
      lastLoss: null,
      lastResolved: null,
      lastInvalid: null,
      deckCount: 0,
      matchStats: null,
      winnerId: null,
      transitioning: false,
      transitionRemaining: null,
      turnTimer: null,
      roomMeta: null,
      onlineLeaveMessage: null,
    });
  },

  clearOnlineLeaveMessage: () => set({ onlineLeaveMessage: null }),

  startLanHostSession: async () => {
    get().disconnectOnline();
    const host = getLanGameHost();
    const { port } = await host.start();
    const ip = await Network.getIpAddressAsync();
    if (!ip || ip === '0.0.0.0') {
      await host.stop();
      throw new Error('Sem IP na rede Wi‑Fi. Ative o Wi‑Fi e tente de novo.');
    }
    const sock = host.createHostSocket();
    bindRoomListeners(sock as unknown as Socket);
    const baseUrl = `lan://${ip}:${port}`;
    set({ socket: sock as unknown as Socket });
    return { port, baseUrl };
  },

  createRoom: (displayName: string, playerName: string, password?: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('create_room', {
        displayName: displayName.trim(),
        playerName: playerName.trim(),
        password: password?.trim() || undefined,
      });
    }
  },

  connect: (url: string) => {
    get().disconnectOnline();
    const socket = io(url, { transports: ['websocket', 'polling'] });
    bindRoomListeners(socket);
    set({ socket });
  },

  connectAsync: (url: string, timeoutMs = 15000) =>
    new Promise<boolean>((resolve) => {
      get().disconnectOnline();

      if (url.startsWith('lan://')) {
        const parsed = parseLanUrl(url);
        if (!parsed) {
          resolve(false);
          return;
        }
        const client = new LanTcpClientSocket();
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          client.disconnect();
          resolve(false);
        }, timeoutMs);
        client
          .connect(parsed.host, parsed.port, timeoutMs)
          .then(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            bindRoomListeners(client as unknown as Socket);
            set({ socket: client as unknown as Socket });
            resolve(true);
          })
          .catch(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(false);
          });
        return;
      }

      const socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: false,
      });
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) {
          bindRoomListeners(socket);
          set({ socket });
          resolve(true);
        } else {
          socket.removeAllListeners();
          socket.disconnect();
          resolve(false);
        }
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        finish(true);
      });
      socket.once('connect_error', () => finish(false));
    }),

  startOfflineGame: (playerName: string) => {
    const engine = new CoupEngine('offline-room');
    engine.addPlayer('human-1', playerName);
    const state = engine.getState();
    set({
      localEngine: engine,
      isOffline: true,
      roomId: 'OFFLINE',
      players: state.players,
      phase: 'lobby',
      currentPlayerId: state.players[state.turnIndex]?.id,
      waitingForResponseIndex: state.waitingForResponseIndex,
      losingInfluenceId: null,
      losingContext: null,
      currentAction: null,
      pendingBlock: null,
      lastReveal: null,
      lastLoss: null,
      lastResolved: null,
      matchStats: null,
      winnerId: null,
      transitioning: false,
      transitionRemaining: null,
      turnTimer: null,
      logs: ['Modo Offline iniciado.'],
      campaignRun: null,
    });
  },

  clearCampaignRun: () => set({ campaignRun: null }),

  bumpCampaignIncome: () => {
    const cr = get().campaignRun;
    if (!cr) return;
    set({
      campaignRun: {
        ...cr,
        tally: { income: cr.tally.income + 1 },
      },
    });
  },

  startOfflineCampaign: (playerName: string, personalities: string[]) => {
    void clearResumeSnapshot();
    const engine = new CoupEngine('offline-room');
    engine.addPlayer('human-1', playerName);
    const takenNames: string[] = [playerName];
    personalities.forEach((p) => {
      const botId = `bot-${Math.random().toString(36).substring(7)}`;
      const name = pickBotName(takenNames);
      takenNames.push(name);
      engine.addPlayer(botId, name, true, p as any);
    });
    engine.startGame();
    const state = engine.getState();
    set({
      localEngine: engine,
      isOffline: true,
      roomId: 'OFFLINE',
      players: state.players,
      phase: state.phase,
      currentPlayerId: state.players[state.turnIndex]?.id,
      waitingForResponseIndex: state.waitingForResponseIndex,
      losingInfluenceId: null,
      losingContext: null,
      currentAction: state.currentAction,
      pendingBlock: state.pendingBlock,
      lastReveal: state.lastReveal ?? null,
      lastLoss: (state as any).lastLoss ?? null,
      lastResolved: (state as any).lastResolved ?? null,
      deckCount: Array.isArray((state as any).deck)
        ? (state as any).deck.length
        : 0,
      matchStats: (state as any).matchStats ?? null,
      winnerId: (state as any).winnerId ?? null,
      transitioning: false,
      transitionRemaining: null,
      turnTimer: null,
      logs: state.logs || ['Campanha iniciada.'],
      campaignRun: null,
    });
    get().persistOfflineSnapshot();
    // dispara a lógica de turno (bots etc.)
    setTimeout(() => {
      get().applyStateAfterMutation(400);
    }, 0);
  },

  startCampaignAscensionMatch: async (playerName: string) => {
    void clearResumeSnapshot();
    const progress = await getCampaignProgress();
    const idx = clampRankIndex(progress.rankIndex);
    const rank = RANKS[idx];
    if (!rank) return;

    const challengeIds = pickChallengesForRun(2);
    const campaignRun: CampaignRunState = {
      rankIndex: idx,
      rankId: rank.id,
      challengeIds,
      tally: { income: 0 },
    };

    const engine = new CoupEngine('offline-room');
    engine.addPlayer('human-1', playerName);
    const takenNames: string[] = [playerName];
    rank.personalities.forEach((p) => {
      const botId = `bot-${Math.random().toString(36).substring(7)}`;
      const name = pickBotName(takenNames);
      takenNames.push(name);
      engine.addPlayer(botId, name, true, p as any);
    });
    engine.startGame();
    const state = engine.getState();
    set({
      localEngine: engine,
      isOffline: true,
      roomId: 'OFFLINE',
      players: state.players,
      phase: state.phase,
      currentPlayerId: state.players[state.turnIndex]?.id,
      waitingForResponseIndex: state.waitingForResponseIndex,
      losingInfluenceId: null,
      losingContext: null,
      currentAction: state.currentAction,
      pendingBlock: state.pendingBlock,
      lastReveal: state.lastReveal ?? null,
      lastLoss: (state as any).lastLoss ?? null,
      lastResolved: (state as any).lastResolved ?? null,
      deckCount: Array.isArray((state as any).deck)
        ? (state as any).deck.length
        : 0,
      matchStats: (state as any).matchStats ?? null,
      winnerId: (state as any).winnerId ?? null,
      transitioning: false,
      transitionRemaining: null,
      turnTimer: null,
      logs: state.logs || ['Ascensão na Corte — a mesa está posta.'],
      campaignRun,
    });
    get().persistOfflineSnapshot();
    setTimeout(() => {
      get().applyStateAfterMutation(400);
    }, 0);
  },

  persistOfflineSnapshot: () => {
    const { isOffline, localEngine } = get();
    if (!isOffline || !localEngine) return;
    const st = localEngine.getState();
    if (st.phase === 'game_over') return;
    if (!Array.isArray(st.players) || st.players.length < 2) return;
    const cr = get().campaignRun;
    const snap: OfflineResumeSnapshot = {
      version: RESUME_SNAPSHOT_VERSION,
      mode: 'offline',
      savedAt: Date.now(),
      engineState: JSON.parse(JSON.stringify(st)),
      ...(cr ? { campaignRun: cr } : {}),
    };
    void saveResumeSnapshot(snap);
  },

  restoreOfflineResume: async () => {
    const raw = await loadResumeSnapshot<unknown>();
    if (!raw || !isOfflineResumeSnapshot(raw)) {
      await clearResumeSnapshot();
      return false;
    }
    const { engineState, campaignRun: snapCampaign } = raw;
    if (engineState.phase === 'game_over') {
      await clearResumeSnapshot();
      return false;
    }
    if (!Array.isArray(engineState.players) || engineState.players.length < 2) {
      await clearResumeSnapshot();
      return false;
    }

    clearAllTransitionTimers();
    get().clearHumanTimer();

    const engine = CoupEngine.hydrate(engineState);
    const state = engine.getState();
    set({
      localEngine: engine,
      isOffline: true,
      roomId: 'OFFLINE',
      players: [...state.players],
      phase: state.phase,
      logs: [...state.logs],
      currentPlayerId: state.players[state.turnIndex]?.id,
      waitingForResponseIndex: state.waitingForResponseIndex,
      losingInfluenceId: (state as any).losingInfluenceId || null,
      losingContext: (state as any).losingContext
        ? { ...(state as any).losingContext }
        : null,
      currentAction: state.currentAction ? { ...state.currentAction } : null,
      pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
      lastReveal: (state as any).lastReveal
        ? { ...(state as any).lastReveal }
        : null,
      lastLoss: (state as any).lastLoss
        ? { ...(state as any).lastLoss }
        : null,
      lastResolved: (state as any).lastResolved
        ? { ...(state as any).lastResolved }
        : null,
      lastInvalid: (state as any).lastInvalid
        ? { ...(state as any).lastInvalid }
        : null,
      deckCount: Array.isArray((state as any).deck)
        ? (state as any).deck.length
        : 0,
      matchStats: (state as any).matchStats
        ? JSON.parse(JSON.stringify((state as any).matchStats))
        : null,
      winnerId: (state as any).winner || null,
      transitioning: false,
      transitionRemaining: null,
      turnTimer: null,
      campaignRun: snapCampaign ?? null,
    });
    setTimeout(() => {
      get().checkBotTurns();
      get().maybeStartHumanTimer();
    }, 0);
    return true;
  },

  joinRoom: (roomId: string, name: string, password?: string) => {
    const { socket } = get();
    if (socket) {
      const code = roomId.trim().toUpperCase();
      socket.emit('join_room', {
        roomId: code,
        playerName: name.trim(),
        password: password?.trim() || undefined,
      });
      set({ roomId: code });
    }
  },

  startGame: () => {
    const { socket, roomId, isOffline, localEngine, players } = get();
    if (players.length < 2) {
      alert('É necessário pelo menos 2 jogadores para iniciar o jogo.');
      return;
    }

    if (isOffline && localEngine) {
      localEngine.startGame();
      get().applyStateAfterMutation(500); // início rápido
    } else if (socket && roomId) {
      socket.emit('start_game', roomId);
    }
  },

  addBot: () => {
    get().addBotWithPersonality('balanced');
  },

  addBotWithPersonality: (personality: string) => {
    const { socket, roomId, isOffline, localEngine, players } = get();
    if (players.length >= 6) {
      alert('A sala atingiu o limite máximo de 6 jogadores!');
      return;
    }

    if (isOffline && localEngine) {
      const botId = `bot-${Math.random().toString(36).substring(7)}`;
      const taken = localEngine.getState().players.map((pl) => pl.name);
      const name = pickBotName(taken);
      localEngine.addPlayer(botId, name, true, personality as any);
      const state = localEngine.getState();
      set({
        players: [...state.players],
        currentPlayerId: state.players[state.turnIndex]?.id,
      });
    } else if (socket && roomId) {
      socket.emit('add_bot', roomId);
    }
  },

  /**
   * Aplica o estado atual do engine na store e trava inputs por `cooldownMs`
   * para dar fôlego visual entre transições. Depois libera e roda bots.
   */
  applyStateAfterMutation: (cooldownMs: number = TRANSITION_MS) => {
    const { localEngine } = get();
    if (!localEngine) return;

    const state = localEngine.getState();

    // Cancela cooldown anterior se estiver em andamento
    if (transitionTimeoutHandle) {
      clearTimeout(transitionTimeoutHandle);
      transitionTimeoutHandle = null;
    }
    if (transitionTickHandle) {
      clearInterval(transitionTickHandle);
      transitionTickHandle = null;
    }

    // Para o timer do humano (qualquer transição renova)
    get().clearHumanTimer();

    set({
      players: [...state.players],
      phase: state.phase,
      logs: [...state.logs],
      currentPlayerId: state.players[state.turnIndex]?.id,
      waitingForResponseIndex: state.waitingForResponseIndex,
      losingInfluenceId: (state as any).losingInfluenceId || null,
      losingContext: (state as any).losingContext
        ? { ...(state as any).losingContext }
        : null,
      currentAction: state.currentAction ? { ...state.currentAction } : null,
      pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
      lastReveal: (state as any).lastReveal
        ? { ...(state as any).lastReveal }
        : null,
      lastLoss: (state as any).lastLoss
        ? { ...(state as any).lastLoss }
        : null,
      lastResolved: (state as any).lastResolved
        ? { ...(state as any).lastResolved }
        : null,
      lastInvalid: (state as any).lastInvalid
        ? { ...(state as any).lastInvalid }
        : null,
      deckCount: Array.isArray((state as any).deck)
        ? (state as any).deck.length
        : 0,
      matchStats: (state as any).matchStats
        ? JSON.parse(JSON.stringify((state as any).matchStats))
        : null,
      winnerId: (state as any).winner || null,
      transitioning: true,
      transitionRemaining: Math.ceil(cooldownMs / 1000),
      turnTimer: null,
    });

    // Countdown visual (1x/s). Só UI — o timeout real abaixo é quem libera o input.
    transitionTickHandle = setInterval(() => {
      const cur = get().transitionRemaining;
      if (cur === null || cur <= 1) {
        if (transitionTickHandle) {
          clearInterval(transitionTickHandle);
          transitionTickHandle = null;
        }
        set({ transitionRemaining: cur === null ? null : 0 });
        return;
      }
      set({ transitionRemaining: cur - 1 });
    }, 1000);

    transitionTimeoutHandle = setTimeout(() => {
      transitionTimeoutHandle = null;
      if (transitionTickHandle) {
        clearInterval(transitionTickHandle);
        transitionTickHandle = null;
      }
      set({ transitioning: false, transitionRemaining: null });
      get().checkBotTurns();
      get().maybeStartHumanTimer();
      get().persistOfflineSnapshot();
    }, cooldownMs);
  },

  sendAction: (action: any) => {
    const { socket, roomId, isOffline, localEngine, transitioning } = get();
    if (transitioning) return;
    get().clearHumanTimer();
    if (isOffline && localEngine) {
      const beforeStamp =
        (localEngine.getState() as any).lastInvalid?.stamp || 0;
      localEngine.handleAction('human-1', action);
      const afterInvalid = (localEngine.getState() as any).lastInvalid;
      // Ação recusada pela validação: propaga só o toast, sem congelar inputs.
      if (afterInvalid && afterInvalid.stamp > beforeStamp) {
        set({ lastInvalid: { ...afterInvalid } });
        // Reinicia timer para o humano continuar tentando
        get().maybeStartHumanTimer();
        return;
      }
      if (action?.type === 'income') get().bumpCampaignIncome();
      get().applyStateAfterMutation();
    } else if (socket && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  },

  sendResponse: (response: any, role?: string) => {
    const { socket, roomId, isOffline, localEngine, transitioning } = get();
    if (transitioning) return;
    get().clearHumanTimer();
    if (isOffline && localEngine) {
      localEngine.handleResponse('human-1', response, role as any);
      get().applyStateAfterMutation();
    } else if (socket && roomId) {
      socket.emit('game_response', { roomId, response, role });
    }
  },

  selectInfluence: (role: string) => {
    const { socket, roomId, isOffline, localEngine, transitioning } = get();
    if (transitioning) return;
    get().clearHumanTimer();
    if (isOffline && localEngine) {
      localEngine.handleFlip('human-1', role as any);
      get().applyStateAfterMutation();
    } else if (socket && roomId) {
      socket.emit('select_influence', { roomId, role });
    }
  },

  confirmExchange: (keptRoles: string[]) => {
    const { socket, roomId, isOffline, localEngine, transitioning } = get();
    if (transitioning) return;
    get().clearHumanTimer();
    if (isOffline && localEngine) {
      localEngine.handleExchangeChoice('human-1', keptRoles as any);
      get().applyStateAfterMutation();
    } else if (socket && roomId) {
      socket.emit('confirm_exchange', { roomId, keptRoles });
    }
  },

  getCurrentPlayer: () => {
    const { isOffline, localEngine, players, currentPlayerId } = get();
    if (isOffline && localEngine) return localEngine.getCurrentPlayer();
    return players.find((p) => p.id === currentPlayerId);
  },

  checkBotTurns: () => {
    const { isOffline, localEngine, transitioning } = get();
    if (!isOffline || !localEngine || transitioning) return;

    const state = localEngine.getState();
    const botMgr = new BotManager(localEngine);

    if (state.phase === 'action') {
      const currentPlayer = state.players[state.turnIndex];
      if (currentPlayer?.isBot) {
        const action = botMgr.decideAction(currentPlayer.id);
        if (action) {
          localEngine.handleAction(currentPlayer.id, action);
          get().applyStateAfterMutation();
        }
      }
    } else if (
      (state.phase === 'challenge' || state.phase === 'block') &&
      state.waitingForResponseIndex !== null
    ) {
      const expectedPlayer = state.players[state.waitingForResponseIndex];
      if (expectedPlayer?.isBot) {
        const resp = botMgr.decideResponse(expectedPlayer.id);
        localEngine.handleResponse(expectedPlayer.id, resp.type, resp.role);
        get().applyStateAfterMutation();
      }
    } else if (state.phase === 'losing_influence') {
      const expectedPlayer = state.losingInfluenceId
        ? state.players.find((p) => p.id === state.losingInfluenceId)
        : state.players[state.waitingForResponseIndex || 0];
      if (expectedPlayer?.isBot) {
        const cardToLose = expectedPlayer.cards.find((c: any) => !c.isFlipped);
        if (cardToLose) {
          localEngine.handleFlip(expectedPlayer.id, cardToLose.role);
          get().applyStateAfterMutation();
        }
      }
    } else if (state.phase === 'exchanging') {
      const expectedPlayer = state.players[state.turnIndex];
      if (expectedPlayer?.isBot) {
        const kept = expectedPlayer.cards
          .filter((c) => !c.isFlipped)
          .map((c) => c.role);
        localEngine.handleExchangeChoice(expectedPlayer.id, kept as any);
        get().applyStateAfterMutation();
      }
    }
  },

  clearHumanTimer: () => {
    if (humanTickHandle) {
      clearInterval(humanTickHandle);
      humanTickHandle = null;
    }
    if (get().turnTimer !== null) {
      set({ turnTimer: null });
    }
  },

  /**
   * Decide se o humano deve ver um timer: quando é VEZ dele decidir
   * algo e não há transição em curso.
   */
  maybeStartHumanTimer: () => {
    const {
      phase,
      currentPlayerId,
      waitingForResponseIndex,
      losingInfluenceId,
      players,
      transitioning,
      isOffline,
    } = get();

    if (transitioning || !isOffline) return;

    const myId = 'human-1';
    let myTurn = false;

    if (phase === 'action' && currentPlayerId === myId) myTurn = true;
    else if (
      (phase === 'challenge' || phase === 'block') &&
      waitingForResponseIndex !== null &&
      players[waitingForResponseIndex]?.id === myId
    ) {
      myTurn = true;
    } else if (phase === 'losing_influence' && losingInfluenceId === myId) {
      myTurn = true;
    } else if (phase === 'exchanging' && currentPlayerId === myId) {
      myTurn = true;
    }

    if (!myTurn) return;

    // Inicia contagem regressiva
    if (humanTickHandle) clearInterval(humanTickHandle);
    set({ turnTimer: TURN_TIMEOUT_S });
    humanTickHandle = setInterval(() => {
      const current = get().turnTimer;
      if (current === null) {
        if (humanTickHandle) {
          clearInterval(humanTickHandle);
          humanTickHandle = null;
        }
        return;
      }
      if (current <= 1) {
        if (humanTickHandle) {
          clearInterval(humanTickHandle);
          humanTickHandle = null;
        }
        set({ turnTimer: 0 });
        get().autoHumanAction();
      } else {
        set({ turnTimer: current - 1 });
      }
    }, 1000);
  },

  autoHumanAction: () => {
    const { isOffline, localEngine, transitioning } = get();
    if (!isOffline || !localEngine || transitioning) return;

    const state = localEngine.getState();
    const botMgr = new BotManager(localEngine);
    const myId = 'human-1';

    if (state.phase === 'action' && state.players[state.turnIndex]?.id === myId) {
      const action = botMgr.decideAction(myId);
      if (action) {
        const beforeStamp =
          (localEngine.getState() as any).lastInvalid?.stamp || 0;
        localEngine.handleAction(myId, action);
        const afterInvalid = (localEngine.getState() as any).lastInvalid;
        // Se o bot de emergência escolheu algo inválido (não deveria acontecer),
        // cai num fallback seguro: income, que nunca falha.
        if (afterInvalid && afterInvalid.stamp > beforeStamp) {
          localEngine.handleAction(myId, { type: 'income', source: myId });
          get().bumpCampaignIncome();
        } else if (action.type === 'income') {
          get().bumpCampaignIncome();
        }
        get().applyStateAfterMutation();
      }
    } else if (
      (state.phase === 'challenge' || state.phase === 'block') &&
      state.waitingForResponseIndex !== null &&
      state.players[state.waitingForResponseIndex]?.id === myId
    ) {
      const resp = botMgr.decideResponse(myId);
      localEngine.handleResponse(myId, resp.type, resp.role);
      get().applyStateAfterMutation();
    } else if (state.phase === 'losing_influence' && state.losingInfluenceId === myId) {
      const me = state.players.find((p) => p.id === myId);
      const card = me?.cards.find((c) => !c.isFlipped);
      if (card) {
        localEngine.handleFlip(myId, card.role);
        get().applyStateAfterMutation();
      }
    } else if (state.phase === 'exchanging' && state.players[state.turnIndex]?.id === myId) {
      const me = state.players.find((p) => p.id === myId);
      const kept = me?.cards.filter((c) => !c.isFlipped).map((c) => c.role) || [];
      localEngine.handleExchangeChoice(myId, kept as any);
      get().applyStateAfterMutation();
    }
  },

  getGraveyardStats: () => {
    const { players } = get();
    const roles = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
    const totalPerRole = 3;

    return roles.map((role) => {
      let dead = 0;
      players.forEach((p) => {
        p.cards?.forEach((c: any) => {
          if (c.role === role && c.isFlipped) dead++;
        });
      });
      return { role, dead, remaining: totalPerRole - dead };
    });
  },
};
});
