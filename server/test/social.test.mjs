// Testes de contas, fila de partida, salas abertas, amigos e denúncias.
// Rode com `npm test` (compila e executa com node:test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connectClient } from 'socket.io-client';
import { startServer } from '../dist/server.js';
import { MemoryMailer } from '../dist/mail/Mailer.js';

// Senhas de teste geradas na hora (nada fixo no código).
const PW = randomBytes(6).toString('hex');
const PW_OTHER = randomBytes(6).toString('hex');
const PW_WRONG = `${PW}-x`;

let server;
let base;
let dataDir;
const mailer = new MemoryMailer();
const clients = [];

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intriga-test-'));
  server = await startServer({
    port: 0,
    dataDir,
    botDelayMs: 5,
    queue: { gatherMs: 300, botFillMs: 900, tickMs: 50, minPlayers: 4, botFillTarget: 4 },
    reports: { limit: 2, windowMs: 60_000 },
    registerPerHour: 100,
    mailer,
    publicUrl: 'https://intriga.test',
  });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  for (const c of clients) c.close();
  await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Cliente socket.io que guarda o último estado de sala recebido. */
async function client(auth) {
  const s = connectClient(base, { transports: ['websocket'], forceNew: true, ...(auth ? { auth } : {}) });
  clients.push(s);
  s.state = null;
  s.seen = new Set();
  s.onAny((event) => s.seen.add(event));
  s.on('room_update', (st) => (s.state = st));
  await new Promise((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}

const ack = (s, event, data) => s.timeout(3000).emitWithAck(event, data);

function waitFor(s, event, pred = () => true, ms = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off(event, h);
      reject(new Error(`timeout esperando ${event}`));
    }, ms);
    function h(data) {
      if (!pred(data)) return;
      clearTimeout(t);
      s.off(event, h);
      resolve(data);
    }
    s.on(event, h);
  });
}

