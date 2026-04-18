import { GameState, Action, Role, BotPersonality } from './types';
import { CoupEngine } from './CoupEngine';

/**
 * Memória persistente por BotManager do que cada bot observa durante
 * a partida. Mapeado por botId → oponente → dados.
 *
 * Obs: o BotManager é recriado a cada consulta no hook; por isso a memória
 * fica num Map estático (nível de módulo), chaveada por (engineId, botId).
 */
interface OpponentMemory {
  knownRoles: Role[]; // cartas já viradas (reveladas) do oponente
  provenRoles: Role[]; // roles que o oponente provou ter em desafios (duke, etc.)
  bluffsCaught: number; // quantas vezes pegamos esse oponente blefando
  lastClaim?: { role: Role; turnStamp: number };
}

interface BotMemory {
  opponents: Record<string, OpponentMemory>;
  lastSeenRevealStamp?: number;
  lastSeenLossStamp?: number;
}

const memoryStore: Map<string, BotMemory> = new Map();

function keyFor(engine: CoupEngine, botId: string): string {
  // usa o próprio roomId como escopo do engine
  return `${engine.getState().roomId}::${botId}`;
}

function getMemory(engine: CoupEngine, botId: string): BotMemory {
  const k = keyFor(engine, botId);
  const existing = memoryStore.get(k);
  if (existing) return existing;
  const fresh: BotMemory = { opponents: {} };
  memoryStore.set(k, fresh);
  return fresh;
}

function ensureOpp(mem: BotMemory, id: string): OpponentMemory {
  if (!mem.opponents[id]) {
    mem.opponents[id] = {
      knownRoles: [],
      provenRoles: [],
      bluffsCaught: 0,
    };
  }
  return mem.opponents[id];
}

