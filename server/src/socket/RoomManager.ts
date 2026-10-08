import { Server, Socket } from 'socket.io';
import { CoupEngine } from '../engine/CoupEngine.js';
import { BotManager } from '../engine/BotManager.js';
import type { Action, BotPersonality, GameState, Role } from '../engine/types.js';

/** Atraso entre jogadas de bots, para a mesa ter tempo de animar. */
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 1400);
/** Tempo máximo para um humano decidir antes da IA jogar por ele. */
const HUMAN_TIMEOUT_MS = 45_000;
const MAX_PLAYERS = 6;

const PERSONALITIES: BotPersonality[] = ['cautious', 'tyrant', 'bluffer', 'balanced'];
const BOT_NAMES = [
  'Duque Aldric', 'Duquesa Elara', 'Conde Baltasar', 'Condessa Margarida',
  'Barão Rufus', 'Baronesa Helvetia', 'Sir Tristão', 'Dama Morgana',
  'Lorde Mortimer', 'Lady Beatrice', 'Mestre Alistair', 'Capitão Harren',
];

type RoomEntry = {
  engine: CoupEngine;
  displayName: string;
  passwordPlain?: string;
  hostId: string;
  timer?: ReturnType<typeof setTimeout>;
};

function normRoomId(id: unknown): string {
  return typeof id === 'string' ? id.trim().toUpperCase() : '';
}

function roomIdOf(data: unknown): string {
  if (typeof data === 'string') return normRoomId(data);
  if (data && typeof data === 'object' && 'roomId' in data) {
    return normRoomId((data as { roomId: unknown }).roomId);
  }
  return '';
}

/** Quem o motor está esperando decidir agora. */
function pendingActor(st: GameState): string | undefined {
  switch (st.phase) {
    case 'action':
      return st.players[st.turnIndex]?.id;
    case 'challenge':
    case 'block':
    case 'exchanging':
      return st.waitingForResponseIndex === null
        ? undefined
        : st.players[st.waitingForResponseIndex]?.id;
    case 'losing_influence':
      return st.losingInfluenceId;
    default:
      return undefined;
  }
}

export class RoomManager {
  private rooms: Map<string, RoomEntry> = new Map();
  /** socket.id → roomId */
  private socketToRoom: Map<string, string> = new Map();

  constructor(private io: Server) {}

  /** Lista salas para o lobby. */
  public getLobbySummaries() {
    return [...this.rooms.entries()].map(([roomId, entry]) => ({
      roomId,
      displayName: entry.displayName,
      players: entry.engine.getState().players.length,
      maxPlayers: MAX_PLAYERS,
      hasPassword: !!entry.passwordPlain,
      inGame: entry.engine.isGameStarted(),
    }));
  }

