import { GameState, Action, Role } from './types';
import { CoupEngine } from './CoupEngine';

export class BotManager {
  private engine: CoupEngine;

  constructor(engine: CoupEngine) {
    this.engine = engine;
  }

  public decideAction(botId: string): Action | null {
    const state = this.engine.getState();
    const bot = state.players.find(p => p.id === botId);
    if (!bot || state.phase !== 'action') return null;

    // Must Coup if 10+ coins
    if (bot.coins >= 10) {
      const target = this.getRandomTarget(botId, state);
      if (target) {
        return { type: 'coup', source: botId, target };
      }
    }

    const rand = Math.random();
    const target = this.getRandomTarget(botId, state);

    // Assassination (cost 3)
    if (bot.coins >= 3 && target && rand < 0.2) {
      return { type: 'assassinate', source: botId, target };
    }

    if (rand < 0.3) return { type: 'tax', source: botId };
    if (rand < 0.5) return { type: 'income', source: botId };
    if (rand < 0.6) return { type: 'exchange', source: botId };
    
    // Steal: Apenas alvos com moedas valem a pena (roubar 0 é desperdício de turno)
    const targetPlayer = state.players.find(p => p.id === target);
    if (target && targetPlayer && targetPlayer.coins > 0 && rand < 0.8) return { type: 'steal', source: botId, target };

    return { type: 'foreign_aid', source: botId };
  }

  public decideResponse(botId: string): { type: 'pass' | 'challenge' | 'block' | 'allow', role?: Role } {
    const state = this.engine.getState();
    const action = state.currentAction;
    if (!action) return { type: 'pass' };

    const rand = Math.random();

    if (state.phase === 'block') {
      if (state.pendingBlock) {
        // Alguém bloqueou: decidir se desafia o bloqueio (cobertura aumentada para 40%)
        if (rand < 0.4) return { type: 'challenge' };
        return { type: 'pass' };
      } else {
        // Ninguém bloqueou ainda: decisão de bloquear
        const isTarget = action.target === botId;
        const canBlock = (action.type === 'foreign_aid') || 
                         (action.type === 'steal' && isTarget) || 
                         (action.type === 'assassinate' && isTarget);

        if (canBlock && rand < 0.7) {
          let role: Role | undefined;
          if (action.type === 'steal') {
            role = Math.random() < 0.5 ? 'captain' : 'ambassador';
          }
          return { type: 'block', role };
        }
        return { type: 'pass' };
      }
    }

    if (state.phase === 'challenge') {
      // Desafiar ações claimadas (cobertura aumentada para 35%)
      if (rand < 0.35 && ['tax', 'steal', 'assassinate', 'exchange'].includes(action.type)) {
        return { type: 'challenge' };
      }
      return { type: 'pass' };
    }

    return { type: 'pass' };
  }

  public decideExchange(botId: string, currentRoles: Role[], exchangeRoles: Role[]): Role[] {
    const allAvailable = [...currentRoles, ...exchangeRoles];
    // Simple logic: keep first N roles (usually 1 or 2 depending on how many bot currently has)
    // In actual simulation, we'll keep the roles the bot already had or any 'assassin/duke' if available
    return allAvailable.slice(0, currentRoles.length);
  }

  public decideCardToLose(botId: string): number {
    const state = this.engine.getState();
    const bot = state.players.find(p => p.id === botId);
    if (!bot) return 0;
    
    const unflippedIndex = bot.cards.findIndex(c => !c.isFlipped);
    return unflippedIndex >= 0 ? unflippedIndex : 0;
  }

  private getRandomTarget(botId: string, state: GameState): string | undefined {
    const targets = state.players.filter(p => p.id !== botId && p.cards.some(c => !c.isFlipped));
    if (targets.length === 0) return undefined;
    const target = targets[Math.floor(Math.random() * targets.length)];
    return target ? target.id : undefined;
  }
}
