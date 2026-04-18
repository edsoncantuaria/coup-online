import TcpSocket from 'react-native-tcp-socket';
import { Platform } from 'react-native';
import { CoupEngine } from '../engine/CoupEngine';
import { BotManager } from '../engine/BotManager';
import type { Role } from '../engine/types';
import {
  COUP_OK,
  COUP_PING,
  LAN_HOST_PORT_MAX,
  LAN_HOST_PORT_MIN,
} from './lanConstants';

type RoomEntry = {
  engine: CoupEngine;
  displayName: string;
  passwordPlain?: string;
};

function normRoomId(id: string): string {
  return id.trim().toUpperCase();
}

type EmitFn = (event: string, data?: unknown) => void;

/** Socket falso do anfitrião (mesmo processo, sem TCP). */
export class HostFakeSocket {
  id: string;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(id: string, private readonly host: LanGameHost) {
    this.id = id;
  }

  on(event: string, fn: (...args: unknown[]) => void) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
  }

  once(event: string, fn: (...args: unknown[]) => void) {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      fn(...args);
    };
    this.on(event, wrapped);
  }

  off(event: string, fn?: (...args: unknown[]) => void) {
    const set = this.listeners.get(event);
    if (!set) return;
    if (fn) set.delete(fn);
    else set.clear();
  }

  emit(event: string, data?: unknown) {
    this.host.handleSocketEmit(this, event, data);
  }

  disconnect() {
    this.host.handleSocketDisconnect(this);
  }

  removeAllListeners() {
    this.listeners.clear();
  }

  /** Chamado pelo host ao fazer broadcast para a sala do anfitrião. */
  deliver(event: string, data?: unknown) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(data);
      } catch {
        /* ignore */
      }
    });
  }
}

export class LanGameHost {
  private server: ReturnType<typeof TcpSocket.createServer> | null = null;
  private port = 0;
  private rooms: Map<string, RoomEntry> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private remoteEmitters = new Map<string, EmitFn>();
  private hostSocket: HostFakeSocket | null = null;

  getPort(): number {
    return this.port;
  }

  createHostSocket(): HostFakeSocket {
    const id = `host_${Math.random().toString(36).slice(2, 11)}`;
    const sock = new HostFakeSocket(id, this);
    this.hostSocket = sock;
    return sock;
  }

  handleSocketEmit(
    socket: HostFakeSocket | { id: string },
    event: string,
    data?: unknown
  ) {
    const sid = socket.id;
    const emit = (ev: string, payload?: unknown) => {
      if (socket instanceof HostFakeSocket) {
        socket.deliver(ev, payload);
      } else {
        const fn = this.remoteEmitters.get(sid);
        if (fn) fn(ev, payload);
      }
    };

    if (event === 'create_room') {
      const d = data as {
        displayName?: string;
        roomName?: string;
        playerName?: string;
        password?: string;
      };
      const dn = (d.displayName ?? d.roomName ?? '').trim();
      const pn = (d.playerName ?? '').trim();
      if (!dn || !pn) {
        emit('room_error', {
          code: 'INVALID',
          message: 'Nome da sala e do jogador são obrigatórios.',
        });
        return;
      }
      const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
      const engine = new CoupEngine(roomId);
      engine.addPlayer(sid, pn);
      const pw = d.password?.trim();
      const entry: RoomEntry = {
        engine,
        displayName: dn.slice(0, 48),
        ...(pw ? { passwordPlain: pw.slice(0, 64) } : {}),
      };
      this.rooms.set(roomId, entry);
      this.socketToRoom.set(sid, roomId);
      emit('room_created', { roomId });
      this.broadcastRoomUpdate(roomId);
      return;
    }

    if (event === 'join_room') {
      const d = data as {
        roomId?: string;
        playerName?: string;
        password?: string;
      };
      const rid = d.roomId ? normRoomId(d.roomId) : '';
      const pn = (d.playerName ?? '').trim();
      if (!rid || !pn) {
        emit('room_error', {
          code: 'INVALID',
          message: 'Código da sala e nome do jogador são obrigatórios.',
        });
        return;
      }
      const entry = this.rooms.get(rid);
      if (!entry) {
        emit('room_error', { code: 'NOT_FOUND', message: 'Sala inexistente.' });
        return;
      }
      if (entry.engine.getState().players.length >= 6) {
        emit('room_error', {
          code: 'FULL',
          message: 'Sala cheia (máx. 6 jogadores).',
        });
        return;
      }
      const need = entry.passwordPlain;
      const got = d.password?.trim() ?? '';
      if (need && need !== got) {
        emit('room_error', { code: 'BAD_PASSWORD', message: 'Senha incorreta.' });
        return;
      }
      entry.engine.addPlayer(sid, pn);
      this.socketToRoom.set(sid, rid);
      this.broadcastRoomUpdate(rid);
      return;
    }

    if (event === 'add_bot') {
      const roomId = typeof data === 'string' ? normRoomId(data) : '';
      const entry = this.rooms.get(roomId);
      if (entry && entry.engine.getState().players.length < 6) {
        const engine = entry.engine;
        const botId = `bot_${Math.random().toString(36).substring(7)}`;
        const botName = `Bot ${engine.getState().players.length + 1}`;
        engine.addPlayer(botId, botName, true);
        this.broadcastRoomUpdate(roomId);
      }
      return;
    }

    if (event === 'start_game') {
      const roomId = typeof data === 'string' ? normRoomId(data) : '';
      const entry = this.rooms.get(roomId);
      if (!entry) return;
      const engine = entry.engine;
      if (engine.getState().players.length < 1) return;
      if (engine.getState().players.length < 2) {
        engine.addPlayer('bot_auto_1', 'Bot 1', true);
      }
      engine.startGame();
      this.broadcastRoomUpdate(roomId);
      this.checkBotTurn(roomId);
      return;
    }

    if (event === 'game_action') {
      const d = data as { roomId: string; action: unknown };
      const rid = d?.roomId ? normRoomId(d.roomId) : '';
      const entry = this.rooms.get(rid);
      if (!entry) return;
      entry.engine.handleAction(sid, d.action as never);
      this.broadcastRoomUpdate(rid);
      this.checkBotTurn(rid);
      return;
    }

    if (event === 'game_response') {
      const d = data as { roomId: string; response: any; role?: string };
      const rid = d?.roomId ? normRoomId(d.roomId) : '';
      const entry = this.rooms.get(rid);
      if (!entry) return;
      entry.engine.handleResponse(sid, d.response, d.role as Role | undefined);
      this.broadcastRoomUpdate(rid);
      this.checkBotTurn(rid);
      return;
    }
  }

