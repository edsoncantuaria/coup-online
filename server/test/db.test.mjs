// Banco SQLite: dados sobrevivem a reiniciar o servidor e os JSON antigos
// (accounts.json e reports.json) são importados na primeira subida.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../dist/server.js';
import { MemoryMailer } from '../dist/mail/Mailer.js';

const PW = randomBytes(6).toString('hex');

const running = new Set();

afterEach(async () => {
  for (const s of running) await s.close();
  running.clear();
});

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'intriga-db-test-'));
}

async function boot(dataDir) {
  const server = await startServer({ port: 0, dataDir, mailer: new MemoryMailer(), registerPerHour: 100 });
  running.add(server);
  const close = server.close.bind(server);
  server.close = async () => {
    running.delete(server);
    await close();
  };
  const base = `http://localhost:${server.port}`;
  const post = async (url, body, token) => {
    const res = await fetch(`${base}${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const me = async (token) =>
    (await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })).status;
  return { server, post, me };
}

/** Hash no mesmo formato do servidor, para montar um accounts.json antigo. */
function scryptHash(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:8:1:${salt.toString('hex')}:${hash.toString('hex')}`;
}

test('contas, sessões e amizades sobrevivem a reiniciar o servidor', async () => {
  const dataDir = tempDir();
  try {
    let { server, post, me } = await boot(dataDir);
    const a = await post('/api/auth/register', { username: 'Ana', email: 'ana@exemplo.com', password: PW });
    const b = await post('/api/auth/register', { username: 'Beto', email: 'beto@exemplo.com', password: PW });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const ana = server.accounts.get(a.body.user.id);
    const beto = server.accounts.get(b.body.user.id);
    ana.friends.push(beto.id);
    beto.friends.push(ana.id);
    server.accounts.saveFriends(ana, beto);
    await server.close();

    ({ server, post, me } = await boot(dataDir));
    // A sessão aberta antes continua valendo e a senha ainda confere.
    assert.equal(await me(a.body.token), 200);
    assert.equal((await post('/api/auth/login', { login: 'beto', password: PW })).status, 200);
    assert.deepEqual(server.accounts.get(a.body.user.id).friends, [b.body.user.id]);
    // Nome e email continuam únicos depois de recarregar.
    const dup = await post('/api/auth/register', { username: 'ANA', email: 'outra@exemplo.com', password: PW });
    assert.equal(dup.status, 409);
    await server.close();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('importa accounts.json e reports.json antigos uma vez só', async () => {
  const dataDir = tempDir();
  try {
    const now = Date.now();
    const user = (id, username) => ({
      id,
      username,
      usernameKey: username.toLowerCase(),
      passwordHash: scryptHash(PW),
      email: `${username.toLowerCase()}@exemplo.com`,
      emailKey: `${username.toLowerCase()}@exemplo.com`,
      emailVerified: true,
      createdAt: now,
      friends: [],
      incoming: [],
      outgoing: [],
    });
    const velho = user('u_velho', 'Velho');
    const amigo = user('u_amigo', 'Amigo');
    velho.friends = ['u_amigo', 'u_sumiu'];
    amigo.friends = ['u_velho'];
    fs.writeFileSync(
      path.join(dataDir, 'accounts.json'),
      JSON.stringify({ version: 1, users: [velho, amigo], sessions: [] }),
    );
    fs.writeFileSync(
      path.join(dataDir, 'reports.json'),
      JSON.stringify({
        version: 1,
        reports: [
          {
            id: 'r_1',
            at: now,
            reason: 'anti_game',
            roomId: 'SALA1',
            reporter: { userId: 'u_amigo', name: 'Amigo', key: 'u_amigo' },
            target: { name: 'Chato', key: 'guest:chato' },
          },
        ],
        counts: {},
      }),
    );

    let { server, post } = await boot(dataDir);
    assert.equal((await post('/api/auth/login', { login: 'velho', password: PW })).status, 200);
    // Amigo que não existe mais é descartado na importação.
    assert.deepEqual(server.accounts.get('u_velho').friends, ['u_amigo']);
    assert.equal(server.reports.countFor('guest:chato').total, 1);
    assert.ok(fs.existsSync(path.join(dataDir, 'accounts.json.imported')));
    assert.ok(fs.existsSync(path.join(dataDir, 'reports.json.imported')));
    assert.ok(!fs.existsSync(path.join(dataDir, 'accounts.json')));
    await server.close();

    // Na subida seguinte nada é importado de novo.
    ({ server, post } = await boot(dataDir));
    assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
    assert.equal(server.reports.countFor('guest:chato').total, 1);
    await server.close();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
