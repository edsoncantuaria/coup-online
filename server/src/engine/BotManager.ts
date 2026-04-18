import { GameState, Action, Role } from './types.js';
import { CoupEngine } from './CoupEngine.js';

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

    // Basic logic:
    // If < 3 coins, try to Tax (Bluffing sometimes) or Foreign Aid
    const rand = Math.random();
    if (rand < 0.4) return { type: 'tax', source: botId };
    if (rand < 0.7) return { type: 'income', source: botId };
    
    const target = this.getRandomTarget(botId, state);
    if (target && rand < 0.9) return { type: 'steal', source: botId, target };

    return { type: 'foreign_aid', source: botId };
  }

  public decideResponse(botId: string): 'pass' | 'challenge' | 'block' | 'allow' {
    const state = this.engine.getState();
    const action = state.currentAction;
    if (!action) return 'pass';

    // Basic bot logic: 10% chance to challenge if it's a tax/steal/assassinate
    const rand = Math.random();
    if (rand < 0.1 && ['tax', 'steal', 'assassinate'].includes(action.type)) {
      return 'challenge';
    }

    // 20% chance to block if it's foreign aid or targeted at them
    if (rand < 0.2 && (action.type === 'foreign_aid' || action.target === botId)) {
      return 'block';
    }

    return 'pass';
  }

  public decideCardToLose(botId: string): number {
    const state = this.engine.getState();
    const bot = state.players.find(p => p.id === botId);
    if (!bot) return 0;
    
    const unflippedIndex = bot.cards.findIndex(c => !c.isFlipped);
    return unflippedIndex >= 0 ? unflippedIndex : 0;
  }

  private getRandomTarget(botId: string, state: GameState): string | undefined {
    const targets = state.players.filter(p => p.id !== botId && p.cards.length > 0 && p.id);
    if (targets.length === 0) return undefined;
    const target = targets[Math.floor(Math.random() * targets.length)];
    return target ? target.id : undefined;
  }

  // To be expanded: decideChallenge, decideBlock, decideReveal
}
