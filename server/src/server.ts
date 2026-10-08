import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { AccountService, IdentityRegistry, publicUser, type UserRecord } from './accounts/AccountService.js';
import { AppError, cleanText, errorPayload, str } from './errors.js';
import { Matchmaker, type MatchmakerOptions } from './lobby/Matchmaker.js';
import { RoomManager, MAX_PLAYERS } from './socket/RoomManager.js';
import { FriendService } from './social/FriendService.js';
import { ReportService, type ReportLimits } from './social/ReportService.js';
import { RateLimiter } from './store/RateLimiter.js';

export type ServerOptions = {
  port?: number;
  /** Onde ficam `accounts.json` e `reports.json`. */
  dataDir?: string;
  botDelayMs?: number;
  queue?: Partial<MatchmakerOptions>;
  reports?: Partial<ReportLimits>;
  /** Contas novas por IP por hora. */
  registerPerHour?: number;
};

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

export const DEFAULT_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const HTTP_STATUS: Record<string, number> = {
  INVALID: 400,
  INVALID_USERNAME: 400,
  INVALID_PASSWORD: 400,
  BAD_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  USERNAME_TAKEN: 409,
  RATE_LIMITED: 429,
};

/** Monta express + socket.io com contas, fila, amigos e denúncias. */
export async function startServer(opts: ServerOptions = {}) {
  const env = process.env;
  const dataDir = path.resolve(opts.dataDir ?? env.DATA_DIR ?? DEFAULT_DATA_DIR);
  const queueOpts: MatchmakerOptions = {
    maxPlayers: MAX_PLAYERS,
    minPlayers: num(env.QUEUE_MIN_PLAYERS, 4),
    gatherMs: num(env.QUEUE_GATHER_MS, 8_000),
    botFillMs: num(env.QUEUE_BOT_FILL_MS, 20_000),
    botFillTarget: num(env.QUEUE_BOT_FILL_TARGET, 4),
    tickMs: num(env.QUEUE_TICK_MS, 1_000),
    ...opts.queue,
  };
  const reportLimits: ReportLimits = {
    limit: num(env.REPORT_LIMIT, 5),
    windowMs: num(env.REPORT_WINDOW_MS, 10 * 60 * 1000),
    ...opts.reports,
  };
  const trustProxy = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true';

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '4kb' }));
  if (trustProxy) app.set('trust proxy', true);

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 100_000,
  });

  const accounts = new AccountService(dataDir);
  const identities = new IdentityRegistry();
  const reports = new ReportService(dataDir, reportLimits);
  const registerLimiter = new RateLimiter(opts.registerPerHour ?? num(env.REGISTER_LIMIT, 20), 60 * 60 * 1000);
  const loginFailLimiter = new RateLimiter(10, 10 * 60 * 1000);
  const loginIpLimiter = new RateLimiter(60, 10 * 60 * 1000);
  const friendLimiter = new RateLimiter(30, 10 * 60 * 1000);
  const inviteLimiter = new RateLimiter(30, 10 * 60 * 1000);
  const authLimiter = new RateLimiter(30, 60 * 1000);
  /** Token com que cada socket entrou (para o logout revogar). */
  const socketTokens = new Map<string, string>();

  // Referências cruzadas: a sala avisa a fila e os amigos, a fila cria salas.
  let matchmaker: Matchmaker;
  let friends: FriendService;
  let roomsDirty: ReturnType<typeof setTimeout> | undefined;

  const presence = (socketIds: string[]) => {
    const users = new Set(socketIds.map((s) => identities.userOf(s)).filter((u): u is string => !!u));
    for (const u of users) friends?.presenceChanged(u);
  };

  const rooms = new RoomManager(
    io,
    {
      accountOf: (sid) => {
        const uid = identities.userOf(sid);
        const u = uid ? accounts.get(uid) : undefined;
        return u ? { userId: u.id, username: u.username } : undefined;
      },
      onJoined: (sid) => matchmaker?.leave(sid),
      onPresence: presence,
      onRoomsChanged: () => {
        if (roomsDirty) return;
        roomsDirty = setTimeout(() => {
          roomsDirty = undefined;
          if (!io.sockets.adapter.rooms.get('rooms_watchers')?.size) return;
          io.to('rooms_watchers').emit('rooms_update', { rooms: rooms.getLobbySummaries() });
        }, 150);
        roomsDirty.unref?.();
      },
    },
    opts.botDelayMs ?? num(env.BOT_DELAY_MS, 1400),
  );
  matchmaker = new Matchmaker(io, queueOpts, (members, bots) => rooms.createMatch(members, bots), presence);
  friends = new FriendService(io, accounts, identities, (sid) =>
    rooms.statusOf(sid) ?? (matchmaker.isQueued(sid) ? 'searching' : undefined),
  );

  // ---------- REST ----------
  const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? '?';
  const bearer = (req: Request) => {
    const h = req.headers.authorization ?? '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  };
  const send = (res: Response, err: unknown) => {
    const p = errorPayload(err);
    res.status(HTTP_STATUS[p.code] ?? (p.code === 'INTERNAL' ? 500 : 400)).json(p);
  };

  const doRegister = async (ip: string, data: unknown) => {
    if (!registerLimiter.hit(ip)) throw new AppError('RATE_LIMITED', 'Muitas contas criadas daqui. Tente mais tarde.');
    return accounts.register(str(data, 'username'), str(data, 'password'));
  };
  const doLogin = async (ip: string, data: unknown) => {
    const username = str(data, 'username');
    const key = `${ip}|${username.trim().toLowerCase()}`;
    if (!loginIpLimiter.hit(ip)) throw new AppError('RATE_LIMITED', 'Muitas tentativas. Tente mais tarde.');
    try {
      const r = await accounts.login(username, str(data, 'password'));
      loginFailLimiter.reset(key);
      return r;
    } catch (err) {
      if (err instanceof AppError && err.code === 'BAD_CREDENTIALS' && !loginFailLimiter.hit(key)) {
        throw new AppError('RATE_LIMITED', 'Muitas tentativas erradas. Tente em alguns minutos.');
      }
      throw err;
    }
  };

  app.get('/api/ping', (_req, res) => {
    res.json({ ok: true, name: 'coup-online' });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: rooms.getLobbySummaries() });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { user, token } = await doRegister(clientIp(req), req.body);
      res.status(201).json({ ok: true, token, user: publicUser(user) });
    } catch (err) {
      send(res, err);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { user, token } = await doLogin(clientIp(req), req.body);
      res.json({ ok: true, token, user: publicUser(user) });
    } catch (err) {
      send(res, err);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    accounts.logout(bearer(req));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = accounts.authenticate(bearer(req));
    if (!user) return send(res, new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada.'));
    res.json({ ok: true, user: publicUser(user) });
  });

  // JSON malformado vira erro JSON, não página HTML.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void err;
    send(res, new AppError('INVALID', 'Requisição inválida.'));
  });

  // ---------- socket.io ----------
  const socketIp = (socket: Socket) => {
    if (trustProxy) {
      const fwd = socket.handshake.headers['x-forwarded-for'];
      const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return socket.handshake.address;
  };

  const bind = (socket: Socket, user: UserRecord, token: string) => {
    const prev = identities.userOf(socket.id);
    if (prev && prev !== user.id) {
      identities.unbind(socket.id);
      rooms.forgetAccount(socket.id);
      friends.presenceChanged(prev);
    }
    identities.bind(socket.id, user.id);
    socketTokens.set(socket.id, token);
    socket.emit('account_state', { user: publicUser(user) });
    friends.push(user.id);
    friends.presenceChanged(user.id);
  };

  const unbind = (socket: Socket) => {
    const uid = identities.unbind(socket.id);
    socketTokens.delete(socket.id);
    rooms.forgetAccount(socket.id);
    if (uid) friends.presenceChanged(uid);
    return uid;
  };

  const me = (socket: Socket): UserRecord => {
    const uid = identities.userOf(socket.id);
    const u = uid ? accounts.get(uid) : undefined;
    if (!u) throw new AppError('UNAUTHORIZED', 'Entre com sua conta para usar amigos.');
    return u;
  };

  io.on('connection', (socket) => {
    rooms.handleConnection(socket);

    /** Evento com resposta por ack: `{ ok: true, ... }` ou `{ ok: false, code, message }`. */
    const handle = (event: string, fn: (data: unknown) => unknown) => {
      socket.on(event, async (data: unknown, ack?: unknown) => {
        let reply = typeof ack === 'function' ? (ack as (p: unknown) => void) : undefined;
        if (typeof data === 'function') {
          reply = data as (p: unknown) => void;
          data = undefined;
        }
        try {
          const res = await fn(data);
          reply?.({ ok: true, ...(res && typeof res === 'object' ? res : {}) });
        } catch (err) {
          reply?.(errorPayload(err));
        }
      });
    };

    // Sessão no handshake: io(url, { auth: { token } }).
    const hsToken = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof hsToken === 'string') {
      const u = accounts.authenticate(hsToken);
      if (u) bind(socket, u, hsToken);
      else socket.emit('account_state', { user: null, expired: true });
    }

    // ----- contas -----
    handle('account_register', async (data) => {
      const { user, token } = await doRegister(socketIp(socket), data);
      bind(socket, user, token);
      return { token, user: publicUser(user) };
    });

    handle('account_login', async (data) => {
      const { user, token } = await doLogin(socketIp(socket), data);
      bind(socket, user, token);
      return { token, user: publicUser(user) };
    });

    handle('account_auth', (data) => {
      if (!authLimiter.hit(socket.id)) throw new AppError('RATE_LIMITED', 'Muitas tentativas.');
      const token = str(data, 'token');
      const u = accounts.authenticate(token);
      if (!u) throw new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada.');
      bind(socket, u, token);
      return { user: publicUser(u) };
    });

    handle('account_logout', () => {
      const token = socketTokens.get(socket.id);
      if (token) accounts.logout(token);
      unbind(socket);
      socket.emit('account_state', { user: null });
    });

    handle('account_me', () => {
      const uid = identities.userOf(socket.id);
      const u = uid ? accounts.get(uid) : undefined;
      return { user: u ? publicUser(u) : null };
    });

    // ----- salas abertas e fila -----
    handle('rooms_list', () => ({ rooms: rooms.getLobbySummaries() }));

    handle('rooms_watch', () => {
      socket.join('rooms_watchers');
      return { rooms: rooms.getLobbySummaries() };
    });

    handle('rooms_unwatch', () => {
      socket.leave('rooms_watchers');
    });

    handle('queue_join', (data) => {
      const uid = identities.userOf(socket.id);
      const user = uid ? accounts.get(uid) : undefined;
      const name = user?.username ?? cleanText(str(data, 'playerName'), 24);
      if (!name) throw new AppError('INVALID', 'Informe seu nome para buscar partida.');
      rooms.leave(socket);
      const status = matchmaker.join(socket.id, name, user?.id);
      const roomId = rooms.roomOf(socket.id);
      return { status: status.state === 'idle' && roomId ? { state: 'matched', roomId } : status };
    });

    handle('queue_leave', () => {
      matchmaker.leave(socket.id);
    });

    handle('queue_status', () => ({ status: matchmaker.statusOf(socket.id) }));

    // ----- amigos -----
    handle('friends_list', () => friends.listFor(me(socket).id));

    handle('friend_request', (data) => {
      const u = me(socket);
      if (!friendLimiter.hit(u.id)) throw new AppError('RATE_LIMITED', 'Muitos pedidos de amizade. Tente mais tarde.');
      const userId = str(data, 'userId');
      const username = str(data, 'username');
      const target = userId ? accounts.get(userId) : username ? accounts.findByUsername(username) : undefined;
      return { result: friends.request(u.id, target) };
    });

    handle('friend_respond', (data) => {
      const u = me(socket);
      const accept = data && typeof data === 'object' ? (data as { accept?: unknown }).accept === true : false;
      friends.respond(u.id, str(data, 'userId'), accept);
    });

    handle('friend_remove', (data) => {
      friends.remove(me(socket).id, str(data, 'userId'));
    });

    handle('room_invite', (data) => {
      const u = me(socket);
      const targetId = str(data, 'userId');
      if (!friends.areFriends(u.id, targetId)) throw new AppError('NOT_FRIENDS', 'Só dá para convidar amigos.');
      const targets = identities.socketsOf(targetId);
      if (targets.length === 0) throw new AppError('OFFLINE', 'Seu amigo está offline.');
      if (!inviteLimiter.hit(u.id)) throw new AppError('RATE_LIMITED', 'Muitos convites. Tente mais tarde.');
      const inv = rooms.invite(socket.id, targetId);
      for (const sid of targets) {
        io.to(sid).emit('room_invite', { ...inv, from: { userId: u.id, username: u.username } });
      }
      return { roomId: inv.roomId };
    });

    // ----- denúncias -----
    handle('report_player', (data) => {
      const target = rooms.recentPlayer(socket.id, str(data, 'playerId'));
      if (!target) throw new AppError('NOT_FOUND', 'Só dá para denunciar quem jogou com você.');
      const uid = identities.userOf(socket.id);
      const reporter = uid ? accounts.get(uid) : undefined;
      if (reporter && target.userId === reporter.id) throw new AppError('INVALID', 'Você não pode se denunciar.');
      const rec = reports.report({
        reporterKey: reporter?.id ?? `ip:${socketIp(socket)}`,
        reporter: reporter ? { userId: reporter.id, name: reporter.username } : { name: 'convidado' },
        target: { name: target.name, ...(target.userId ? { userId: target.userId } : {}) },
        roomId: target.roomId,
        reason: data && typeof data === 'object' ? (data as { reason?: unknown }).reason : undefined,
        note: data && typeof data === 'object' ? (data as { note?: unknown }).note : undefined,
      });
      return { reportId: rec.id };
    });

    socket.on('disconnect', () => {
      matchmaker.leave(socket.id, false);
      rooms.handleDisconnect(socket);
      unbind(socket);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(opts.port ?? num(env.PORT, 3000), resolve));
  const port = (httpServer.address() as AddressInfo).port;

  const flush = () => {
    accounts.flush();
    reports.flush();
  };

  return {
    port,
    dataDir,
    io,
    accounts,
    reports,
    flush,
    async close() {
      matchmaker.close();
      if (roomsDirty) clearTimeout(roomsDirty);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      flush();
    },
  };
}
