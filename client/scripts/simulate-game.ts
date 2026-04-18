import { CoupEngine } from '../engine/CoupEngine.ts';
import { BotManager } from '../engine/BotManager.ts';

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
      const player = state.players[state.turnIndex];
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
    turnCount
  };
}

async function runBatch() {
  console.log("🚀 Iniciando Bateria de Teste Titã (10.000 Jogos)...");
  
  const stats = {
    total: 10000,
    sucessos: 0,
    erros: 0,
    vencedores: {} as Record<string, number>,
    totalTurnos: 0
  };

  for (let i = 1; i <= stats.total; i++) {
    try {
      // Tira os logs normais para não inundar o console
      const originalLog = console.log;
      console.log = () => {};
      const result = await runSimulation(i);
      console.log = originalLog;

      stats.sucessos++;
      stats.totalTurnos += result.turnCount;
      stats.vencedores[result.winner] = (stats.vencedores[result.winner] || 0) + 1;
      
      if (typeof process !== 'undefined' && process.stdout) {
         if (i % 250 === 0) {
           process.stdout.write(`\n[${i}/${stats.total}] `);
         } else if (i % 10 === 0) {
           process.stdout.write('.');
         }
      }
    } catch (e: any) {
      // restaura log se der erro
      console.log = function() {
        process.stdout.write(Array.from(arguments).join(' ') + '\n');
      }; 
      stats.erros++;
      console.error(`\n❌ Erro no Jogo ${i}: ${e.message}`);
    }
  }

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
