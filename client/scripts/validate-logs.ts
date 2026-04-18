/**
 * validate-logs.ts
 * Lê o log de simulação mais recente e valida invariantes das regras do Coup.
 * Detecta automaticamente qualquer violação de regra nos logs.
 */
import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────
// 1. CONFIGURAÇÃO E LEITURA DO ARQUIVO
// ────────────────────────────────────────────

const logsDir = path.join(__dirname, 'logs');
const logFiles = fs.readdirSync(logsDir)
  .filter(f => f.startsWith('simulation-all') && f.endsWith('.log'))
  .sort().reverse();

if (logFiles.length === 0) {
  console.error('❌ Nenhum log de simulação encontrado em', logsDir);
  process.exit(1);
}

const logFile = path.join(logsDir, logFiles[0]);
console.log(`\n📂 Validando: ${path.basename(logFile)}\n`);

const raw = fs.readFileSync(logFile, 'utf-8');

// Remove timestamps, divide em linhas limpas
const allLines = raw.split('\n')
  .map(l => l.replace(/^\[.*?\] /, '').trim())
  .filter(Boolean);

// ────────────────────────────────────────────
// 2. DIVIDE EM JOGOS
// ────────────────────────────────────────────

const games: string[][] = [];
let cur: string[] = [];
for (const line of allLines) {
  if (line.startsWith('[JOGO')) {
    if (cur.length > 0) games.push(cur);
    cur = [];
  }
  cur.push(line);
}
if (cur.length > 0) games.push(cur);

// ────────────────────────────────────────────
// 3. TIPOS
// ────────────────────────────────────────────

interface CardState   { role: string; isFlipped: boolean; }
interface PlayerState { name: string; coins: number; cards: CardState[]; alive: boolean; }
type GameResult = { idx: number; violations: string[]; warnings: string[]; };

// ────────────────────────────────────────────
// 4. VALIDAÇÃO POR JOGO
// ────────────────────────────────────────────

const results: GameResult[] = [];