  handleSocketDisconnect(socket: HostFakeSocket | { id: string }) {
    const sid = socket.id;
    if (socket instanceof HostFakeSocket) {
      this.hostSocket = null;
    } else {
      this.remoteEmitters.delete(sid);
    }
    const roomId = this.socketToRoom.get(sid);
    if (!roomId) return;
    this.socketToRoom.delete(sid);
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    entry.engine.disconnectPlayer(sid);
    if (entry.engine.getState().players.length === 0) {
      this.rooms.delete(roomId);
      return;
    }
    this.broadcastRoomUpdate(roomId);
    this.checkBotTurn(roomId);
  }

  getLobbySummaries() {
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

    const memberIds = new Set<string>();
    for (const [sockId, rid] of this.socketToRoom) {
      if (rid === roomId) memberIds.add(sockId);
    }

    memberIds.forEach((sockId) => {
      if (this.hostSocket && sockId === this.hostSocket.id) {
        this.hostSocket.deliver('room_update', payload);
      } else {
        const fn = this.remoteEmitters.get(sockId);
        if (fn) fn('room_update', payload);
      }
    });
  }

  private checkBotTurn(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    const engine = entry.engine;
    const state = engine.getState();
    const botMgr = new BotManager(engine);

    if (state.phase === 'action') {
      const currentPlayer = state.players[state.turnIndex];
      if (currentPlayer?.isBot && currentPlayer.cards.length > 0) {
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
            engine.handleResponse(bot.id, response.type, response.role);
          });
          this.broadcastRoomUpdate(roomId);
          this.checkBotTurn(roomId);
        }, 1000);
      }
    }
  }

  async start(): Promise<{ port: number }> {
    if (Platform.OS === 'web') {
      throw new Error('Servidor LAN não roda no navegador.');
    }
    await this.stop();

    for (let p = LAN_HOST_PORT_MIN; p <= LAN_HOST_PORT_MAX; p++) {
      const ok = await new Promise<boolean>((resolve) => {
        const srv = TcpSocket.createServer((socket) => {
          const socketId = `s_${Math.random().toString(36).slice(2, 12)}`;
          let buf = '';

          const sendObj = (obj: unknown) => {
            try {
              socket.write(`${JSON.stringify(obj)}\n`);
            } catch {
              /* ignore */
            }
          };

          const emitRemote: EmitFn = (ev, payload) => {
            sendObj({ t: 'ev', e: ev, d: payload });
          };
          this.remoteEmitters.set(socketId, emitRemote);

          sendObj({ t: 'hi', id: socketId });

          socket.on('data', (chunk: Buffer | string) => {
            const raw = typeof chunk === 'string' ? chunk : chunk.toString();
            if (raw.includes('COUP_PING')) {
              socket.write(COUP_OK);
              return;
            }
            buf += raw;
            const parts = buf.split('\n');
            buf = parts.pop() ?? '';
            for (const line of parts) {
              const lineTrim = line.trim();
              if (!lineTrim) continue;
              let msg: {
                t?: string;
                e?: string;
                d?: unknown;
                m?: string;
              };
              try {
                msg = JSON.parse(lineTrim);
              } catch {
                continue;
              }

              if (msg.t === 'rpc' && msg.m === 'rooms') {
                sendObj({
                  t: 'rpc_ok',
                  m: 'rooms',
                  d: { rooms: this.getLobbySummaries() },
                });
                continue;
              }

              if (msg.t === 'e' && msg.e) {
                this.handleSocketEmit({ id: socketId }, msg.e, msg.d);
              }
            }
          });

          socket.on('error', () => {});
          socket.on('close', () => {
            this.handleSocketDisconnect({ id: socketId });
          });
        });

        const onFail = () => {
          try {
            srv.close();
          } catch {
            /* ignore */
          }
          resolve(false);
        };

        srv.once('error', onFail);
        try {
          srv.listen({ port: p, host: '0.0.0.0', reuseAddress: true }, () => {
            srv.removeListener('error', onFail);
            this.server = srv;
            this.port = p;
            resolve(true);
          });
        } catch {
          resolve(false);
        }
      });

      if (ok) return { port: p };
    }

    throw new Error('Nenhuma porta livre para o servidor na rede.');
  }

  async stop(): Promise<void> {
    if (this.server) {
      try {
        this.server.close();
      } catch {
        /* ignore */
      }
      this.server = null;
    }
    this.port = 0;
    this.rooms.clear();
    this.socketToRoom.clear();
    this.remoteEmitters.clear();
    this.hostSocket = null;
  }
}

let singleton: LanGameHost | null = null;

export function getLanGameHost(): LanGameHost {
  if (!singleton) singleton = new LanGameHost();
  return singleton;
}
