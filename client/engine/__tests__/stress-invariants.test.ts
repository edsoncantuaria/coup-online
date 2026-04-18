import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CoupEngine } from '../CoupEngine';
import {
  runSimulation,
  withRandomSeed,
  listLegalActions,
  driveSimulationStep,
  mulberry32,
} from './test-utils';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function assertEngineInvariants(e: CoupEngine): void {
  const st = e.getState();
  for (const p of st.players) {
    expect(p.coins).toBeGreaterThanOrEqual(0);
    expect(p.cards.length).toBeGreaterThanOrEqual(0);
  }
  const alive = st.players.filter((p) => p.cards.some((c) => !c.isFlipped));
  if (st.phase === 'game_over') {
    expect(alive.length).toBeLessThanOrEqual(1);
    if (st.winner) {
      expect(alive.some((x) => x.id === st.winner)).toBe(true);
    }
  }
}

describe('stress — simulação aleatória determinística', () => {
  it('completa partidas com 3–5 bots em várias sementes sem travar', () => {
    const maxSteps = 4000;
    for (const seed of [1, 2, 3, 7, 13, 42, 99, 123, 256, 512]) {
      for (const playerCount of [3, 4, 5]) {
        const { engine, steps } = withRandomSeed(seed, () =>
          runSimulation({ seed, maxSteps, playerCount })
        );
        expect(steps).toBeLessThan(maxSteps);
        expect(engine.getState().phase).toBe('game_over');
        assertEngineInvariants(engine);
      }
    }
  });
});

describe('stress — passos legais', () => {
  it('listLegalActions nunca fica vazio na fase action com jogadores vivos', () => {
    withRandomSeed(7, () => {
      const e = new CoupEngine('x');
      e.addPlayer('a', 'A', true);
      e.addPlayer('b', 'B', true);
      e.startGame();
      let guard = 0;
      while (e.getState().phase !== 'game_over' && guard++ < 500) {
        const st = e.getState();
        if (st.phase === 'action') {
          expect(listLegalActions(e).length).toBeGreaterThan(0);
        }
        driveSimulationStep(e, mulberry32(guard + 99));
      }
    });
  });
});
