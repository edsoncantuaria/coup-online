import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { CoupEngine } from '../engine/CoupEngine';
import { BotManager } from '../engine/BotManager';

// Janela global entre transições para dar "fôlego" visual
export const TRANSITION_MS = 3000;
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

  // Transições e timers
  transitioning: boolean;
  turnTimer: number | null; // segundos restantes para o humano agir

  // Actions
  connect: (url: string) => void;
  startOfflineGame: (playerName: string) => void;
  joinRoom: (roomId: string, name: string) => void;
  sendAction: (action: any) => void;
  sendResponse: (response: any, role?: string) => void;
  selectInfluence: (role: string) => void;
  confirmExchange: (keptRoles: string[]) => void;
  getCurrentPlayer: () => any;
  startGame: () => void;
  addBot: () => void;
  checkBotTurns: () => void;
  applyStateAfterMutation: (cooldownMs?: number) => void;
  maybeStartHumanTimer: () => void;
  clearHumanTimer: () => void;
  autoHumanAction: () => void;
  getGraveyardStats: () => { role: string; dead: number; remaining: number }[];
}

// Timer handles fora do store para evitar serialização
let transitionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let humanTickHandle: ReturnType<typeof setInterval> | null = null;

export const useGameState = create<GameState>((set, get) => ({
  roomId: null,
  players: [],
  phase: 'lobby',
  logs: [],
  currentPlayerId: null,
  waitingForResponseIndex: null,
  losingInfluenceId: null,
  socket: null,
  isOffline: false,
  localEngine: null,
  currentAction: null,
  pendingBlock: null,
  lastReveal: null,

  transitioning: false,
  turnTimer: null,

  connect: (url: string) => {
    const socket = io(url);

    socket.on('room_update', (state) => {
      set({
        players: [...state.players],
        phase: state.phase,
        logs: [...state.logs],
        roomId: state.roomId,
        socket: state.socket,
        currentPlayerId: state.players[state.turnIndex]?.id,
        waitingForResponseIndex: state.waitingForResponseIndex || null,
        losingInfluenceId: state.losingInfluenceId || null,
        currentAction: state.currentAction ? { ...state.currentAction } : null,
        pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
        isOffline: false,
      });
    });

    set({ socket });
  },

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
      currentAction: null,
      pendingBlock: null,
      lastReveal: null,
      transitioning: false,
      turnTimer: null,
      logs: ['Modo Offline iniciado.'],
    });
  },

  joinRoom: (roomId: string, name: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('join_room', { roomId, playerName: name });
      set({ roomId });
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
    const { socket, roomId, isOffline, localEngine, players } = get();
    if (players.length >= 6) {
      alert('A sala atingiu o limite máximo de 6 jogadores!');
      return;
    }

    if (isOffline && localEngine) {
      const botId = `bot-${Math.random().toString(36).substring(7)}`;
      localEngine.addPlayer(
        botId,
        `Bot ${localEngine.getState().players.length}`,
        true
      );
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

    // Para o timer do humano (qualquer transição renova)
    get().clearHumanTimer();

    set({
      players: [...state.players],
      phase: state.phase,
      logs: [...state.logs],
      currentPlayerId: state.players[state.turnIndex]?.id,
      waitingForResponseIndex: state.waitingForResponseIndex,
      losingInfluenceId: (state as any).losingInfluenceId || null,
      currentAction: state.currentAction ? { ...state.currentAction } : null,
      pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
      lastReveal: (state as any).lastReveal
        ? { ...(state as any).lastReveal }
        : null,
      transitioning: true,
      turnTimer: null,
    });

    transitionTimeoutHandle = setTimeout(() => {
      transitionTimeoutHandle = null;
      set({ transitioning: false });
      get().checkBotTurns();
      get().maybeStartHumanTimer();
    }, cooldownMs);
  },

  sendAction: (action: any) => {
    const { socket, roomId, isOffline, localEngine, transitioning } = get();
    if (transitioning) return;
    get().clearHumanTimer();
    if (isOffline && localEngine) {
      localEngine.handleAction('human-1', action);
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
        localEngine.handleAction(myId, action);
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
}));
