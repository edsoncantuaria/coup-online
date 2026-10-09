import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { AccountService, IdentityRegistry, selfUser, type UserRecord } from './accounts/AccountService.js';
import { mailerFromEnv, resetPasswordMail, verifyEmailMail, type Mailer } from './mail/Mailer.js';
import { resetPasswordPage, verifyResultPage } from './mail/pages.js';
import { AppError, cleanText, errorPayload, str } from './errors.js';
import { Matchmaker, type MatchmakerOptions } from './lobby/Matchmaker.js';
import { RoomManager, MAX_PLAYERS } from './socket/RoomManager.js';
import { FriendService } from './social/FriendService.js';
import { ReportService, type ReportLimits } from './social/ReportService.js';
import { openDatabase } from './store/Database.js';
import { importLegacyJson } from './store/legacyJson.js';
import { RateLimiter } from './store/RateLimiter.js';

export type ServerOptions = {
  port?: number;
  /** Pasta do banco `intriga.db`. */
  dataDir?: string;
  botDelayMs?: number;
  /** Tempo de decisão de cada humano (padrão 30 s). */
  turnMs?: number;
  queue?: Partial<MatchmakerOptions>;
  reports?: Partial<ReportLimits>;
  /** Contas novas por IP por hora. */
  registerPerHour?: number;
  /** Quem manda os emails; padrão: SMTP se `SMTP_HOST`, senão log. */
  mailer?: Mailer;
  /** Endereço público do servidor, usado nos links dos emails. */
  publicUrl?: string;
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
  INVALID_EMAIL: 400,
  INVALID_TOKEN: 400,
  NO_EMAIL: 400,
  ALREADY_VERIFIED: 409,
  EMAIL_TAKEN: 409,
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

  const db = openDatabase(dataDir);
  importLegacyJson(db, dataDir);
  const accounts = new AccountService(db);
  const identities = new IdentityRegistry();
  const reports = new ReportService(db, reportLimits);
  const registerLimiter = new RateLimiter(opts.registerPerHour ?? num(env.REGISTER_LIMIT, 20), 60 * 60 * 1000);
  const loginFailLimiter = new RateLimiter(10, 10 * 60 * 1000);
  const loginIpLimiter = new RateLimiter(60, 10 * 60 * 1000);
  const friendLimiter = new RateLimiter(30, 10 * 60 * 1000);
  const inviteLimiter = new RateLimiter(30, 10 * 60 * 1000);
  const authLimiter = new RateLimiter(30, 60 * 1000);
  const mailIpLimiter = new RateLimiter(10, 60 * 60 * 1000);
  const mailUserLimiter = new RateLimiter(3, 60 * 60 * 1000);
  const mailer = opts.mailer ?? mailerFromEnv(env);
  /** Base dos links nos emails; sem PUBLIC_URL, o próprio servidor local. */
  let linkBase = (opts.publicUrl ?? env.PUBLIC_URL ?? '').replace(/\/+$/, '');
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
    opts.botDelayMs ?? (env.BOT_DELAY_MS ? num(env.BOT_DELAY_MS, 0) : undefined),
    opts.turnMs,
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

  /** Manda um email sem travar a resposta; falha de SMTP só vai para o log. */
  const deliver = (mail: Parameters<Mailer['send']>[0]) => {
    mailer.send(mail).catch((err) => console.error(`[mail] falhou para ${mail.to}:`, err));
  };
  const sendVerify = (user: UserRecord, token: string) => {
    if (user.email) deliver(verifyEmailMail(user.email, user.username, `${linkBase}/verify-email?token=${token}`));
  };

  const doRegister = async (ip: string, data: unknown) => {
    if (!registerLimiter.hit(ip)) throw new AppError('RATE_LIMITED', 'Muitas contas criadas daqui. Tente mais tarde.');
    const r = await accounts.register(str(data, 'username'), str(data, 'email'), str(data, 'password'));
    sendVerify(r.user, r.verifyToken);
    return r;
  };
  const doResend = (ip: string, user: UserRecord) => {
    if (!mailIpLimiter.hit(ip) || !mailUserLimiter.hit(user.id)) {
      throw new AppError('RATE_LIMITED', 'Muitos emails pedidos. Tente mais tarde.');
    }
    sendVerify(user, accounts.newVerifyToken(user));
  };
  /** Sempre responde igual, exista ou não a conta (não revela quem tem cadastro). */
  const doForgot = (ip: string, data: unknown) => {
    const email = str(data, 'email').trim().toLowerCase();
    if (!email.includes('@') || email.length > 254) throw new AppError('INVALID_EMAIL', 'Digite um email válido.');
    if (!mailIpLimiter.hit(ip) || !mailUserLimiter.hit(`forgot:${email}`)) {
      throw new AppError('RATE_LIMITED', 'Muitos emails pedidos. Tente mais tarde.');
    }
    const r = accounts.requestPasswordReset(email);
    if (r?.user.email) {
      deliver(resetPasswordMail(r.user.email, r.user.username, `${linkBase}/reset-password?token=${r.token}`));
    }
  };
  const doLogin = async (ip: string, data: unknown) => {
    // `login` aceita usuário ou email; `username` fica por compatibilidade.
    const username = str(data, 'login') || str(data, 'username') || str(data, 'email');
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
      res.status(201).json({ ok: true, token, user: selfUser(user) });
    } catch (err) {
      send(res, err);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { user, token } = await doLogin(clientIp(req), req.body);
      res.json({ ok: true, token, user: selfUser(user) });
    } catch (err) {
      send(res, err);
    }
  });

  app.post('/api/auth/verify-email', (req, res) => {
    try {
      const user = accounts.verifyEmail(str(req.body, 'token'));
      res.json({ ok: true, user: selfUser(user) });
    } catch (err) {
      send(res, err);
    }
  });

  app.post('/api/auth/resend-verification', (req, res) => {
    try {
      const user = accounts.authenticate(bearer(req));
      if (!user) throw new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada.');
      doResend(clientIp(req), user);
      res.json({ ok: true });
    } catch (err) {
      send(res, err);
    }
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    try {
      doForgot(clientIp(req), req.body);
      res.json({ ok: true });
    } catch (err) {
      send(res, err);
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      await accounts.resetPassword(str(req.body, 'token'), str(req.body, 'password'));
      res.json({ ok: true });
    } catch (err) {
      send(res, err);
    }
  });

  // Páginas que os links dos emails abrem.
  app.get('/verify-email', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    let ok = false;
    try {
      accounts.verifyEmail(token);
      ok = true;
    } catch {
      ok = false;
    }
    res.status(ok ? 200 : 400).type('html').send(verifyResultPage(ok));
  });

  app.get('/reset-password', (_req, res) => {
    res.type('html').send(resetPasswordPage());
  });

  app.post('/api/auth/logout', (req, res) => {
    accounts.logout(bearer(req));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = accounts.authenticate(bearer(req));
    if (!user) return send(res, new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada.'));
    res.json({ ok: true, user: selfUser(user) });
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
    socket.emit('account_state', { user: selfUser(user) });
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
      return { token, user: selfUser(user) };
    });

    handle('account_login', async (data) => {
      const { user, token } = await doLogin(socketIp(socket), data);
      bind(socket, user, token);
      return { token, user: selfUser(user) };
    });

    handle('account_auth', (data) => {
      if (!authLimiter.hit(socket.id)) throw new AppError('RATE_LIMITED', 'Muitas tentativas.');
      const token = str(data, 'token');
      const u = accounts.authenticate(token);
      if (!u) throw new AppError('UNAUTHORIZED', 'Sessão inválida ou expirada.');
      bind(socket, u, token);
      return { user: selfUser(u) };
    });

    handle('account_logout', () => {
      const token = socketTokens.get(socket.id);
      if (token) accounts.logout(token);
      unbind(socket);
      socket.emit('account_state', { user: null });
    });

    handle('account_resend_verification', () => {
      doResend(socketIp(socket), me(socket));
    });

    handle('account_forgot_password', (data) => {
      doForgot(socketIp(socket), data);
    });

    handle('account_me', () => {
      const uid = identities.userOf(socket.id);
      const u = uid ? accounts.get(uid) : undefined;
      return { user: u ? selfUser(u) : null };
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
  if (!linkBase) linkBase = `http://localhost:${port}`;
  if (mailer.kind === 'log') console.log('[mail] sem SMTP_HOST: os emails da conta vão só para este log.');

  return {
    port,
    dataDir,
    io,
    db,
    accounts,
    reports,
    async close() {
      matchmaker.close();
      if (roomsDirty) clearTimeout(roomsDirty);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (db.isOpen) db.close();
    },
  };
}
