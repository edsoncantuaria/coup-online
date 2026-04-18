import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { CoupEngine } from '../engine/CoupEngine';
import { BotManager } from '../engine/BotManager';

interface GameState {
  roomId: string | null;
  players: any[];
  phase: string;
  logs: string[];
  currentPlayerId: string | null;
  waitingForResponseIndex: number | null;
  socket: Socket | null;
  isOffline: boolean;
  localEngine: CoupEngine | null;
  currentAction: any;
  pendingBlock: any;
  
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
  getGraveyardStats: () => { role: string; dead: number; remaining: number }[];
}

export const useGameState = create<GameState>((set, get) => ({
  roomId: null,
  players: [],
  phase: 'lobby',
  logs: [],
  currentPlayerId: null,
  waitingForResponseIndex: null,
  socket: null,
  isOffline: false,
  localEngine: null,
  currentAction: null,
  pendingBlock: null,

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
        currentAction: state.currentAction ? { ...state.currentAction } : null,
        pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null,
        isOffline: false
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
      currentAction: null,
      pendingBlock: null,
      logs: ['Modo Offline iniciado.']
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
      const state = localEngine.getState();
      set({ 
        players: [...state.players],
        phase: state.phase,
        logs: [...state.logs],
        currentPlayerId: state.players[state.turnIndex]?.id,
        waitingForResponseIndex: state.waitingForResponseIndex,
        currentAction: state.currentAction ? { ...state.currentAction } : null,
        pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null
      });
      get().checkBotTurns();
    } else if (socket && roomId) {
      socket.emit('start_game', roomId);
    }
  },

  addBot: () => {
    const { socket, roomId, isOffline, localEngine, players } = get();
    // Coup engine base game supports maximum 6 players
    if (players.length >= 6) {
      alert('A sala atingiu o limite máximo de 6 jogadores!');
      return;
    }

    if (isOffline && localEngine) {
      const botId = `bot-${Math.random().toString(36).substring(7)}`;
      localEngine.addPlayer(botId, `Bot ${localEngine.getState().players.length}`, true);
      const state = localEngine.getState();
      set({ 
        players: [...state.players],
        currentPlayerId: state.players[state.turnIndex]?.id,
        waitingForResponseIndex: state.waitingForResponseIndex,
        currentAction: state.currentAction ? { ...state.currentAction } : null,
        pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null
      });
    } else if (socket && roomId) {
      socket.emit('add_bot', roomId);
    }
  },

  sendAction: (action: any) => {
    const { socket, roomId, isOffline, localEngine } = get();
    if (isOffline && localEngine) {
      localEngine.handleAction('human-1', action);
      const state = localEngine.getState();
      set({ 
        players: [...state.players],
        phase: state.phase,
        logs: [...state.logs],
        currentPlayerId: state.players[state.turnIndex]?.id,
        waitingForResponseIndex: state.waitingForResponseIndex,
        currentAction: state.currentAction ? { ...state.currentAction } : null,
        pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null
      });
      get().checkBotTurns();
    } else if (socket && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  },

    sendResponse: (response: any, role?: string) => {
      const { socket, roomId, isOffline, localEngine } = get();
      if (isOffline && localEngine) {
        localEngine.handleResponse('human-1', response, role as any);
        const state = localEngine.getState();
        set({ 
          players: [...state.players],
          phase: state.phase,
          logs: [...state.logs],
          currentPlayerId: state.players[state.turnIndex]?.id,
          waitingForResponseIndex: state.waitingForResponseIndex,
          currentAction: state.currentAction ? { ...state.currentAction } : null,
          pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null
        });
        get().checkBotTurns();
      } else if (socket && roomId) {
        socket.emit('game_response', { roomId, response, role });
      }
    },
  
    selectInfluence: (role: string) => {
      const { socket, roomId, isOffline, localEngine } = get();
      if (isOffline && localEngine) {
        localEngine.handleFlip('human-1', role as any);
        const state = localEngine.getState();
        set({ 
          players: [...state.players],
          phase: state.phase,
          logs: [...state.logs],
          currentPlayerId: state.players[state.turnIndex]?.id,
          waitingForResponseIndex: state.waitingForResponseIndex,
          currentAction: state.currentAction ? { ...state.currentAction } : null,
          pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null
        });
        get().checkBotTurns();
      } else if (socket && roomId) {
        socket.emit('select_influence', { roomId, role });
      }
    },
  
    confirmExchange: (keptRoles: string[]) => {
      const { socket, roomId, isOffline, localEngine } = get();
      if (isOffline && localEngine) {
        localEngine.handleExchangeChoice('human-1', keptRoles as any);
        const state = localEngine.getState();
        set({ 
          players: [...state.players],
          phase: state.phase,
          logs: [...state.logs],
          currentPlayerId: state.players[state.turnIndex]?.id,
          waitingForResponseIndex: state.waitingForResponseIndex,
          currentAction: state.currentAction ? { ...state.currentAction } : null,
          pendingBlock: state.pendingBlock ? { ...state.pendingBlock } : null
        });
        get().checkBotTurns();
      } else if (socket && roomId) {
        socket.emit('confirm_exchange', { roomId, keptRoles });
      }
    },
  
    getCurrentPlayer: () => {
      const { isOffline, localEngine, players, currentPlayerId } = get();
      if (isOffline && localEngine) return localEngine.getCurrentPlayer();
      return players.find(p => p.id === currentPlayerId);
    },

    checkBotTurns: () => {
        const { isOffline, localEngine } = get();
        if (!isOffline || !localEngine) return;
    
        const state = localEngine.getState();
        const botMgr = new BotManager(localEngine);
    
        if (state.phase === 'action') {
          const currentPlayer = state.players[state.turnIndex];
          if (currentPlayer?.isBot) {
            setTimeout(() => {
              const action = botMgr.decideAction(currentPlayer.id);
              if (action) {
                localEngine.handleAction(currentPlayer.id, action);
                const newState = localEngine.getState();
                set({ 
                  players: [...newState.players],
                  phase: newState.phase,
                  logs: [...newState.logs],
                  currentPlayerId: newState.players[newState.turnIndex]?.id,
                  waitingForResponseIndex: newState.waitingForResponseIndex,
                  currentAction: newState.currentAction ? { ...newState.currentAction } : null,
                  pendingBlock: newState.pendingBlock ? { ...newState.pendingBlock } : null
                });
                get().checkBotTurns();
              }
            }, 3800); // Humans need time to read
          }
        } else if (state.phase === 'challenge' || state.phase === 'block') {
          if (state.waitingForResponseIndex !== null) {
            const expectedPlayer = state.players[state.waitingForResponseIndex];
            if (expectedPlayer?.isBot) {
              setTimeout(() => {
                const resp = botMgr.decideResponse(expectedPlayer.id);
                localEngine.handleResponse(expectedPlayer.id, resp.type, resp.role);
                const newState = localEngine.getState();
                set({ 
                  players: [...newState.players],
                  phase: newState.phase,
                  logs: [...newState.logs],
                  currentPlayerId: newState.players[newState.turnIndex]?.id,
                  waitingForResponseIndex: newState.waitingForResponseIndex,
                  currentAction: newState.currentAction ? { ...newState.currentAction } : null,
                  pendingBlock: newState.pendingBlock ? { ...newState.pendingBlock } : null
                });
                get().checkBotTurns();
              }, 3800); // Humans need time to read
            }
          }
        } else if (state.phase === 'losing_influence') {
            const expectedPlayer = state.players[state.waitingForResponseIndex || 0];
            if (expectedPlayer?.isBot) {
              setTimeout(() => {
                const cardToLose = expectedPlayer.cards.find(c => !c.isFlipped);
                if (cardToLose) {
                    localEngine.handleFlip(expectedPlayer.id, cardToLose.role);
                    const newState = localEngine.getState();
                    set({ 
                      players: [...newState.players],
                      phase: newState.phase,
                      logs: [...newState.logs],
                      currentPlayerId: newState.players[newState.turnIndex]?.id,
                      waitingForResponseIndex: newState.waitingForResponseIndex,
                      currentAction: newState.currentAction ? { ...newState.currentAction } : null,
                      pendingBlock: newState.pendingBlock ? { ...newState.pendingBlock } : null
                    });
                    get().checkBotTurns();
                }
              }, 3800);
            }
        } else if (state.phase === 'exchanging') {
            const expectedPlayer = state.players[state.turnIndex];
            if (expectedPlayer?.isBot) {
              setTimeout(() => {
                const kept = expectedPlayer.cards.filter(c => !c.isFlipped).map(c => c.role);
                localEngine.handleExchangeChoice(expectedPlayer.id, kept as any);
                const newState = localEngine.getState();
                set({ 
                  players: [...newState.players],
                  phase: newState.phase,
                  logs: [...newState.logs],
                  currentPlayerId: newState.players[newState.turnIndex]?.id,
                  waitingForResponseIndex: newState.waitingForResponseIndex,
                  currentAction: newState.currentAction ? { ...newState.currentAction } : null,
                  pendingBlock: newState.pendingBlock ? { ...newState.pendingBlock } : null
                });
                get().checkBotTurns();
              }, 3800);
            }
        }
    },

  getGraveyardStats: () => {
    const { players } = get();
    const roles = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
    const translateRole = (role: string): string => {
      const dict: Record<string, string> = {
        duke: 'Duque',
        assassin: 'Assassino',
        captain: 'Capitão',
        ambassador: 'Embaixador',
        contessa: 'Condessa'
      };
      return dict[role] || role;
    };
    const totalPerRole = 3;
    
    return roles.map(role => {
      let dead = 0;
      players.forEach(p => {
        p.cards?.forEach((c: any) => {
          if (c.role === role && c.isFlipped) dead++;
        });
      });
      return { role, dead, remaining: totalPerRole - dead };
    });
  }
}));