function updateMemoryFromState(engine: CoupEngine, botId: string) {
  const state = engine.getState();
  const mem = getMemory(engine, botId);

  // Descobre cartas viradas de todos os oponentes
  state.players.forEach((p) => {
    if (p.id === botId) return;
    const opp = ensureOpp(mem, p.id);
    const flipped = p.cards.filter((c) => c.isFlipped).map((c) => c.role);
    // substitui knownRoles com o que está visível atualmente
    opp.knownRoles = flipped;
  });

  // lastReveal: registrar proven / bluff
  const reveal = (state as any).lastReveal as
    | {
        role: Role;
        playerId: string;
        verdict: 'proven' | 'bluff';
        stamp: number;
      }
    | undefined;
  if (reveal && reveal.stamp !== mem.lastSeenRevealStamp) {
    mem.lastSeenRevealStamp = reveal.stamp;
    if (reveal.playerId !== botId) {
      const opp = ensureOpp(mem, reveal.playerId);
      if (reveal.verdict === 'proven') {
        if (!opp.provenRoles.includes(reveal.role)) {
          opp.provenRoles.push(reveal.role);
        }
      } else {
        opp.bluffsCaught += 1;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tunings por personalidade                                          */
/* ------------------------------------------------------------------ */

interface Tuning {
  // Probabilidades base (0..1)
  challengeRate: number;
  blockRate: number;
  bluffRate: number; // probabilidade de reivindicar carta que não tem
  aggression: number; // preferência por steal/assassinate/coup
  greed: number; // preferência por tax/foreign_aid
}

const TUNING: Record<BotPersonality, Tuning> = {
  cautious: {
    challengeRate: 0.12,
    blockRate: 0.55,
    bluffRate: 0.08,
    aggression: 0.2,
    greed: 0.65,
  },
  tyrant: {
    challengeRate: 0.25,
    blockRate: 0.55,
    bluffRate: 0.28,
    aggression: 0.75,
    greed: 0.3,
  },
  bluffer: {
    challengeRate: 0.55,
    blockRate: 0.65,
    bluffRate: 0.6,
    aggression: 0.5,
    greed: 0.4,
  },
  balanced: {
    challengeRate: 0.3,
    blockRate: 0.6,
    bluffRate: 0.25,
    aggression: 0.45,
    greed: 0.5,
  },
};

/* ------------------------------------------------------------------ */
/* BotManager                                                          */
/* ------------------------------------------------------------------ */

export class BotManager {
  private engine: CoupEngine;

  constructor(engine: CoupEngine) {
    this.engine = engine;
  }

  private tuning(botId: string): Tuning {
    const state = this.engine.getState();
    const bot = state.players.find((p) => p.id === botId);
    const personality: BotPersonality = (bot?.personality as BotPersonality) || 'balanced';
    return TUNING[personality];
  }

  public decideAction(botId: string): Action | null {
    updateMemoryFromState(this.engine, botId);
    const state = this.engine.getState();
    const bot = state.players.find((p) => p.id === botId);
    if (!bot || state.phase !== 'action') return null;

    const tuning = this.tuning(botId);
    const myRoles = bot.cards.filter((c) => !c.isFlipped).map((c) => c.role);
    const has = (r: Role) => myRoles.includes(r);

    // Obrigatório Coup com 10+
    if (bot.coins >= 10) {
      const tgt = this.pickThreateningTarget(botId, state);
      if (tgt) return { type: 'coup', source: botId, target: tgt };
    }

    // Golpe se pode e tem apetite
    if (bot.coins >= 7 && Math.random() < tuning.aggression * 0.6) {
      const tgt = this.pickThreateningTarget(botId, state);
      if (tgt) return { type: 'coup', source: botId, target: tgt };
    }

    // Assassinato (3 moedas) — prefere se tem Assassin ou é agressivo/blefador
    if (bot.coins >= 3) {
      const wantKill = has('assassin') || Math.random() < tuning.bluffRate;
      if (wantKill && Math.random() < tuning.aggression) {
        const tgt = this.pickThreateningTarget(botId, state);
        if (tgt) return { type: 'assassinate', source: botId, target: tgt };
      }
    }

    // Taxa de Duque
    const wantsTax = has('duke') || Math.random() < tuning.bluffRate * 0.8;
    if (wantsTax && Math.random() < tuning.greed * 0.8) {
      return { type: 'tax', source: botId };
    }

    // Steal quando alvo tem moedas e tenho Captain ou vou blefar
    const stealTarget = this.pickStealTarget(botId, state);
    if (stealTarget) {
      const wantsSteal = has('captain') || Math.random() < tuning.bluffRate * 0.7;
      if (wantsSteal && Math.random() < 0.4 + tuning.aggression * 0.4) {
        return { type: 'steal', source: botId, target: stealTarget };
      }
    }

    // Exchange quando tenho Ambassador ou sou cauteloso
    if (has('ambassador') || Math.random() < tuning.bluffRate * 0.3) {
      if (Math.random() < 0.25) return { type: 'exchange', source: botId };
    }

    // Ajuda externa (seguro se alguém sem Duke)
    if (Math.random() < tuning.greed * 0.5) {
      return { type: 'foreign_aid', source: botId };
    }

    // Fallback: income garantido
    return { type: 'income', source: botId };
  }

  public decideResponse(
    botId: string
  ): { type: 'pass' | 'challenge' | 'block' | 'allow'; role?: Role } {
    updateMemoryFromState(this.engine, botId);
    const state = this.engine.getState();
    const action = state.currentAction;
    if (!action) return { type: 'pass' };

    const tuning = this.tuning(botId);
    const bot = state.players.find((p) => p.id === botId);
    const myRoles = bot?.cards.filter((c) => !c.isFlipped).map((c) => c.role) || [];

    const mem = getMemory(this.engine, botId);

    if (state.phase === 'block') {
      if (state.pendingBlock) {
        // Desafio ao bloqueio?
        const blockerId = state.pendingBlock.blockerId;
        const blockRole = state.pendingBlock.role;
        const oppMem = ensureOpp(mem, blockerId);
        // Se já sabemos que o blocker NÃO tem aquela role (já revelou outras 2), maior chance
        const knowsNot =
          oppMem.knownRoles.includes(blockRole) === false &&
          oppMem.knownRoles.length >= 1; // heurística fraca
        const provenHas = oppMem.provenRoles.includes(blockRole);
        if (provenHas) return { type: 'pass' };
        const base = tuning.challengeRate + (knowsNot ? 0.25 : 0);
        if (Math.random() < base) return { type: 'challenge' };
        return { type: 'pass' };
      }

      // Escolher se bloqueia
      const isTarget = action.target === botId;
      const canBlock =
        action.type === 'foreign_aid' ||
        (action.type === 'steal' && isTarget) ||
        (action.type === 'assassinate' && isTarget);

      if (!canBlock) return { type: 'pass' };

      // Se sou alvo de assassinato e tenho Condessa, sempre bloqueio
      if (action.type === 'assassinate' && myRoles.includes('contessa')) {
        return { type: 'block' };
      }
      // Se sou alvo de assassinato, alta prob. de blefar com Condessa
      if (action.type === 'assassinate') {
        if (Math.random() < 0.5 + tuning.bluffRate * 0.5) {
          return { type: 'block' };
        }
      }
      // Steal: bloquear com Captain ou Ambassador
      if (action.type === 'steal') {
        const hasCap = myRoles.includes('captain');
        const hasAmb = myRoles.includes('ambassador');
        if (hasCap || hasAmb) {
          return { type: 'block', role: hasCap ? 'captain' : 'ambassador' };
        }
        if (Math.random() < tuning.bluffRate) {
          return {
            type: 'block',
            role: Math.random() < 0.5 ? 'captain' : 'ambassador',
          };
        }
      }
      // Ajuda externa: bloquear com duke
      if (action.type === 'foreign_aid') {
        const hasDuke = myRoles.includes('duke');
        if (hasDuke && Math.random() < tuning.blockRate) {
          return { type: 'block' };
        }
        if (Math.random() < tuning.bluffRate * 0.8) {
          return { type: 'block' };
        }
      }
      return { type: 'pass' };
    }

    if (state.phase === 'challenge') {
      // Desafio à ação
      if (
        !['tax', 'steal', 'assassinate', 'exchange'].includes(action.type)
      ) {
        return { type: 'pass' };
      }
      const actorId = action.source;
      const claimRole: Role | null =
        action.type === 'tax'
          ? 'duke'
          : action.type === 'steal'
          ? 'captain'
          : action.type === 'assassinate'
          ? 'assassin'
          : action.type === 'exchange'
          ? 'ambassador'
          : null;
      if (!claimRole) return { type: 'pass' };

      const oppMem = ensureOpp(mem, actorId);
      const provenHas = oppMem.provenRoles.includes(claimRole);
      if (provenHas) return { type: 'pass' };

      // Conte quantas cópias dessa role já foram vistas/gastas publicamente
      const seen = state.players.reduce(
        (acc, p) =>
          acc +
          p.cards.filter((c) => c.isFlipped && c.role === claimRole).length,
        0
      );
      const myCopies = myRoles.filter((r) => r === claimRole).length;
      const totalCopies = 3;
      const remaining = totalCopies - seen - myCopies;
      // Se já foram vistas 2 e eu tenho 1 delas, remaining=0 → quase certo blefe
      let rate = tuning.challengeRate;
      if (remaining <= 0) rate += 0.5;
      else if (remaining === 1) rate += 0.15;

      // Ajuste pelo histórico: quem foi pego blefando muito = desafiável
      rate += Math.min(0.2, oppMem.bluffsCaught * 0.08);

      if (Math.random() < rate) return { type: 'challenge' };
      return { type: 'pass' };
    }

    return { type: 'pass' };
  }

  public decideExchange(
    _botId: string,
    currentRoles: Role[],
    exchangeRoles: Role[]
  ): Role[] {
    const all = [...currentRoles, ...exchangeRoles];
    // Prioriza manter: Duke, Captain, Contessa, Assassin (evita Ambassador duplicado)
    const priority: Role[] = ['duke', 'captain', 'contessa', 'assassin', 'ambassador'];
    const sorted = [...all].sort(
      (a, b) => priority.indexOf(a) - priority.indexOf(b)
    );
    return sorted.slice(0, currentRoles.length);
  }

  public decideCardToLose(botId: string): number {
    const state = this.engine.getState();
    const bot = state.players.find((p) => p.id === botId);
    if (!bot) return 0;

    // Sacrifica primeiro cartas "duplicadas" ou de menor valor estratégico
    const priority: Role[] = ['ambassador', 'contessa', 'assassin', 'captain', 'duke'];
    const alive = bot.cards
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.isFlipped);
    alive.sort(
      (a, b) => priority.indexOf(a.c.role) - priority.indexOf(b.c.role)
    );
    return alive[0]?.i ?? 0;
  }

  private pickThreateningTarget(
    botId: string,
    state: GameState
  ): string | undefined {
    const alive = state.players.filter(
      (p) => p.id !== botId && p.cards.some((c) => !c.isFlipped)
    );
    if (alive.length === 0) return undefined;
    // Prefere quem tem mais moedas ou 1 carta (finish off)
    alive.sort((a, b) => {
      const livesA = a.cards.filter((c) => !c.isFlipped).length;
      const livesB = b.cards.filter((c) => !c.isFlipped).length;
      if (livesA !== livesB) return livesA - livesB; // menos vidas primeiro
      return b.coins - a.coins;
    });
    return alive[0]?.id;
  }

  private pickStealTarget(
    botId: string,
    state: GameState
  ): string | undefined {
    const alive = state.players.filter(
      (p) =>
        p.id !== botId &&
        p.cards.some((c) => !c.isFlipped) &&
        p.coins >= 1
    );
    if (alive.length === 0) return undefined;
    alive.sort((a, b) => b.coins - a.coins);
    return alive[0]?.id;
  }
}
