import { Server, Socket } from 'socket.io';
import { CoupEngine } from '../engine/CoupEngine.js';
import { BotManager } from '../engine/BotManager.js';

type RoomEntry = {
  engine: CoupEngine;
  displayName: string;
  passwordPlain?: string;
};

function normRoomId(id: string): string {
  return id.trim().toUpperCase();
}

export class RoomManager {
  private rooms: Map<string, RoomEntry> = new Map();
  private bots: Map<string, BotManager> = new Map();
  /** socket.id → roomId */
  private socketToRoom: Map<string, string> = new Map();

  constructor(private io: Server) {}

  /** Lista salas para o lobby (descoberta na rede / app). */
  public getLobbySummaries(): Array<{
    roomId: string;
    displayName: string;
    players: number;
    maxPlayers: number;
    hasPassword: boolean;
    inGame: boolean;
  }> {
    const out: Array<{
      roomId: string;
      displayName: string;
      players: number;
      maxPlayers: number;
      hasPassword: boolean;
      inGame: boolean;
    }> = [];
    for (const [roomId, entry] of this.rooms) {
      const st = entry.engine.getState();
      out.push({
        roomId,
        displayName: entry.displayName,
        players: st.players.length,
        maxPlayers: 6,
        hasPassword: !!entry.passwordPlain,
        inGame: entry.engine.isGameStarted(),
      });
    }
    return out;
  }

  public handleConnection(socket: Socket) {
    socket.on(
      'create_room',
      (data: {
        displayName?: string;
        roomName?: string;
        playerName?: string;
        password?: string;
      }) => {
        const dn = (data.displayName ?? data.roomName ?? '').trim();
        const pn = (data.playerName ?? '').trim();
        if (!dn || !pn) {
          socket.emit('room_error', {
            code: 'INVALID',
            message: 'Nome da sala e do jogador são obrigatórios.',
          });
          return;
        }
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const engine = new CoupEngine(roomId);
        engine.addPlayer(socket.id, pn);
        const pw = data.password?.trim();
        const entry: RoomEntry = {
          engine,
          displayName: dn.slice(0, 48),
          ...(pw ? { passwordPlain: pw.slice(0, 64) } : {}),
        };
        this.rooms.set(roomId, entry);
        socket.join(roomId);
        this.socketToRoom.set(socket.id, roomId);
        socket.emit('room_created', { roomId });
        this.broadcastRoomUpdate(roomId);
      }
    );

    socket.on(
      'join_room',
      (data: {
        roomId?: string;
        playerName?: string;
        password?: string;
      }) => {
        const rid = data.roomId ? normRoomId(data.roomId) : '';
        const pn = (data.playerName ?? '').trim();
        if (!rid || !pn) {
          socket.emit('room_error', {
            code: 'INVALID',
            message: 'Código da sala e nome do jogador são obrigatórios.',
          });
          return;
        }
        const entry = this.rooms.get(rid);
        if (!entry) {
          socket.emit('room_error', {
            code: 'NOT_FOUND',
            message: 'Sala inexistente.',
          });
          return;
        }
        if (entry.engine.getState().players.length >= 6) {
          socket.emit('room_error', {
            code: 'FULL',
            message: 'Sala cheia (máx. 6 jogadores).',
          });
          return;
        }
        const need = entry.passwordPlain;
        const got = data.password?.trim() ?? '';
        if (need && need !== got) {
          socket.emit('room_error', {
            code: 'BAD_PASSWORD',
            message: 'Senha incorreta.',
          });
          return;
        }
        entry.engine.addPlayer(socket.id, pn);
        socket.join(rid);
        this.socketToRoom.set(socket.id, rid);
        this.broadcastRoomUpdate(rid);
      }
    );

    socket.on('add_bot', (roomId: string) => {
      const rid = typeof roomId === 'string' ? normRoomId(roomId) : '';
      const entry = this.rooms.get(rid);
      if (
        entry &&
        entry.engine.getState().players.length < 6
      ) {
        const engine = entry.engine;
        const botId = `bot_${Math.random().toString(36).substring(7)}`;
        const botName = `Bot ${engine.getState().players.length + 1}`;
        engine.addPlayer(botId, botName, true);
        this.broadcastRoomUpdate(rid);
      }
    });

    socket.on('start_game', (roomId: string) => {
      const rid = typeof roomId === 'string' ? normRoomId(roomId) : '';
      const entry = this.rooms.get(rid);
      if (!entry) return;
      const engine = entry.engine;
      const currentCount = engine.getState().players.length;
      if (currentCount < 1) return;

      if (currentCount < 2) {
        const botId = `bot_auto_1`;
        engine.addPlayer(botId, `Bot 1`, true);
      }

      engine.startGame();
      this.broadcastRoomUpdate(rid);
      this.checkBotTurn(rid);
    });

    socket.on('game_action', (data: { roomId: string; action: any }) => {
      const rid = data?.roomId ? normRoomId(data.roomId) : '';
      const entry = this.rooms.get(rid);
      if (!entry) return;
      entry.engine.handleAction(socket.id, data.action);
      this.broadcastRoomUpdate(rid);
      this.checkBotTurn(rid);
    });

    socket.on('game_response', (data: { roomId: string; response: any }) => {
      const rid = data?.roomId ? normRoomId(data.roomId) : '';
      const entry = this.rooms.get(rid);
      if (!entry) return;
      entry.engine.handleResponse(socket.id, data.response);
      this.broadcastRoomUpdate(rid);
      this.checkBotTurn(rid);
    });
  }

  public handleDisconnect(socket: Socket) {
    const roomId = this.socketToRoom.get(socket.id);
    if (!roomId) return;
    this.socketToRoom.delete(socket.id);
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    entry.engine.disconnectPlayer(socket.id);
    if (entry.engine.getState().players.length === 0) {
      this.rooms.delete(roomId);
      this.bots.delete(roomId);
      return;
    }
    this.broadcastRoomUpdate(roomId);
    this.checkBotTurn(roomId);
  }

  private broadcastRoomUpdate(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    const state = entry.engine.getState();
    const payload = {
      ...state,
      roomMeta: {
        displayName: entry.displayName,
        hasPassword: !!entry.passwordPlain,
      },
    };
    this.io.to(roomId).emit('room_update', payload);
  }

  private checkBotTurn(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    const engine = entry.engine;

    const state = engine.getState();
    const botMgr = new BotManager(engine);

    if (state.phase === 'action') {
      const currentPlayer = state.players[state.turnIndex];
      if (currentPlayer && currentPlayer.isBot && currentPlayer.cards.length > 0) {
        setTimeout(() => {
          const action = botMgr.decideAction(currentPlayer.id);
          if (action) {
            engine.handleAction(currentPlayer.id, action);
            this.broadcastRoomUpdate(roomId);
            this.checkBotTurn(roomId);
          }
        }, 1500);
        return;
      }
    }

    if (state.phase === 'challenge' || state.phase === 'block') {
      const botsToRespond = state.players.filter(
        (p) => p.isBot && p.cards.length > 0 && !state.responses[p.id]
      );

      if (botsToRespond.length > 0) {
        setTimeout(() => {
          botsToRespond.forEach((bot) => {
            const response = botMgr.decideResponse(bot.id);
            engine.handleResponse(bot.id, response);
          });
          this.broadcastRoomUpdate(roomId);
          this.checkBotTurn(roomId);
        }, 1000);
      }
    }
  }
}