for (let gi = 0; gi < games.length; gi++) {
  const lines = games[gi];
  const violations: string[] = [];
  const warnings:   string[] = [];

  const players = new Map<string, PlayerState>();
  let gameOver    = false;
  let winnerName: string | null = null;
  let turnPlayer: string | null = null;
  let pendingAction: { actor: string; action: string } | null = null;

  // ── Invariante: Assassino provado → alvo deve ter oportunidade de bloquear ──
  let assassinProvenPending = false;
  let blockOfferedAfterProof = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── 4.1  FIM DE JOGO ──────────────────────────────────────
    if (line.includes('FIM DE JOGO')) {
      gameOver = true;
      const m = line.match(/pertence a (.+?)\.?$/);
      if (m) winnerName = m[1].replace(/\.$/, '').trim();
      pendingAction = null;
      continue;
    }

    if (gameOver && line.includes('📍 Turno de') && !line.includes('[DEBUG]')) {
      violations.push(`[pós-FIM] Turno declarado após FIM DE JOGO: "${line}"`);
    }
    if (gameOver && line.includes('📢')) {
      violations.push(`[pós-FIM] Ação declarada após FIM DE JOGO: "${line}"`);
    }

    // ── 4.2  HEADER DE TURNO — apenas nos logs [DEBUG] ───────
    // "[DEBUG] Turno de X | Estado: A: 💰Y [Card1] [Card2] | B: 💰Z [Card3] ..."
    const debugM = line.match(/\[DEBUG\] Turno de (.+?) \| Estado: (.+)/);
    if (debugM) {
      const [, currentPlayer, stateStr] = debugM;
      turnPlayer = currentPlayer;

      // Cada entrada é separada por " | "
      const entries = stateStr.split(' | ');
      for (const entry of entries) {
        const nameM = entry.match(/^(.+?): 💰(-?\d+)/);
        if (!nameM) continue;
        const name  = nameM[1];
        const coins = parseInt(nameM[2], 10);

        const cards: CardState[] = [];
        for (const cm of entry.matchAll(/\[([^\]]+)\]/g)) {
          const content = cm[1];
          const isFlipped = content.includes('☠');
          const role = content.replace(' ☠', '').trim();
          cards.push({ role, isFlipped });
        }

        // ── Validação: jogador da vez eliminado não pode jogar
        if (name === currentPlayer && cards.every(c => c.isFlipped)) {
          violations.push(`Jogador eliminado "${name}" recebeu turno (todas as cartas mortas). Linha: "${line}"`);
        }

        // ── Validação: carta morta não pode ressuscitar
        const prev = players.get(name);
        if (prev) {
          for (const prevCard of prev.cards.filter(c => c.isFlipped)) {
            const deadNow  = cards.filter(c => c.role === prevCard.role && c.isFlipped).length;
            const deadPrev = prev.cards.filter(c => c.role === prevCard.role && c.isFlipped).length;
            if (deadNow < deadPrev) {
              violations.push(`Carta morta "${prevCard.role}" de "${name}" ressuscitou! Linha: "${line}"`);
            }
          }
        }

        // ── Validação: moedas nunca negativas no início do turno
        if (name === currentPlayer && coins < 0) {
          violations.push(`"${name}" entrou no turno com ${coins} moedas (negativo). Linha: "${line}"`);
        }

        players.set(name, { name, coins, cards, alive: !cards.every(c => c.isFlipped) });
      }
      continue;
    }

    // ── 4.3  DECLARAÇÃO DE AÇÃO ──────────────────────────────
    const actionM = line.match(/📢 (.+?) declarou (.+?)( contra .+)?$/);
    if (actionM) {
      const [, actor, actionRaw] = actionM;

      if (pendingAction) {
        violations.push(`"${actor}" declarou nova ação sem resolver a anterior (${pendingAction.action}) de "${pendingAction.actor}". Linha: "${line}"`);
      }
      pendingAction = { actor, action: actionRaw };

      const p = players.get(actor);

      // >= 10 moedas → deve dar Golpe
      if (p && p.coins >= 10 && !actionRaw.includes('Golpe')) {
        violations.push(`"${actor}" tem ${p.coins} moedas e declarou "${actionRaw}" em vez de Golpe! Linha: "${line}"`);
      }
      // Assassinato: >= 3 moedas
      if (actionRaw.includes('Assassinato') && p && p.coins < 3) {
        violations.push(`"${actor}" declarou Assassinato com apenas ${p.coins} moedas! Linha: "${line}"`);
      }
      // Golpe: >= 7 moedas
      if (actionRaw.includes('Golpe') && p && p.coins < 7) {
        violations.push(`"${actor}" declarou Golpe com apenas ${p.coins} moedas! Linha: "${line}"`);
      }
      continue;
    }

    // ── 4.4  RESOLUÇÃO DE AÇÃO ───────────────────────────────
    // Qualquer uma das strings abaixo fecha a ação pendente
    const resolutions = [
      '✨ Ação',               // "✨ Ação X resolvida"
      '🚫 O bloqueio de',     // "🚫 O bloqueio de X foi aceito"
      '🛡️ O bloqueio teve sucesso', 
      'A ação de',            // "A ação de X falhou pois era um blefe"
      '✅ Renda não pode',     // Renda resolve
      '✅ Auxílio Externo',    // Se resolver direto? (não temos esse log mas por garantia)
      '⚔️ O bloqueio falhou',  // Bloqueio falhou e ação original foi retomada (a linha seguinte resolverá a ação)
      '💀 O alvo',             // Alvo eliminado pelo desafio (nova regra)
    ];
    if (resolutions.some(r => line.includes(r))) {
      pendingAction = null;
    }

    // ── 4.5  ROLAGEM DE MOEDAS ───────────────────────────────
    // "💰 X agora tem Y moedas."
    const coinM = line.match(/💰 (.+?) agora tem (\d+) moedas\./);
    if (coinM) {
      const [, name, coinsStr] = coinM;
      const coins = parseInt(coinsStr, 10);
      if (coins < 0) violations.push(`"${name}" ficou com ${coins} moedas (negativo). Linha: "${line}"`);
      const p = players.get(name);
      if (p) p.coins = coins;
      continue;
    }

    // "💰 Roubo: Ganhador (+N) | Perdedor (M restantes)"
    const stealM = line.match(/💰 Roubo: (.+?) \(\+(\d+)\) \| (.+?) \((\d+) restantes\)/);
    if (stealM) {
      const [, gainerName, gainStr, loserName, remainStr] = stealM;
      const stolen = parseInt(gainStr, 10);
      const remain = parseInt(remainStr, 10);
      if (remain < 0)  violations.push(`"${loserName}" ficou com ${remain} moedas após roubo (negativo). Linha: "${line}"`);
      if (stolen > 2)  violations.push(`Roubo de ${stolen} moedas excede o máximo de 2. Linha: "${line}"`);
      const gainer = players.get(gainerName); if (gainer) gainer.coins += stolen;
      const loser  = players.get(loserName);  if (loser)  loser.coins  = remain;
      continue;
    }

    // ── 4.6  PERDA DE INFLUÊNCIA ─────────────────────────────
    // "📉 X revelou e perdeu seu Y."
    const flipM = line.match(/📉 (.+?) revelou e perdeu seu (.+?)\./);
    if (flipM) {
      const [, name, role] = flipM;
      const p = players.get(name);
      if (p) {
        const card = p.cards.find(c => c.role === role && !c.isFlipped);
        if (!card) {
          warnings.push(`"${name}" perdeu "${role}" mas essa carta não estava na mão viva registrada. Linha: "${line}"`);
        } else {
          card.isFlipped = true;
        }
        p.alive = p.cards.some(c => !c.isFlipped);
      }
      continue;
    }

    // "💀 X perdeu sua última influência (Y)!"
    const lastM = line.match(/💀 (.+?) perdeu sua última influência \((.+?)\)!/);
    if (lastM) {
      const [, name, role] = lastM;
      const p = players.get(name);
      if (p) {
        const card = p.cards.find(c => c.role === role && !c.isFlipped);
        if (!card) {
          warnings.push(`"${name}" perdeu última influência "${role}" mas essa carta não estava registrada como viva. Linha: "${line}"`);
        } else {
          card.isFlipped = true;
        }
        p.alive = false;
      }
      continue;
    }

    // ── 4.8  INVARIANTE: Assassino provado → bloquear deve ser oferecido ──────
    // "✅ X PROVOU ser Assassino!" só aparece em desafio de AÇÃO (nunca de bloqueio),
    if (line.includes('PROVOU ser Assassino')) {
      assassinProvenPending  = true;
      blockOfferedAfterProof = false;
    }
    // Log de openBlockPhaseForTarget (Assassinato ou Roubo)
    if (assassinProvenPending && line.includes('desafio falhou') && (line.includes('Condessa') || line.includes('Capitão'))) {
      blockOfferedAfterProof = true;
    }
    // Assassinato resolveu: verifica se o bloqueio foi oferecido antes
    if (line.includes('Ação Assassinato resolvida')) {
      if (assassinProvenPending && !blockOfferedAfterProof) {
        // Exceção: se o alvo morreu no desafio, não há bloqueio
        const deadMatch = lines.some((l, idx) => idx < i && l.includes('eliminado pelo desafio'));
        if (!deadMatch) {
          violations.push(`[Regra] Assassinato resolveu SEM oferecer bloqueio ao alvo após desafio provado. Linha: "${line}"`);
        }
      }
      assassinProvenPending  = false;
      blockOfferedAfterProof = false;
    }

    // ── 4.9 INVARIANTE: Bloqueio de Ajuda Externa falhou → deve reiniciar fase ──
    if (line.includes('O bloqueio falhou! A fase de bloqueio será reiniciada')) {
      const isForeignAid = lines.slice(0, i).reverse().find(l => l.includes('📢') && l.includes('Ajuda Externa'));
      if (isForeignAid) {
        // Verifica se a linha seguinte (ou próxima relevante) é o restart
        const nextRelevant = lines[i + 1] || '';
        if (!nextRelevant.includes('Reiniciando fase de bloqueio')) {
          violations.push(`[Regra] Bloqueio de Ajuda Externa falhou mas a fase não foi reiniciada corretamente. Linha: "${line}"`);
        }
      }
    }

    // Limpa o estado em caso de fim de jogo ou bloqueio bem-sucedido
    if (line.includes('FIM DE JOGO') ||
        line.includes('O bloqueio de') ||
        line.includes('O bloqueio teve sucesso') ||
        line.includes('eliminado pelo desafio')) {
      assassinProvenPending  = false;
      blockOfferedAfterProof = false;
      pendingAction = null; // Fim de jogo resolve qualquer pendência
    }
  }

  // ── 4.7  VALIDAÇÕES PÓS-JOGO ─────────────────────────────────
  if (winnerName) {
    const winner = players.get(winnerName);
    if (winner && winner.cards.every(c => c.isFlipped)) {
      violations.push(`Vencedor "${winnerName}" tinha TODAS as cartas viradas no fim do jogo!`);
    }
  }

  results.push({ idx: gi + 1, violations, warnings });
}

