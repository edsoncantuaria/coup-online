import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { AppError } from '../errors.js';
import { JsonFile } from '../store/JsonFile.js';

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

/** Parâmetros do scrypt gravados junto do hash, para poder subir no futuro. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 10;
const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;

export type UserRecord = {
  id: string;
  username: string;
  /** Nome normalizado (minúsculas) para unicidade. */
  usernameKey: string;
  /** `scrypt:N:r:p:saltHex:hashHex` — nunca sai do servidor. */
  passwordHash: string;
  createdAt: number;
  friends: string[];
  /** Pedidos de amizade recebidos (ids de quem pediu). */
  incoming: string[];
  /** Pedidos de amizade enviados (ids de quem recebeu). */
  outgoing: string[];
};

type SessionRecord = {
  /** sha256 do token; o token em si não é guardado. */
  tokenHash: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
};

type AccountsDoc = { version: 1; users: UserRecord[]; sessions: SessionRecord[] };

/** O que pode ir para qualquer cliente sobre um usuário. */
export type PublicUser = { id: string; username: string };

export function publicUser(u: UserRecord): PublicUser {
  return { id: u.id, username: u.username };
}

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function normalizeUsername(raw: string): { username: string; key: string } {
  const username = raw.normalize('NFKC').trim();
  if (!USERNAME_RE.test(username)) {
    throw new AppError(
      'INVALID_USERNAME',
      'O nome de usuário deve ter de 3 a 20 letras, números, ponto, hífen ou sublinhado.',
    );
  }
  return { username, key: username.toLowerCase() };
}

function checkPassword(pw: string) {
  if (pw.length < 6 || pw.length > 128) {
    throw new AppError('INVALID_PASSWORD', 'A senha deve ter de 6 a 128 caracteres.');
  }
}

async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const hash = await scrypt(pw.normalize('NFKC'), salt, keylen, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltHex, hashHex] = stored.split(':');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const got = await scrypt(pw.normalize('NFKC'), Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

/** Hash de mentira para o login de usuário inexistente gastar o mesmo tempo. */
let dummyHash: Promise<string> | undefined;

/**
 * Contas (usuário + senha) e sessões. Persistido em `<dataDir>/accounts.json`.
 * Os pedidos e a lista de amigos moram no registro do usuário.
 */
export class AccountService {
  private store: JsonFile<AccountsDoc>;
  private byId = new Map<string, UserRecord>();
  private byKey = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();

  constructor(dataDir: string) {
    this.store = new JsonFile<AccountsDoc>(path.join(dataDir, 'accounts.json'), () => ({
      version: 1,
      users: [],
      sessions: [],
    }));
    const now = Date.now();
    for (const u of this.store.data.users ?? []) {
      u.friends ??= [];
      u.incoming ??= [];
      u.outgoing ??= [];
      this.byId.set(u.id, u);
      this.byKey.set(u.usernameKey, u);
    }
    for (const s of this.store.data.sessions ?? []) {
      if (now - s.lastSeenAt < SESSION_TTL_MS && this.byId.has(s.userId)) {
        this.sessions.set(s.tokenHash, s);
      }
    }
  }

  get(userId: string): UserRecord | undefined {
    return this.byId.get(userId);
  }

  findByUsername(raw: string): UserRecord | undefined {
    return this.byKey.get(raw.normalize('NFKC').trim().toLowerCase());
  }

  async register(rawUsername: string, password: string) {
    const { username, key } = normalizeUsername(rawUsername);
    checkPassword(password);
    if (this.byKey.has(key)) throw new AppError('USERNAME_TAKEN', 'Esse nome de usuário já existe.');
    const passwordHash = await hashPassword(password);
    // Outro cadastro pode ter terminado enquanto o hash era calculado.
    if (this.byKey.has(key)) throw new AppError('USERNAME_TAKEN', 'Esse nome de usuário já existe.');
    const user: UserRecord = {
      id: `u_${crypto.randomBytes(9).toString('base64url')}`,
      username,
      usernameKey: key,
      passwordHash,
      createdAt: Date.now(),
      friends: [],
      incoming: [],
      outgoing: [],
    };
    this.byId.set(user.id, user);
    this.byKey.set(key, user);
    this.save();
    return { user, token: this.issueToken(user.id) };
  }

  async login(rawUsername: string, password: string) {
    const user = this.findByUsername(rawUsername);
    if (!user || typeof password !== 'string' || password.length > 128) {
      dummyHash ??= hashPassword('senha-que-nao-existe');
      await verifyPassword(String(password).slice(0, 128), await dummyHash);
      throw new AppError('BAD_CREDENTIALS', 'Usuário ou senha incorretos.');
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AppError('BAD_CREDENTIALS', 'Usuário ou senha incorretos.');
    }
    return { user, token: this.issueToken(user.id) };
  }

  /** Usuário dono do token, ou `undefined` se inválido/expirado. */
  authenticate(token: unknown): UserRecord | undefined {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return undefined;
    const s = this.sessions.get(sha256(token));
    if (!s) return undefined;
    const now = Date.now();
    if (now - s.lastSeenAt > SESSION_TTL_MS) {
      this.sessions.delete(s.tokenHash);
      this.save();
      return undefined;
    }
    if (now - s.lastSeenAt > 60 * 60 * 1000) {
      s.lastSeenAt = now;
      this.save();
    }
    return this.byId.get(s.userId);
  }

  logout(token: unknown) {
    if (typeof token !== 'string') return;
    if (this.sessions.delete(sha256(token))) this.save();
  }

  /** Grava depois de mudanças feitas direto nos registros (amizades). */
  save() {
    this.store.data.users = [...this.byId.values()];
    this.store.data.sessions = [...this.sessions.values()];
    this.store.save();
  }

  flush() {
    this.store.flush();
  }

  private issueToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.sessions.set(sha256(token), { tokenHash: sha256(token), userId, createdAt: now, lastSeenAt: now });
    const mine = [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    for (const old of mine.slice(MAX_SESSIONS_PER_USER)) this.sessions.delete(old.tokenHash);
    this.save();
    return token;
  }
}

/** Quem está logado em cada socket (a identidade nunca vem do cliente). */
export class IdentityRegistry {
  private bySocket = new Map<string, string>();
  private byUser = new Map<string, Set<string>>();

  bind(socketId: string, userId: string) {
    this.unbind(socketId);
    this.bySocket.set(socketId, userId);
    let set = this.byUser.get(userId);
    if (!set) this.byUser.set(userId, (set = new Set()));
    set.add(socketId);
  }

  unbind(socketId: string): string | undefined {
    const userId = this.bySocket.get(socketId);
    if (!userId) return undefined;
    this.bySocket.delete(socketId);
    const set = this.byUser.get(userId);
    set?.delete(socketId);
    if (set && set.size === 0) this.byUser.delete(userId);
    return userId;
  }

  userOf(socketId: string): string | undefined {
    return this.bySocket.get(socketId);
  }

  socketsOf(userId: string): string[] {
    return [...(this.byUser.get(userId) ?? [])];
  }

  isOnline(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }
}
