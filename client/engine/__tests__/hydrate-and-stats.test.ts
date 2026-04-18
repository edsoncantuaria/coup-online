import { describe, it, expect } from 'vitest';
import { CoupEngine } from '../CoupEngine';
import { minimalSnapshot, playerStub } from './test-utils';
import type { Role } from '../types';

describe('CoupEngine.hydrate', () => {
  it('reidrata estado e permite continuar a partida', () => {
    const deck: Role[] = Array(12).fill('duke') as Role[];
    const snap = minimalSnapshot({
      players: [
        playerStub('x', 2, [
          { role: 'ambassador' },
          { role: 'contessa' },
        ]),
        playerStub('y', 2, [
          { role: 'assassin' },
          { role: 'duke' },
        ]),
      ],
      deck,
      turnIndex: 0,
      phase: 'action',
    });
    const e = CoupEngine.hydrate(snap);
    expect(e.getState().roomId).toBe('t');
    expect(e.validateAction('x', { type: 'income', source: 'x' }).ok).toBe(true);
  });
});

describe('matchStats', () => {
  it('incrementa ações e moedas após renda', () => {
    const e = new CoupEngine('t');
    e.addPlayer('a', 'A', false);
    e.addPlayer('b', 'B', false);
    e.startGame();
    e.getState().turnIndex = 0;
    const before = e.getState().matchStats?.perPlayer['a']?.actionsTaken ?? 0;
    e.handleAction('a', { type: 'income', source: 'a' });
    expect(e.getState().matchStats?.perPlayer['a']?.actionsTaken).toBe(
      before + 1
    );
    expect(e.getState().matchStats?.perPlayer['a']?.coinsGained).toBeGreaterThan(
      0
    );
  });
});
