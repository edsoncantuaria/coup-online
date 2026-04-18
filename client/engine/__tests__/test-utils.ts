import { vi } from 'vitest';
import { CoupEngine } from '../CoupEngine';
import type { Action, GameState, Player, Role } from '../types';

/** PRNG determinístico (mulberry32). */
export function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixa `Math.random` para reprodutibilidade (baralho, turno inicial, embaralhos do motor). */
export function withRandomSeed<T>(seed: number, fn: () => T): T {
  const rng = mulberry32(seed);
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => rng());
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

export function listLegalActions(e: CoupEngine): Action[] {
  const st = e.getState();
  if (st.phase !== 'action') return [];
  const pid = e.getCurrentPlayer().id;
  const others = st.players.filter(
    (p) => p.id !== pid && p.cards.some((c) => !c.isFlipped)
  );
  const out: Action[] = [];
  const tryPush = (a: Action) => {
    const v = e.validateAction(pid, a);
    if (v.ok) out.push(a);
  };

  tryPush({ type: 'income', source: pid });
  tryPush({ type: 'foreign_aid', source: pid });
  tryPush({ type: 'tax', source: pid });
  tryPush({ type: 'exchange', source: pid });

  for (const t of others) {
    tryPush({ type: 'steal', source: pid, target: t.id });
  }
  for (const t of others) {
    tryPush({ type: 'assassinate', source: pid, target: t.id });
    tryPush({ type: 'coup', source: pid, target: t.id });
  }

  return out;
}

/** Embaralha pool e escolhe as primeiras `k` cartas como papel mantido na troca. */
export function randomExchangeChoice(
  e: CoupEngine,
  rng: () => number
): void {
  const st = e.getState();
  if (st.phase !== 'exchanging' || !st.exchangingCards) return;
  const idx = st.waitingForResponseIndex;
  if (idx === null) return;
  const pid = st.players[idx]?.id;
  if (!pid) return;

  const alive = st.players[idx].cards.filter((c) => !c.isFlipped).map((c) => c.role);
  const pool = [...alive, ...st.exchangingCards];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  const kept = shuffled.slice(0, alive.length);
  e.handleExchangeChoice(pid, kept);
}

/** Um passo de automação: resolve escolha obrigatória ou aplica uma ação/resposta aleatória. */
export function driveSimulationStep(e: CoupEngine, rng: () => number): void {
  const st = e.getState();
  if (st.phase === 'game_over') return;

  if (st.phase === 'losing_influence' && st.losingInfluenceId) {
    const pl = st.players.find((p) => p.id === st.losingInfluenceId);
    const card = pl?.cards.find((c) => !c.isFlipped);
    if (card) e.handleFlip(st.losingInfluenceId, card.role);
    return;
  }

  if (st.phase === 'exchanging') {
    randomExchangeChoice(e, rng);
    return;
  }

  if (st.phase === 'challenge' || st.phase === 'block') {
    if (st.waitingForResponseIndex !== null) {
      const rid = st.players[st.waitingForResponseIndex]!.id;
      e.handleResponse(rid, 'pass');
    }
    return;
  }

  if (st.phase === 'action') {
    const legal = listLegalActions(e);
    if (legal.length === 0) {
      throw new Error(
        `driveSimulationStep: nenhuma ação legal (turno ${e.getCurrentPlayer().id})`
      );
    }
    const action = legal[Math.floor(rng() * legal.length)]!;
    e.handleAction(e.getCurrentPlayer().id, action);
  }
}

export function runSimulation(opts: {
  seed: number;
  maxSteps?: number;
  playerCount?: number;
}): { engine: CoupEngine; steps: number } {
  const maxSteps = opts.maxSteps ?? 1000;
  const playerCount = opts.playerCount ?? 4;
  const rng = mulberry32(opts.seed * 7919 + 42);
  const e = new CoupEngine('sim');
  for (let i = 0; i < playerCount; i++) {
    e.addPlayer(`p${i}`, `P${i}`, true);
  }
  e.startGame();
  let steps = 0;
  while (e.getState().phase !== 'game_over' && steps < maxSteps) {
    driveSimulationStep(e, rng);
    steps++;
  }
  return { engine: e, steps };
}

/** Estado mínimo para testes pontuais com `CoupEngine.hydrate`. */
export function minimalSnapshot(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    roomId: 't',
    players: [],
    deck: [],
    turnIndex: 0,
    phase: 'action',
    logs: [],
    responses: {},
    waitingForResponseIndex: null,
    responderCycleStartIndex: null,
    ...overrides,
  };
  return JSON.parse(JSON.stringify(base)) as GameState;
}

export function playerStub(
  id: string,
  coins: number,
  cards: { role: Role; isFlipped?: boolean }[]
): Player {
  return {
    id,
    name: id,
    isBot: true,
    coins,
    cards: cards.map((c) => ({ role: c.role, isFlipped: c.isFlipped ?? false })),
    deadCards: [],
    isConnected: true,
    isReady: true,
    personality: 'balanced',
  };
}