async function until(cond, ms = 5000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('condição não atingida');
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function post(p, body, token) {
  const res = await fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function account(name) {
  const r = await post('/api/auth/register', { username: name, email: `${name}@exemplo.com`, password: PW });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test('cria conta, entra, sessão por token e nada sensível vaza', async () => {
  const reg = await post('/api/auth/register', { username: 'Alice', email: 'Alice@Exemplo.com', password: PW });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.username, 'Alice');
  assert.ok(reg.body.token.length >= 40);
  assert.deepEqual(Object.keys(reg.body.user).sort(), ['email', 'emailVerified', 'id', 'username']);
  assert.equal(reg.body.user.emailVerified, false);

  const reg2 = (body) => post('/api/auth/register', body);
  assert.equal((await reg2({ username: 'alice', email: 'outra@exemplo.com', password: PW_OTHER })).body.code, 'USERNAME_TAKEN');
  assert.equal((await reg2({ username: 'Alicia', email: 'alice@exemplo.com', password: PW_OTHER })).body.code, 'EMAIL_TAKEN');
  assert.equal((await reg2({ username: 'Bruno', email: 'sem-arroba', password: PW })).body.code, 'INVALID_EMAIL');
  assert.equal((await reg2({ username: 'Bruno', password: PW })).body.code, 'INVALID_EMAIL');
  assert.equal((await reg2({ username: 'x', email: 'x@exemplo.com', password: PW })).body.code, 'INVALID_USERNAME');
  assert.equal((await reg2({ username: 'Bruno', email: 'b@exemplo.com', password: '123' })).body.code, 'INVALID_PASSWORD');
  assert.equal((await reg2({ username: { $ne: 1 }, email: 'b@exemplo.com', password: PW })).status, 400);

  // Entra também pelo email, sem diferenciar maiúsculas.
  const byEmail = await post('/api/auth/login', { login: 'ALICE@exemplo.com', password: PW });
  assert.equal(byEmail.body.user.id, reg.body.user.id);

  const bad = await post('/api/auth/login', { username: 'alice', password: PW_WRONG });
  assert.equal(bad.status, 401);
  const good = await post('/api/auth/login', { username: 'ALICE', password: PW });
  assert.equal(good.status, 200);
  assert.equal(good.body.user.id, reg.body.user.id);

  const meRes = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${good.body.token}` } });
  assert.equal((await meRes.json()).user.username, 'Alice');

  // Pelo socket: login, sessão por token e logout.
  const s = await client();
  const viaSocket = await ack(s, 'account_login', { username: 'alice', password: PW });
  assert.equal(viaSocket.ok, true);
  const s2 = await client();
  const authed = await ack(s2, 'account_auth', { token: viaSocket.token });
  assert.equal(authed.user.id, reg.body.user.id);
  assert.equal((await ack(s2, 'account_auth', { token: 'x'.repeat(43) })).code, 'UNAUTHORIZED');
  const s3 = await client({ token: viaSocket.token });
  assert.equal((await ack(s3, 'account_me')).user.username, 'Alice');
  await ack(s, 'account_logout');
  assert.equal((await ack(s, 'account_me')).user, null);
  const after = await client();
  assert.equal((await ack(after, 'account_auth', { token: viaSocket.token })).code, 'UNAUTHORIZED');

  // Em disco: hash scrypt, nunca a senha nem o token em claro.
  server.flush();
  const raw = fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8');
  assert.ok(!raw.includes(PW));
  assert.ok(!raw.includes(good.body.token));
  const doc = JSON.parse(raw);
  assert.match(doc.users.find((u) => u.username === 'Alice').passwordHash, /^scrypt:16384:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/);
});

test('fila junta quatro jogadores numa partida pública', async () => {
  const players = await Promise.all([1, 2, 3, 4].map(() => client()));
  const found = players.map((p) => waitFor(p, 'match_found'));
  for (const [i, p] of players.entries()) {
    const r = await ack(p, 'queue_join', { playerName: `Fila ${i}` });
    assert.equal(r.ok, true);
    if (i === 0) assert.equal(r.status.state, 'searching');
  }
  const ids = (await Promise.all(found)).map((m) => m.roomId);
  assert.equal(new Set(ids).size, 1);
  await until(() => players.every((p) => p.state?.roomId === ids[0] && p.state.roomMeta.started));
  const st = players[0].state;
  assert.equal(st.players.length, 4);
  assert.equal(st.players.filter((p) => p.isBot).length, 0);
  assert.equal(st.roomMeta.matchmade, true);
  assert.equal((await ack(players[0], 'queue_status')).status.state, 'idle');
});

test('fila sozinha completa a mesa com bots depois da espera', async () => {
  const solo = await client();
  const statuses = [];
  solo.on('queue_status', (s) => statuses.push(s));
  const r = await ack(solo, 'queue_join', { playerName: 'Solitário' });
  assert.equal(r.status.state, 'searching');
  assert.ok(r.status.botFillInMs > 0);
  const m = await waitFor(solo, 'match_found');
  await until(() => solo.state?.roomId === m.roomId);
  assert.equal(solo.state.players.length, 4);
  assert.equal(solo.state.players.filter((p) => p.isBot).length, 3);
  assert.ok(statuses.some((s) => s.state === 'searching'));
  // Sem nome e sem conta não entra na fila; sair da fila funciona.
  const nameless = await client();
  assert.equal((await ack(nameless, 'queue_join', {})).code, 'INVALID');
  await ack(nameless, 'queue_join', { playerName: 'Desiste' });
  await ack(nameless, 'queue_leave');
  assert.equal((await ack(nameless, 'queue_status')).status.state, 'idle');
});

test('lista de salas abertas mostra criador e lugares, esconde privadas', async () => {
  const host = await client();
  const hidden = await client();
  const hidden2 = await client();
  const viewer = await client();
  const watched = await ack(viewer, 'rooms_watch');
  assert.ok(Array.isArray(watched.rooms));

  host.emit('create_room', { displayName: 'Mesa Aberta', playerName: 'Carla' });
  const { roomId } = await waitFor(host, 'room_created');
  hidden.emit('create_room', { displayName: 'Secreta', playerName: 'Davi', private: true });
  const secret = await waitFor(hidden, 'room_created');
  assert.equal(secret.private, true);
  hidden2.emit('create_room', { displayName: 'Com senha', playerName: 'Eva', password: 'abc' });
  await waitFor(hidden2, 'room_created');

  const pushed = await waitFor(viewer, 'rooms_update', (u) => u.rooms.some((r) => r.roomId === roomId));
  const listed = pushed.rooms.find((r) => r.roomId === roomId);
  assert.equal(listed.hostName, 'Carla');
  assert.equal(listed.players, 1);
  assert.equal(listed.maxPlayers, 6);

  const list = (await ack(viewer, 'rooms_list')).rooms;
  assert.ok(list.some((r) => r.roomId === roomId));
  assert.ok(!list.some((r) => r.roomId === secret.roomId));
  assert.ok(!list.some((r) => r.displayName === 'Com senha'));
  const rest = await (await fetch(`${base}/api/rooms`)).json();
  assert.ok(!rest.rooms.some((r) => r.roomId === secret.roomId));

  viewer.emit('join_room', { roomId, playerName: 'Fabio' });
  await until(() => viewer.state?.players.length === 2);
  const after = (await ack(host, 'rooms_list')).rooms.find((r) => r.roomId === roomId);
  assert.equal(after.players, 2);

  host.emit('start_game', roomId);
  await until(() => host.state?.roomMeta.started);
  assert.ok(!(await ack(host, 'rooms_list')).rooms.some((r) => r.roomId === roomId));
});

test('amizade: pedido depois da partida, aceite, situação e convite', async () => {
  const gabi = await account('Gabi');
  const heitor = await account('Heitor');
  const g = await client({ token: gabi.token });
  const h = await client({ token: heitor.token });
  await until(() => g.seen.has('account_state') && h.seen.has('account_state'));

  // Jogam juntos numa sala com senha.
  g.emit('create_room', { displayName: 'Amigos', playerName: 'ignorado', password: 'pw' });
  const { roomId } = await waitFor(g, 'room_created');
  h.emit('join_room', { roomId, playerName: 'falso', password: 'pw' });
  await until(() => g.state?.players.length === 2);
  // O nome na mesa vem da conta, não do cliente.
  const heitorSeat = g.state.players.find((p) => p.userId === heitor.user.id);
  assert.equal(heitorSeat.name, 'Heitor');

  assert.equal((await ack(h, 'friend_request', { userId: heitor.user.id })).code, 'INVALID');
  const incoming = waitFor(h, 'friend_request');
  const sent = await ack(g, 'friend_request', { userId: heitorSeat.userId });
  assert.equal(sent.result, 'sent');
  assert.equal((await incoming).from.username, 'Gabi');
  assert.deepEqual((await ack(h, 'friends_list')).incoming, [{ userId: gabi.user.id, username: 'Gabi' }]);

  const update = waitFor(g, 'friends_update', (u) => u.friends.length === 1);
  assert.equal((await ack(h, 'friend_respond', { userId: gabi.user.id, accept: true })).ok, true);
  const list = await update;
  assert.equal(list.friends[0].username, 'Heitor');
  assert.equal(list.friends[0].status, 'in_lobby');
  assert.deepEqual(list.incoming, []);

  // Heitor sai da sala; Gabi o convida e ele entra sem saber a senha.
  h.emit('leave_room');
  await until(() => g.state?.players.length === 1);
  const online = await ack(g, 'friends_list');
  assert.equal(online.friends[0].status, 'online');
  const invited = waitFor(h, 'room_invite');
  assert.equal((await ack(g, 'room_invite', { userId: heitor.user.id })).roomId, roomId);
  const inv = await invited;
  assert.equal(inv.from.username, 'Gabi');
  h.emit('join_room', { roomId: inv.roomId });
  await until(() => g.state?.players.length === 2);

  // Convidado não amigo é recusado; convidado sem conta não usa amigos.
  const ines = await account('Ines');
  const i = await client({ token: ines.token });
  await until(() => i.seen.has('account_state'));
  assert.equal((await ack(g, 'room_invite', { userId: ines.user.id })).code, 'NOT_FRIENDS');
  const guest = await client();
  assert.equal((await ack(guest, 'friends_list')).code, 'UNAUTHORIZED');

  g.emit('start_game', roomId);
  const inMatch = await waitFor(h, 'friends_update', (u) => u.friends[0]?.status === 'in_match');
  assert.equal(inMatch.friends[0].userId, gabi.user.id);

  // Nada sensível nos payloads de amigos.
  assert.ok(!JSON.stringify(inMatch).includes('passwordHash'));
});

test('denúncias: guarda, conta por jogador, bloqueia repetição e excesso', async () => {
  const juca = await account('Juca');
  const reporter = await client({ token: juca.token });
  await until(() => reporter.seen.has('account_state'));
  const others = await Promise.all([1, 2, 3].map(() => client()));
  reporter.emit('create_room', { displayName: 'Mesa', playerName: 'x' });
  const { roomId } = await waitFor(reporter, 'room_created');
  for (const [i, o] of others.entries()) o.emit('join_room', { roomId, playerName: `Rival ${i}` });
  await until(() => reporter.state?.players.length === 4);
  const [a, b, c] = reporter.state.players.filter((p) => p.id !== reporter.id).map((p) => p.id);

  assert.equal((await ack(reporter, 'report_player', { playerId: a, reason: 'xingou' })).code, 'INVALID');
  assert.equal((await ack(reporter, 'report_player', { playerId: 'ninguem', reason: 'anti_game' })).code, 'NOT_FOUND');
  assert.equal((await ack(reporter, 'report_player', { playerId: reporter.id, reason: 'anti_game' })).code, 'NOT_FOUND');
  const ok1 = await ack(reporter, 'report_player', { playerId: a, reason: 'voice_abuse', note: '  gritou\u0000 no chat  ' });
  assert.equal(ok1.ok, true);
  assert.equal((await ack(reporter, 'report_player', { playerId: a, reason: 'anti_game' })).code, 'DUPLICATE');
  assert.equal((await ack(reporter, 'report_player', { playerId: b, reason: 'anti_game' })).ok, true);
  assert.equal((await ack(reporter, 'report_player', { playerId: c, reason: 'anti_game' })).code, 'RATE_LIMITED');

  // Convidados também denunciam; o limite deles vale por IP.
  others[1].emit('report_player', { playerId: a, reason: 'anti_game' });
  const fromGuest = await ack(others[1], 'report_player', { playerId: c, reason: 'anti_game' });
  assert.equal(fromGuest.ok, true);

  server.flush();
  const doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'reports.json'), 'utf8'));
  const mine = doc.reports.filter((r) => r.roomId === roomId);
  assert.equal(mine.filter((r) => r.reporter.userId === juca.user.id).length, 2);
  assert.equal(mine[0].note, 'gritou no chat');
  assert.equal(doc.counts['guest:rival 0'].total, 2);
  assert.equal(doc.counts['guest:rival 0'].voice_abuse, 1);
});

test('confirma o email e troca a senha pelos links do email', async () => {
  const reg = await account('Clara');
  const mailTo = (to, subject) => mailer.sent.filter((m) => m.to === to && m.subject.includes(subject)).at(-1);
  const tokenOf = (m, p) => new URL(m.text.match(/https:\/\/\S+/)[0]).searchParams.get('token') ?? assert.fail(p);

  // Confirmação: link no email, página abre e marca a conta.
  const verify = mailTo('Clara@exemplo.com', 'Confirme');
  assert.ok(verify, 'email de confirmação enviado');
  assert.ok(verify.text.includes('https://intriga.test/verify-email?token='));
  const vt = tokenOf(verify);
  const page = await fetch(`${base}/verify-email?token=${vt}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Email confirmado/);
  assert.equal((await fetch(`${base}/verify-email?token=${vt}`)).status, 400, 'link de uso único');
  const meRes = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${reg.token}` } });
  assert.equal((await meRes.json()).user.emailVerified, true);
  assert.equal((await post('/api/auth/resend-verification', {}, reg.token)).body.code, 'ALREADY_VERIFIED');

  // Esqueci a senha: mesma resposta exista ou não a conta.
  const before = mailer.sent.length;
  assert.equal((await post('/api/auth/forgot-password', { email: 'ninguem@exemplo.com' })).status, 200);
  assert.equal(mailer.sent.length, before);
  assert.equal((await post('/api/auth/forgot-password', { email: 'clara@EXEMPLO.com' })).status, 200);
  const reset = mailTo('Clara@exemplo.com', 'senha');
  assert.ok(reset.text.includes('https://intriga.test/reset-password?token='));
  const rt = tokenOf(reset);
  assert.match(await (await fetch(`${base}/reset-password?token=${rt}`)).text(), /TROCAR SENHA/);

  assert.equal((await post('/api/auth/reset-password', { token: rt, password: '123' })).body.code, 'INVALID_PASSWORD');
  assert.equal((await post('/api/auth/reset-password', { token: rt, password: PW_OTHER })).status, 200);
  assert.equal((await post('/api/auth/reset-password', { token: rt, password: PW })).body.code, 'INVALID_TOKEN');

  // A senha antiga e as sessões abertas deixam de valer.
  assert.equal((await post('/api/auth/login', { login: 'clara', password: PW })).status, 401);
  assert.equal((await post('/api/auth/login', { login: 'clara@exemplo.com', password: PW_OTHER })).status, 200);
  const old = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${reg.token}` } });
  assert.equal(old.status, 401);

  // Pelo socket também dá para pedir o link.
  const s = await client();
  assert.equal((await ack(s, 'account_forgot_password', { email: 'clara@exemplo.com' })).ok, true);

  // O email de um jogador nunca aparece para os outros.
  server.flush();
  const doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8'));
  const clara = doc.users.find((u) => u.username === 'Clara');
  assert.ok(!JSON.stringify(doc).includes(rt) && !JSON.stringify(doc).includes(vt), 'tokens só como hash');
  assert.equal(clara.emailKey, 'clara@exemplo.com');
});
