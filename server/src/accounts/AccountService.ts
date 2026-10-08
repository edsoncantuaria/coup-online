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
// Simples de propósito: quem confirma de verdade é o link no email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export type UserRecord = {
  id: string;
  username: string;
  /** Nome normalizado (minúsculas) para unicidade. */
  usernameKey: string;
  /** `scrypt:N:r:p:saltHex:hashHex` — nunca sai do servidor. */
  passwordHash: string;
  /** Contas antigas (antes do email) não têm. */
  email?: string;
  /** Email normalizado (minúsculas) para unicidade e login. */
  emailKey?: string;
  emailVerified?: boolean;
  /** sha256 do link de confirmação pendente e quando expira. */
  verifyTokenHash?: string;
  verifyExpiresAt?: number;
  /** sha256 do link de troca de senha pendente e quando expira. */
  resetTokenHash?: string;
  resetExpiresAt?: number;
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

/** O que só o dono da conta vê (inclui o email). */
export type SelfUser = PublicUser & { email: string | null; emailVerified: boolean };

export function selfUser(u: UserRecord): SelfUser {
  return { id: u.id, username: u.username, email: u.email ?? null, emailVerified: !!u.emailVerified };
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

export function normalizeEmail(raw: string): { email: string; key: string } {
  const email = raw.normalize('NFKC').trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new AppError('INVALID_EMAIL', 'Digite um email válido.');
  }
  return { email, key: email.toLowerCase() };
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
 * Contas (usuário, email e senha) e sessões. Persistido em `<dataDir>/accounts.json`.
 * Os pedidos e a lista de amigos moram no registro do usuário.
 */
export class AccountService {
  private store: JsonFile<AccountsDoc>;
  private byId = new Map<string, UserRecord>();
  private byKey = new Map<string, UserRecord>();
  private byEmail = new Map<string, UserRecord>();
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
      if (u.emailKey) this.byEmail.set(u.emailKey, u);
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

  findByEmail(raw: string): UserRecord | undefined {
    return this.byEmail.get(raw.normalize('NFKC').trim().toLowerCase());
  }

  /** Cria a conta e devolve também o token do link de confirmação do email. */
  async register(rawUsername: string, rawEmail: string, password: string) {
    const { username, key } = normalizeUsername(rawUsername);
    const { email, key: emailKey } = normalizeEmail(rawEmail);
    checkPassword(password);
    const taken = () => {
      if (this.byKey.has(key)) throw new AppError('USERNAME_TAKEN', 'Esse nome de usuário já existe.');
      if (this.byEmail.has(emailKey)) throw new AppError('EMAIL_TAKEN', 'Já existe uma conta com esse email.');
    };
    taken();
    const passwordHash = await hashPassword(password);
    // Outro cadastro pode ter terminado enquanto o hash era calculado.
    taken();
    const user: UserRecord = {
      id: `u_${crypto.randomBytes(9).toString('base64url')}`,
      username,
      usernameKey: key,
      passwordHash,
      email,
      emailKey,
      emailVerified: false,
      createdAt: Date.now(),
      friends: [],
      incoming: [],
      outgoing: [],
    };
    this.byId.set(user.id, user);
    this.byKey.set(key, user);
    this.byEmail.set(emailKey, user);
    const verifyToken = this.newVerifyToken(user);
    return { user, token: this.issueToken(user.id), verifyToken };
  }

  /** Entra com o nome de usuário ou com o email. */
  async login(identifier: string, password: string) {
    const user = identifier.includes('@') ? this.findByEmail(identifier) : this.findByUsername(identifier);
    if (!user || typeof password !== 'string' || password.length > 128) {
      dummyHash ??= hashPassword('senha-que-nao-existe');
      await verifyPassword(String(password).slice(0, 128), await dummyHash);
      throw new AppError('BAD_CREDENTIALS', 'Usuário, email ou senha incorretos.');
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AppError('BAD_CREDENTIALS', 'Usuário, email ou senha incorretos.');
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

  /** Novo link de confirmação (o anterior deixa de valer). */
  newVerifyToken(user: UserRecord): string {
    if (!user.email) throw new AppError('NO_EMAIL', 'Esta conta não tem email.');
    if (user.emailVerified) throw new AppError('ALREADY_VERIFIED', 'Este email já está confirmado.');
    const token = crypto.randomBytes(32).toString('base64url');
    user.verifyTokenHash = sha256(token);
    user.verifyExpiresAt = Date.now() + VERIFY_TTL_MS;
    this.save();
    return token;
  }

  verifyEmail(token: unknown): UserRecord {
    const user = this.byPendingToken(token, 'verifyTokenHash', 'verifyExpiresAt');
    if (!user) throw new AppError('INVALID_TOKEN', 'Link inválido ou expirado.');
    user.emailVerified = true;
    delete user.verifyTokenHash;
    delete user.verifyExpiresAt;
    this.save();
    return user;
  }

  /** Token de troca de senha, ou `undefined` se o email não tem conta. */
  requestPasswordReset(rawEmail: string): { user: UserRecord; token: string } | undefined {
    const user = this.findByEmail(rawEmail);
    if (!user) return undefined;
    const token = crypto.randomBytes(32).toString('base64url');
    user.resetTokenHash = sha256(token);
    user.resetExpiresAt = Date.now() + RESET_TTL_MS;
    this.save();
    return { user, token };
  }

  /** Troca a senha pelo link do email e derruba todas as sessões abertas. */
  async resetPassword(token: unknown, password: string): Promise<UserRecord> {
    checkPassword(password);
    const user = this.byPendingToken(token, 'resetTokenHash', 'resetExpiresAt');
    if (!user) throw new AppError('INVALID_TOKEN', 'Link inválido ou expirado.');
    // Gasta o link antes do hash, para não ser usado duas vezes ao mesmo tempo.
    delete user.resetTokenHash;
    delete user.resetExpiresAt;
    user.passwordHash = await hashPassword(password);
    // Quem recebeu o link no email provou que o email é seu.
    user.emailVerified = true;
    for (const s of [...this.sessions.values()]) if (s.userId === user.id) this.sessions.delete(s.tokenHash);
    this.save();
    return user;
  }

  private byPendingToken(
    token: unknown,
    hashKey: 'verifyTokenHash' | 'resetTokenHash',
    expKey: 'verifyExpiresAt' | 'resetExpiresAt',
  ): UserRecord | undefined {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return undefined;
    const h = sha256(token);
    const now = Date.now();
    for (const u of this.byId.values()) {
      if (u[hashKey] === h) return (u[expKey] ?? 0) > now ? u : undefined;
    }
    return undefined;
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