// ────────────────────────────────────────────
// 5. RELATÓRIO
// ────────────────────────────────────────────

let totalV = 0, totalW = 0, gamesWithV = 0;

console.log('═'.repeat(60));
console.log('📋  RELATÓRIO DE VALIDAÇÃO DE LOGS');
console.log('═'.repeat(60));

for (const r of results) {
  if (r.violations.length === 0 && r.warnings.length === 0) continue;
  console.log(`\n[JOGO ${r.idx}]`);
  for (const v of r.violations) { console.log(`  ❌ VIOLAÇÃO: ${v}`); totalV++; }
  for (const w of r.warnings)   { console.log(`  ⚠️  AVISO:    ${w}`); totalW++; }
  if (r.violations.length > 0) gamesWithV++;
}

console.log('\n' + '═'.repeat(60));
console.log(`📊  ${games.length} jogos analisados`);
console.log(`❌  Violações de regra:  ${totalV} em ${gamesWithV} jogos`);
console.log(`⚠️   Avisos (não-fatais): ${totalW}`);
console.log(totalV === 0
  ? '✅  TODOS OS JOGOS PASSARAM NA VALIDAÇÃO!'
  : '🚨  ENCONTRADAS VIOLAÇÕES DE REGRA!'
);
console.log('═'.repeat(60) + '\n');

process.exit(totalV > 0 ? 1 : 0);
