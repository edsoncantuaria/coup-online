// Relógio do turno: o app recebe quanto tempo resta e quem deixa o tempo
// acabar três vezes seguidas sai da partida.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connectClient } from 'socket.io-client';
import { startServer } from '../dist/server.js';
import { MemoryMailer } from '../dist/mail/Mailer.js';

let server;
let dataDir;
const clients = [];

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intriga-idle-'));
  server = await startServer({
    port: 0,
    dataDir,
    botDelayMs: 5,
    turnMs: 150,
    queue: { gatherMs: 50, botFillMs: 100, tickMs: 20, minPlayers: 4, botFillTarget: 4 },
    mailer: new MemoryMailer(),
  });
});

after(async () => {
  for (const c of clients) c.close();
  await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function client() {
  const s = connectClient(`http://localhost:${server.port}`, { transports: ['websocket'], forceNew: true });
  clients.push(s);
  s.state = null;
  s.clocks = [];
  // O servidor manda só as últimas linhas do registro: junta tudo o que passou.
  s.logs = new Set();
  s.on('room_update', (st) => {
    s.state = st;
    for (const line of st.logs ?? []) s.logs.add(line);
    if (st.turnClock) s.clocks.push(st.turnClock);
  });
  await new Promise((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}

async function until(cond, ms = 10000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('condição não atingida');
    await new Promise((r) => setTimeout(r, 15));
  }
}

test('quem deixa o tempo acabar três vezes seguidas é eliminado e segue assistindo', async () => {
  const afk = await client();
  const r = await afk.timeout(3000).emitWithAck('queue_join', { playerName: 'Sumido' });
  assert.equal(r.ok, true);
  await until(() => afk.state?.roomMeta?.started);

  // Nunca joga: os estouros contam e, no terceiro, ele sai.
  const me = () => afk.state.players.find((p) => p.id === afk.id);
  await until(() => me().cards.every((c) => c.isFlipped));
  const logs = [...afk.logs].join('\n');
  assert.match(logs, /Tempo esgotado para Sumido \(1\/3\)/);
  assert.match(logs, /Sumido foi eliminado por ficar sem jogar/);
  // Continua conectado, recebendo o estado da mesa.
  assert.equal(me().isConnected, true);

  // O relógio chegou ao app, só para o humano e com o tempo de decisão.
  assert.ok(afk.clocks.length >= 3);
  assert.ok(afk.clocks.every((c) => c.playerId === afk.id && c.endInMs <= 150 && c.endInMs >= c.startInMs));
});
