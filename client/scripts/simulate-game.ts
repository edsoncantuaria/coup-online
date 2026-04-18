import { CoupEngine } from '../engine/CoupEngine';
import { BotManager } from '../engine/BotManager';
import * as fs from 'fs';
import * as path from 'path';

async function runSimulation(index: number) {
  const engine = new CoupEngine(`SIM-${index}`);
  const botMgr = new BotManager(engine);

  engine.addPlayer("bot-1", "D. Quixote", true);
  engine.addPlayer("bot-2", "Sancho Pança", true);
  engine.addPlayer("bot-3", "Dulcineia", true);
  engine.addPlayer("bot-4", "Rocinante", true);

  engine.startGame();

  let turnCount = 0;
  const MAX_TURNS = 500;

  try {
    while (engine.getState().phase !== 'game_over' && turnCount < MAX_TURNS) {
      const state = engine.getState();
      const phase = state.phase;
      
      if (phase === 'action') {
        const currentPlayer = engine.getCurrentPlayer();
        const action = botMgr.decideAction(currentPlayer.id);
        if (action) {
          turnCount++;
          engine.handleAction(currentPlayer.id, action);
        }
      } 
      else if (phase === 'challenge' || phase === 'block') {
        const responderIndex = state.waitingForResponseIndex;
        if (responderIndex !== null) {
          const player = state.players[responderIndex];
          const resp = botMgr.decideResponse(player.id);
          engine.handleResponse(player.id, resp.type, resp.role);
        }
      }
      else if (phase === 'losing_influence') {
        const victimId = state.losingInfluenceId!;
        const victim = state.players.find(p => p.id === victimId)!;
        const cardIndex = botMgr.decideCardToLose(victimId);
        const cardToLose = victim.cards[cardIndex];
        engine.handleFlip(victimId, cardToLose.role);
      }
      else if (phase === 'exchanging') {
        // Usa waitingForResponseIndex (definido em handleExchange) para consistência com o engine
        const expectedIndex = state.waitingForResponseIndex;
        if (expectedIndex === null) break; // Guard: não deveria acontecer
        const player = state.players[expectedIndex];
        const keptRoles = botMgr.decideExchange(
          player.id, 
          player.cards.filter(c => !c.isFlipped).map(c => c.role), 
          state.exchangingCards!
        );
        engine.handleExchangeChoice(player.id, keptRoles);
      }
    }

    const finalState = engine.getState();
    if (turnCount >= MAX_TURNS) {
      throw new Error(`Jogo ${index} travou no Limite de ${MAX_TURNS} turnos.`);
    }

    return {
      winner: finalState.players.find(p => p.id === finalState.winner)?.name || "Nenhum",
      turnCount,
      allLogs: engine.allLogs
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const ts = new Date().toISOString().replace(/:/g, '-');
    const logPath = path.join(__dirname, 'logs', `sim-ERROR-${index}-${ts}.log`);
    engine.allLogs.push(`\n[CRITICAL ERROR] ${errorMsg}`);
    fs.writeFileSync(logPath, engine.allLogs.join('\n'));
    throw err; // Re-throw para contar nas estatísticas globais
  }
}

async function runBatch() {
  console.log("🚀 Iniciando Bateria de Teste (100 Jogos)...");
  
  const stats = {
    total: 100,
    sucessos: 0,
    erros: 0,
    vencedores: {} as Record<string, number>,
    totalTurnos: 0
  };

  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Criar um stream de escrita único para os 10.000 jogos
  const ts = new Date().toISOString().replace(/:/g, '-');
  const masterLogPath = path.join(logsDir, `simulation-all-${ts}.log`);
  console.log(`📝 Gravando todos os logs no arquivo: ${masterLogPath}\n`);
  
  const logStream = fs.createWriteStream(masterLogPath, { flags: 'a' });

  for (let i = 1; i <= stats.total; i++) {
    try {
      const originalLog = console.log;
      console.log = () => {};
      const result = await runSimulation(i);
      console.log = originalLog;

      stats.sucessos++;
      stats.totalTurnos += result.turnCount;
      stats.vencedores[result.winner] = (stats.vencedores[result.winner] || 0) + 1;
      
      // Escreve os logs do jogo de forma separada no Stream
      logStream.write(`\n========================================\n`);
      logStream.write(`[JOGO ${i}]\n`);
      logStream.write(`Vencedor: ${result.winner} (${result.turnCount} turnos)\n`);
      logStream.write(`========================================\n`);
      logStream.write(result.allLogs.join('\n') + '\n');

      if (typeof process !== 'undefined' && process.stdout) {
         if (i % 25 === 0) {
           process.stdout.write(`\n[${i}/${stats.total}] `);
         } else if (i % 5 === 0) {
           process.stdout.write('.');
         }
      }
    } catch (e: unknown) {
      console.log = function(...args: unknown[]) {
        process.stdout.write(args.join(' ') + '\n');
      }; 
      stats.erros++;
      
      const errorMsg = e instanceof Error ? e.message : String(e);
      logStream.write(`\n========================================\n`);
      logStream.write(`[JOGO ${i}] - ❌ CRITICAL CRASH\n`);
      logStream.write(`Erro: ${errorMsg}\n`);
      logStream.write(`========================================\n\n`);

      console.error(`\n❌ Erro no Jogo ${i}. Registrado no master log.`);
    }
  }

  logStream.end();

  console.log("\n\n========================================");
  console.log(`📊 ESTATÍSTICAS DA BATERIA`);
  console.log(`✅ Sucessos: ${stats.sucessos}/${stats.total}`);
  console.log(`❌ Erros / Deadlocks: ${stats.erros}`);
  console.log(`⏳ Média de turnos por jogo: ${(stats.totalTurnos / Math.max(stats.sucessos, 1)).toFixed(1)}`);
  console.log(`🏆 Divisão de Vitórias:`);
  Object.entries(stats.vencedores).forEach(([name, count]) => {
    console.log(`  - ${name}: ${count} vitórias (${((count / stats.sucessos) * 100).toFixed(1)}%)`);
  });
  console.log("========================================\n");
}

runBatch().catch(console.error);
