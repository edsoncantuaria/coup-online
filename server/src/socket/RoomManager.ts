import { Server, Socket } from 'socket.io';
import { CoupEngine } from '../engine/CoupEngine.js';
import { BotManager } from '../engine/BotManager.js';
import type { Action, BotPersonality, GameState, Role } from '../engine/types.js';
import { AppError, cleanText } from '../errors.js';

/** Tempo máximo para um humano decidir antes da IA jogar por ele. */
const HUMAN_TIMEOUT_MS = 45_000;
export const MAX_PLAYERS = 6;
/** Convite de amigo vale por este tempo. */
const INVITE_TTL_MS = 10 * 60 * 1000;
/** Quantos jogadores recentes cada socket lembra (para denúncias). */
const RECENT_LIMIT = 40;

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
  /** Quem está no chat de voz da sala → microfone mudo? */
  voice: Map<string, boolean>;
  /** Sala privada (só por código): não aparece na lista de salas abertas. */
  isPrivate: boolean;
  /** Criada pela fila de "Buscar partida". */
  matchmade: boolean;
  /** id do jogador (socket) → id da conta, para quem está logado. */
  accounts: Map<string, string>;
  /** Convites pendentes: id da conta → expira em (ms). */
  invites: Map<string, number>;
  /** Última situação avisada aos amigos (partida rolando ou não). */
  wasActive: boolean;
};

/** Um jogador com quem o socket dividiu a mesa recentemente. */
export type RecentPlayer = { playerId: string; name: string; userId?: string; roomId: string; at: number };

export type MatchMember = { socketId: string; name: string };