  public handleConnection(rawSocket: Socket) {
    // Um payload malformado nunca pode derrubar o processo: cada handler
    // roda protegido e o erro só vai para o log.
    const socket = {
      id: rawSocket.id,
      emit: rawSocket.emit.bind(rawSocket),
      join: rawSocket.join.bind(rawSocket),
      leave: rawSocket.leave.bind(rawSocket),
      on: (event: string, handler: (...args: any[]) => void) =>
        rawSocket.on(event, (...args: any[]) => {
          try {
            handler(...args);
          } catch (err) {
            console.error(`[room] erro em "${event}" de ${rawSocket.id}:`, err);
          }
        }),
    } as unknown as Socket;
    socket.on('create_room', (data: { displayName?: string; roomName?: string; playerName?: string; password?: string }) => {
      const dn = (data?.displayName ?? data?.roomName ?? '').trim();
      const pn = (data?.playerName ?? '').trim();
      if (!dn || !pn) {
        socket.emit('room_error', { code: 'INVALID', message: 'Nome da sala e do jogador são obrigatórios.' });
        return;
      }
      this.leaveCurrentRoom(socket);
      let roomId = '';
      do {
        roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
      } while (this.rooms.has(roomId));
      const engine = new CoupEngine(roomId);
      engine.addPlayer(socket.id, pn.slice(0, 24));
      const pw = data.password?.trim();
      this.rooms.set(roomId, {
        engine,
        displayName: dn.slice(0, 48),
        hostId: socket.id,
        ...(pw ? { passwordPlain: pw.slice(0, 64) } : {}),
      });
      socket.join(roomId);
      this.socketToRoom.set(socket.id, roomId);
      socket.emit('room_created', { roomId });
      this.broadcast(roomId);
    });

    socket.on('join_room', (data: { roomId?: string; playerName?: string; password?: string }) => {
      const rid = normRoomId(data?.roomId);
      const pn = (data?.playerName ?? '').trim();
      if (!rid || !pn) {
        socket.emit('room_error', { code: 'INVALID', message: 'Código da sala e nome do jogador são obrigatórios.' });
        return;
      }
      const entry = this.rooms.get(rid);
      if (!entry) {
        socket.emit('room_error', { code: 'NOT_FOUND', message: 'Sala inexistente.' });
        return;
      }
      if (entry.engine.isGameStarted()) {
        socket.emit('room_error', { code: 'IN_GAME', message: 'A partida já começou.' });
        return;
      }
      if (entry.engine.getState().players.length >= MAX_PLAYERS) {
        socket.emit('room_error', { code: 'FULL', message: 'Sala cheia (máx. 6 jogadores).' });
        return;
      }
      if (entry.passwordPlain && entry.passwordPlain !== (data.password?.trim() ?? '')) {
        socket.emit('room_error', { code: 'BAD_PASSWORD', message: 'Senha incorreta.' });
        return;
      }
      this.leaveCurrentRoom(socket);
      entry.engine.addPlayer(socket.id, pn.slice(0, 24));
      socket.join(rid);
      this.socketToRoom.set(socket.id, rid);
      this.broadcast(rid);
    });

    socket.on('add_bot', (data: unknown) => {
      const rid = roomIdOf(data);
      const entry = this.rooms.get(rid);
      if (!entry || entry.hostId !== socket.id || entry.engine.isGameStarted()) return;
      const st = entry.engine.getState();
      if (st.players.length >= MAX_PLAYERS) return;
      const taken = new Set(st.players.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${st.players.length + 1}`;
      const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
      entry.engine.addPlayer(`bot_${Math.random().toString(36).substring(2, 9)}`, name, true, personality);
      this.broadcast(rid);
    });

    socket.on('start_game', (data: unknown) => {
      const rid = roomIdOf(data);
      const entry = this.rooms.get(rid);
      if (!entry || entry.hostId !== socket.id || entry.engine.isGameStarted()) return;
      const engine = entry.engine;
      if (engine.getState().players.length < 2) {
        engine.addPlayer('bot_auto_1', BOT_NAMES[0]!, true, 'balanced');
      }
      engine.startGame();
      this.afterMutation(rid);
    });

    socket.on('play_again', (data: unknown) => {
      const rid = roomIdOf(data);
      const entry = this.rooms.get(rid);
      if (!entry || entry.hostId !== socket.id) return;
      if (entry.engine.getState().phase !== 'game_over') return;
      const fresh = new CoupEngine(rid);
      for (const p of entry.engine.getState().players) {
        if (!p.isBot && !p.isConnected) continue;
        fresh.addPlayer(p.id, p.name, p.isBot, p.personality);
      }
      entry.engine = fresh;
      this.clearTimer(entry);
      this.broadcast(rid);
    });

    socket.on('game_action', (data: { roomId: string; action: Action }) => {
      this.mutate(data, (e) => {
        if (!data?.action || typeof data.action !== 'object') return;
        e.handleAction(socket.id, { ...data.action, source: socket.id });
      });
    });

    socket.on('game_response', (data: { roomId: string; response: unknown; role?: Role }) => {
      this.mutate(data, (e) => {
        const r = data?.response;
        // Compatível com clientes antigos que mandavam { type, role }.
        const type = typeof r === 'string' ? r : (r as { type?: string })?.type;
        const role = data?.role ?? (r as { role?: Role })?.role;
        if (type === 'pass' || type === 'allow' || type === 'challenge' || type === 'block') {
          e.handleResponse(socket.id, type, role);
        }
      });
    });

    socket.on('select_influence', (data: { roomId: string; role: Role }) => {
      this.mutate(data, (e) => e.handleFlip(socket.id, data.role));
    });

    socket.on('confirm_exchange', (data: { roomId: string; keptRoles: Role[] }) => {
      this.mutate(data, (e) => {
        if (Array.isArray(data?.keptRoles)) e.handleExchangeChoice(socket.id, data.keptRoles);
      });
    });

    socket.on('leave_room', () => this.leaveCurrentRoom(socket));
  }

  public handleDisconnect(socket: Socket) {
    this.leaveCurrentRoom(socket);
  }

  private leaveCurrentRoom(socket: Socket) {
    const roomId = this.socketToRoom.get(socket.id);
    if (!roomId) return;
    this.socketToRoom.delete(socket.id);
    socket.leave(roomId);
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    // No lobby sai da lista; na partida, abandona (perde as influências).
    entry.engine.forfeitPlayer(socket.id);
    const humans = entry.engine
      .getState()
      .players.filter((p) => !p.isBot && p.isConnected);
    if (humans.length === 0) {
      this.clearTimer(entry);
      this.rooms.delete(roomId);
      return;
    }
    if (entry.hostId === socket.id) entry.hostId = humans[0]!.id;
    this.afterMutation(roomId);
  }

  private mutate(data: unknown, fn: (engine: CoupEngine) => void) {
    const rid = roomIdOf(data);
    const entry = this.rooms.get(rid);
    if (!entry || !entry.engine.isGameStarted()) return;
    fn(entry.engine);
    this.afterMutation(rid);
  }

  private clearTimer(entry: RoomEntry) {
    if (entry.timer) clearTimeout(entry.timer);
    delete entry.timer;
  }

  /** Transmite o estado e agenda a próxima jogada de bot (ou o relógio do humano). */
  private afterMutation(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    this.broadcast(roomId);
    this.clearTimer(entry);
    if (!entry.engine.isGameStarted()) return;

    const st = entry.engine.getState();
    const actorId = pendingActor(st);
    if (!actorId) return;
    const actor = st.players.find((p) => p.id === actorId);
    if (!actor) return;

    entry.timer = setTimeout(
      () => {
        delete entry.timer;
        if (this.rooms.get(roomId) !== entry) return;
        // Garante que ninguém jogou nesse meio tempo.
        if (pendingActor(entry.engine.getState()) !== actorId) return;
        try {
          this.playFor(entry.engine, actorId);
        } catch (err) {
          console.error(`[room ${roomId}] erro ao jogar por ${actorId}:`, err);
        }
        this.afterMutation(roomId);
      },
      actor.isBot ? BOT_DELAY_MS : HUMAN_TIMEOUT_MS,
    );
  }

  /** IA decide pelo jogador (bot, ou humano que estourou o tempo). */
  private playFor(engine: CoupEngine, playerId: string) {
    const st = engine.getState();
    const bots = new BotManager(engine);
    const player = st.players.find((p) => p.id === playerId);
    if (!player) return;

    switch (st.phase) {
      case 'action': {
        let action = bots.decideAction(playerId) ?? { type: 'income' as const, source: playerId };
        if (!engine.validateAction(playerId, action).ok) action = { type: 'income', source: playerId };
        engine.handleAction(playerId, action);
        return;
      }
      case 'challenge':
      case 'block': {
        const r = bots.decideResponse(playerId);
        engine.handleResponse(playerId, r.type, r.role);
        return;
      }
      case 'losing_influence': {
        const idx = bots.decideCardToLose(playerId);
        const card = player.cards[idx] && !player.cards[idx]!.isFlipped
          ? player.cards[idx]
          : player.cards.find((c) => !c.isFlipped);
        if (card) engine.handleFlip(playerId, card.role);
        return;
      }
      case 'exchanging': {
        const alive = player.cards.filter((c) => !c.isFlipped).map((c) => c.role);
        engine.handleExchangeChoice(playerId, bots.decideExchange(playerId, alive, st.exchangingCards ?? []));
        return;
      }
    }
  }

  /** Cada jogador recebe sua própria visão: cartas vivas alheias e o baralho ficam ocultos. */
  private viewFor(entry: RoomEntry, viewerId: string) {
    const st = entry.engine.getState();
    const reveal = st.phase === 'game_over';
    const { deck, exchangingCards, ...rest } = st;
    const exchanger = st.waitingForResponseIndex !== null ? st.players[st.waitingForResponseIndex]?.id : undefined;
    return {
      ...rest,
      deckCount: deck.length,
      ...(exchangingCards && exchanger === viewerId ? { exchangingCards } : {}),
      players: st.players.map((p) => ({
        ...p,
        cards: p.cards.map((c) =>
          reveal || c.isFlipped || p.id === viewerId ? c : { role: null, isFlipped: false },
        ),
      })),
      roomMeta: {
        displayName: entry.displayName,
        hasPassword: !!entry.passwordPlain,
        hostId: entry.hostId,
        started: entry.engine.isGameStarted(),
      },
    };
  }

  private broadcast(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    for (const p of entry.engine.getState().players) {
      if (p.isBot || !p.isConnected) continue;
      this.io.to(p.id).emit('room_update', this.viewFor(entry, p.id));
    }
  }
}