export type RoomHooks = {
  /** Conta logada no socket (a identidade nunca vem do cliente). */
  accountOf: (socketId: string) => { userId: string; username: string } | undefined;
  /** O socket entrou numa sala (sai da fila de partida). */
  onJoined: (socketId: string) => void;
  /** Mudou a situação desses sockets (lobby, partida, livre) — avisar amigos. */
  onPresence: (socketIds: string[]) => void;
  /** Mudou algo na lista de salas abertas. */
  onRoomsChanged: () => void;
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

function isActive(entry: RoomEntry): boolean {
  return entry.engine.isGameStarted() && entry.engine.getState().phase !== 'game_over';
}

export class RoomManager {
  private rooms: Map<string, RoomEntry> = new Map();
  /** socket.id → roomId */
  private socketToRoom: Map<string, string> = new Map();
  /** socket.id → jogadores com quem dividiu a mesa (id do jogador → dados). */
  private recent: Map<string, Map<string, RecentPlayer>> = new Map();

  constructor(
    private io: Server,
    private hooks: RoomHooks,
    private botDelayMs = Number(process.env.BOT_DELAY_MS ?? 1400),
  ) {}

  /** Salas públicas que ainda aceitam jogadores, para a lista do lobby. */
  public getLobbySummaries() {
    const out = [];
    for (const [roomId, entry] of this.rooms) {
      if (entry.isPrivate || entry.passwordPlain || entry.engine.isGameStarted()) continue;
      const players = entry.engine.getState().players;
      if (players.length >= MAX_PLAYERS) continue;
      const host = players.find((p) => p.id === entry.hostId);
      out.push({
        roomId,
        displayName: entry.displayName,
        hostName: host?.name ?? '',
        ...(entry.accounts.get(entry.hostId) ? { hostUserId: entry.accounts.get(entry.hostId) } : {}),
        players: players.length,
        humans: players.filter((p) => !p.isBot).length,
        maxPlayers: MAX_PLAYERS,
        hasPassword: false,
        inGame: false,
      });
    }
    return out;
  }

  /** Nome na mesa: o da conta, se logado; senão o que o cliente mandou. */
  private nameFor(socketId: string, requested: unknown): string {
    const acc = this.hooks.accountOf(socketId);
    if (acc) return acc.username;
    return typeof requested === 'string' ? cleanText(requested, 24) : '';
  }

  public roomOf(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  /** Situação do socket para a lista de amigos. */
  public statusOf(socketId: string): 'in_match' | 'in_lobby' | undefined {
    const roomId = this.socketToRoom.get(socketId);
    const entry = roomId ? this.rooms.get(roomId) : undefined;
    if (!entry) return undefined;
    return isActive(entry) ? 'in_match' : 'in_lobby';
  }

  public recentPlayer(socketId: string, playerId: string): RecentPlayer | undefined {
    return this.recent.get(socketId)?.get(playerId);
  }

  private newRoomId(): string {
    let roomId = '';
    do {
      roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    } while (roomId.length < 5 || this.rooms.has(roomId));
    return roomId;
  }

  private addHuman(entry: RoomEntry, roomId: string, socket: Pick<Socket, 'id' | 'join'>, name: string) {
    entry.engine.addPlayer(socket.id, name);
    const acc = this.hooks.accountOf(socket.id);
    if (acc) {
      entry.accounts.set(socket.id, acc.userId);
      entry.invites.delete(acc.userId);
    }
    socket.join(roomId);
    this.socketToRoom.set(socket.id, roomId);
    this.hooks.onJoined(socket.id);
  }

  private newEntry(engine: CoupEngine, displayName: string, hostId: string): RoomEntry {
    return {
      engine,
      displayName,
      hostId,
      voice: new Map(),
      isPrivate: false,
      matchmade: false,
      accounts: new Map(),
      invites: new Map(),
      wasActive: false,
    };
  }

  /**
   * Cria uma partida pública com os jogadores da fila (e bots completando a
   * mesa) e já a inicia.
   */
  public createMatch(members: MatchMember[], bots: number): string | undefined {
    const sockets = members
      .map((m) => ({ m, s: this.io.sockets.sockets.get(m.socketId) }))
      .filter((x): x is { m: MatchMember; s: Socket } => !!x.s?.connected);
    if (sockets.length === 0) return undefined;
    const roomId = this.newRoomId();
    const engine = new CoupEngine(roomId);
    const entry = this.newEntry(engine, 'Partida pública', sockets[0]!.s.id);
    entry.matchmade = true;
    this.rooms.set(roomId, entry);
    const taken = new Set<string>();
    for (const { m, s } of sockets) {
      this.leaveCurrentRoom(s);
      let name = m.name || 'Jogador';
      for (let i = 2; taken.has(name); i++) name = `${m.name} ${i}`;
      taken.add(name);
      this.addHuman(entry, roomId, s, name);
      s.emit('match_found', { roomId });
    }
    for (let i = 0; i < bots && engine.getState().players.length < MAX_PLAYERS; i++) this.addBotTo(entry);
    if (engine.getState().players.length < 2) this.addBotTo(entry);
    engine.startGame();
    this.afterMutation(roomId);
    return roomId;
  }

  /**
   * Convida uma conta para a sala (ainda no lobby) do socket. O convite deixa
   * entrar mesmo em sala com senha.
   */
  public invite(fromSocketId: string, userId: string) {
    const roomId = this.socketToRoom.get(fromSocketId);
    const entry = roomId ? this.rooms.get(roomId) : undefined;
    if (!roomId || !entry) throw new AppError('NOT_IN_ROOM', 'Entre numa sala para convidar.');
    if (entry.engine.isGameStarted()) throw new AppError('IN_GAME', 'A partida já começou.');
    if (entry.engine.getState().players.length >= MAX_PLAYERS) throw new AppError('FULL', 'Sala cheia.');
    const expiresAt = Date.now() + INVITE_TTL_MS;
    entry.invites.set(userId, expiresAt);
    return { roomId, roomName: entry.displayName, expiresAt };
  }

  private addBotTo(entry: RoomEntry) {
    const st = entry.engine.getState();
    const taken = new Set(st.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${st.players.length + 1}`;
    const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    entry.engine.addPlayer(`bot_${Math.random().toString(36).substring(2, 9)}`, name, true, personality);
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
    socket.on(
      'create_room',
      (data: { displayName?: string; roomName?: string; playerName?: string; password?: string; private?: boolean }) => {
        const dnRaw = data?.displayName ?? data?.roomName;
        const dn = typeof dnRaw === 'string' ? cleanText(dnRaw, 48) : '';
        const pn = this.nameFor(socket.id, data?.playerName);
        if (!dn || !pn) {
          socket.emit('room_error', { code: 'INVALID', message: 'Nome da sala e do jogador são obrigatórios.' });
          return;
        }
        this.leaveCurrentRoom(socket);
        const roomId = this.newRoomId();
        const engine = new CoupEngine(roomId);
        const pw = typeof data.password === 'string' ? data.password.trim() : '';
        const entry = this.newEntry(engine, dn, socket.id);
        entry.isPrivate = data.private === true || !!pw;
        if (pw) entry.passwordPlain = pw.slice(0, 64);
        this.rooms.set(roomId, entry);
        this.addHuman(entry, roomId, socket, pn);
        socket.emit('room_created', { roomId, private: entry.isPrivate });
        this.broadcast(roomId);
        this.presence(entry);
      },
    );

    socket.on('join_room', (data: { roomId?: string; playerName?: string; password?: string }) => {
      const rid = normRoomId(data?.roomId);
      const pn = this.nameFor(socket.id, data?.playerName);
      if (!rid || !pn) {
        socket.emit('room_error', { code: 'INVALID', message: 'Código da sala e nome do jogador são obrigatórios.' });
        return;
      }
      const entry = this.rooms.get(rid);
      if (!entry) {
        socket.emit('room_error', { code: 'NOT_FOUND', message: 'Sala inexistente.' });
        return;
      }
      if (this.socketToRoom.get(socket.id) === rid) {
        this.broadcast(rid);
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
      const acc = this.hooks.accountOf(socket.id);
      const invited = !!acc && (entry.invites.get(acc.userId) ?? 0) > Date.now();
      const pw = typeof data.password === 'string' ? data.password.trim() : '';
      if (entry.passwordPlain && !invited && entry.passwordPlain !== pw) {
        socket.emit('room_error', { code: 'BAD_PASSWORD', message: 'Senha incorreta.' });
        return;
      }
      this.leaveCurrentRoom(socket);
      const taken = new Set(entry.engine.getState().players.map((p) => p.name));
      let name = pn;
      for (let i = 2; taken.has(name); i++) name = `${pn} ${i}`;
      this.addHuman(entry, rid, socket, name);
      this.broadcast(rid);
      this.broadcastVoice(rid);
      this.presence(entry);
    });

    socket.on('add_bot', (data: unknown) => {
      const rid = roomIdOf(data);
      const entry = this.rooms.get(rid);
      if (!entry || entry.hostId !== socket.id || entry.engine.isGameStarted()) return;
      if (entry.engine.getState().players.length >= MAX_PLAYERS) return;
      this.addBotTo(entry);
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
      this.mutate(socket.id, data, (e) => {
        if (!data?.action || typeof data.action !== 'object') return;
        e.handleAction(socket.id, { ...data.action, source: socket.id });
      });
    });

    socket.on('game_response', (data: { roomId: string; response: unknown; role?: Role }) => {
      this.mutate(socket.id, data, (e) => {
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
      this.mutate(socket.id, data, (e) => e.handleFlip(socket.id, data.role));
    });

    socket.on('confirm_exchange', (data: { roomId: string; keptRoles: Role[] }) => {
      this.mutate(socket.id, data, (e) => {
        if (Array.isArray(data?.keptRoles)) e.handleExchangeChoice(socket.id, data.keptRoles);
      });
    });

    socket.on('leave_room', () => this.leaveCurrentRoom(socket));

    // Reenvia o estado da sala atual só para este socket (cliente que
    // passou a escutar depois de a fila já o ter colocado numa partida).
    socket.on('room_sync', () => {
      const roomId = this.socketToRoom.get(socket.id);
      const entry = roomId ? this.rooms.get(roomId) : undefined;
      if (entry) socket.emit('room_update', this.viewFor(entry, socket.id));
    });

    // Chat de voz: o servidor só repassa a sinalização WebRTC entre membros
    // da mesma sala; o áudio vai direto entre os navegadores/aparelhos.
    socket.on('voice_join', () => {
      const roomId = this.socketToRoom.get(socket.id);
      const entry = roomId ? this.rooms.get(roomId) : undefined;
      if (!roomId || !entry) return;
      const peers = [...entry.voice.keys()].filter((id) => id !== socket.id);
      entry.voice.set(socket.id, false);
      // Quem entra por último inicia as conexões com quem já está.
      socket.emit('voice_peers', { peers });
      this.broadcastVoice(roomId);
    });

    socket.on('voice_leave', () => this.leaveVoice(socket.id));

    socket.on('voice_mute', (data: { muted?: unknown }) => {
      const roomId = this.socketToRoom.get(socket.id);
      const entry = roomId ? this.rooms.get(roomId) : undefined;
      if (!roomId || !entry?.voice.has(socket.id)) return;
      entry.voice.set(socket.id, data?.muted === true);
      this.broadcastVoice(roomId);
    });

    socket.on('voice_signal', (data: { to?: unknown; data?: unknown }) => {
      const roomId = this.socketToRoom.get(socket.id);
      const entry = roomId ? this.rooms.get(roomId) : undefined;
      const to = typeof data?.to === 'string' ? data.to : '';
      if (!entry || !entry.voice.has(socket.id) || !entry.voice.has(to)) return;
      if (this.socketToRoom.get(to) !== roomId) return;
      const payload = JSON.stringify(data.data ?? null);
      if (payload.length > 20_000) return;
      this.io.to(to).emit('voice_signal', { from: socket.id, data: data.data });
    });
  }

  private leaveVoice(socketId: string) {
    const roomId = this.socketToRoom.get(socketId);
    const entry = roomId ? this.rooms.get(roomId) : undefined;
    if (!roomId || !entry || !entry.voice.delete(socketId)) return;
    this.broadcastVoice(roomId);
  }

  private broadcastVoice(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    const members = [...entry.voice.entries()].map(([id, muted]) => ({ id, muted }));
    this.io.to(roomId).emit('voice_state', { members });
  }

  public handleDisconnect(socket: Socket) {
    this.leaveCurrentRoom(socket);
    this.recent.delete(socket.id);
  }

  /** Sai da sala atual (ex.: ao entrar na fila de partida). */
  public leave(socket: Pick<Socket, 'id' | 'leave'>) {
    this.leaveCurrentRoom(socket);
  }

  /** Esquece a conta do socket nas salas (logout no meio do lobby). */
  public forgetAccount(socketId: string) {
    const roomId = this.socketToRoom.get(socketId);
    const entry = roomId ? this.rooms.get(roomId) : undefined;
    entry?.accounts.delete(socketId);
  }

  private leaveCurrentRoom(socket: Pick<Socket, 'id' | 'leave'>) {
    const roomId = this.socketToRoom.get(socket.id);
    if (!roomId) return;
    this.leaveVoice(socket.id);
    this.socketToRoom.delete(socket.id);
    socket.leave(roomId);
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    // No lobby sai da lista; na partida, abandona (perde as influências).
    entry.engine.forfeitPlayer(socket.id);
    if (!entry.engine.isGameStarted()) entry.accounts.delete(socket.id);
    this.hooks.onPresence([socket.id]);
    const humans = entry.engine
      .getState()
      .players.filter((p) => !p.isBot && p.isConnected);
    if (humans.length === 0) {
      this.clearTimer(entry);
      this.rooms.delete(roomId);
      this.hooks.onRoomsChanged();
      return;
    }
    if (entry.hostId === socket.id) entry.hostId = humans[0]!.id;
    this.afterMutation(roomId);
  }

  private mutate(socketId: string, data: unknown, fn: (engine: CoupEngine) => void) {
    const rid = roomIdOf(data);
    // Só joga quem está de fato na sala.
    if (this.socketToRoom.get(socketId) !== rid) return;
    const entry = this.rooms.get(rid);
    if (!entry || !entry.engine.isGameStarted()) return;
    fn(entry.engine);
    this.afterMutation(rid);
  }

  private clearTimer(entry: RoomEntry) {
    if (entry.timer) clearTimeout(entry.timer);
    delete entry.timer;
  }

  /** Avisa os amigos dos humanos da sala quando a partida começa ou acaba. */
  private presence(entry: RoomEntry, force = true) {
    const active = isActive(entry);
    if (!force && active === entry.wasActive) return;
    entry.wasActive = active;
    const ids = entry.engine
      .getState()
      .players.filter((p) => !p.isBot && p.isConnected)
      .map((p) => p.id);
    this.hooks.onPresence(ids);
  }

  /** Transmite o estado e agenda a próxima jogada de bot (ou o relógio do humano). */
  private afterMutation(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    this.broadcast(roomId);
    this.presence(entry, false);
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
      actor.isBot ? this.botDelayMs : HUMAN_TIMEOUT_MS,
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
        ...(entry.accounts.has(p.id) ? { userId: entry.accounts.get(p.id) } : {}),
        cards: p.cards.map((c) =>
          reveal || c.isFlipped || p.id === viewerId ? c : { role: null, isFlipped: false },
        ),
      })),
      roomMeta: {
        displayName: entry.displayName,
        hasPassword: !!entry.passwordPlain,
        hostId: entry.hostId,
        started: entry.engine.isGameStarted(),
        isPrivate: entry.isPrivate,
        matchmade: entry.matchmade,
      },
    };
  }

  /** Lembra, para cada humano da sala, quem estava na mesa com ele. */
  private remember(roomId: string, entry: RoomEntry) {
    const players = entry.engine.getState().players.filter((p) => !p.isBot);
    const now = Date.now();
    for (const viewer of players) {
      if (!viewer.isConnected) continue;
      let map = this.recent.get(viewer.id);
      if (!map) this.recent.set(viewer.id, (map = new Map()));
      for (const p of players) {
        if (p.id === viewer.id) continue;
        const userId = entry.accounts.get(p.id);
        map.delete(p.id);
        map.set(p.id, { playerId: p.id, name: p.name, roomId, at: now, ...(userId ? { userId } : {}) });
      }
      while (map.size > RECENT_LIMIT) map.delete(map.keys().next().value!);
    }
  }

  private broadcast(roomId: string) {
    const entry = this.rooms.get(roomId);
    if (!entry) return;
    this.remember(roomId, entry);
    for (const p of entry.engine.getState().players) {
      if (p.isBot || !p.isConnected) continue;
      this.io.to(p.id).emit('room_update', this.viewFor(entry, p.id));
    }
    if (!entry.engine.isGameStarted() || entry.engine.getState().players.length === 0) {
      this.hooks.onRoomsChanged();
    } else if (!entry.wasActive) {
      // Acabou de começar: sai da lista.
      this.hooks.onRoomsChanged();
    }
  }
}
