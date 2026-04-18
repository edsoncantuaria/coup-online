import { describe, it, expect } from 'vitest';
import { CoupEngine } from '../CoupEngine';

describe('desafio à ação — blefe de taxa', () => {
  it('ator sem duque perde influência quando desafiado', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    const p0 = e.getState().players.find((p) => p.id === 'p0')!;
    p0.cards = [
      { role: 'captain', isFlipped: false },
      { role: 'assassin', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'tax', source: 'p0' });
    expect(e.getState().phase).toBe('challenge');

    e.handleResponse('p1', 'challenge');
    expect(e.getState().phase).toBe('losing_influence');
    expect(e.getState().losingInfluenceId).toBe('p0');
  });
});

describe('desafio à ação — duque provado', () => {
  it('desafiante perde carta quando o ator tem duque', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    const p0 = e.getState().players.find((p) => p.id === 'p0')!;
    p0.cards = [
      { role: 'duke', isFlipped: false },
      { role: 'captain', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'tax', source: 'p0' });
    e.handleResponse('p1', 'challenge');
    expect(e.getState().phase).toBe('losing_influence');
    expect(e.getState().losingInfluenceId).toBe('p1');
    expect(e.getState().lastReveal?.verdict).toBe('proven');
  });
});

describe('bloqueio após roubo — alvo bloqueia', () => {
  it('bloqueio como capitão encerra a ação se ninguém desafia o bloqueio', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p0')!.coins = 5;
    e.getState().players.find((p) => p.id === 'p1')!.coins = 3;

    e.handleAction('p0', { type: 'steal', source: 'p0', target: 'p1' });
    expect(e.getState().phase).toBe('challenge');
    e.handleResponse('p1', 'pass');

    expect(e.getState().phase).toBe('block');
    expect(e.getState().waitingForResponseIndex).toBe(1);

    e.handleResponse('p1', 'block', 'captain');
    expect(e.getState().pendingBlock).toBeDefined();
    expect(e.getState().pendingBlock?.role).toBe('captain');

    e.handleResponse('p0', 'pass');
    const st = e.getState();
    expect(st.phase).toBe('action');
    expect(st.currentAction).toBeNull();
    const c0 = e.getState().players.find((p) => p.id === 'p0')!.coins;
    const c1 = e.getState().players.find((p) => p.id === 'p1')!.coins;
    expect(c0).toBe(5);
    expect(c1).toBe(3);
  });
});

describe('golpe e fim de jogo', () => {
  it('declara vencedor quando resta um jogador com influência', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p0')!.coins = 10;
    const p1 = e.getState().players.find((p) => p.id === 'p1')!;
    p1.cards = [
      { role: 'duke', isFlipped: true },
      { role: 'captain', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'coup', source: 'p0', target: 'p1' });
    expect(e.getState().phase).toBe('game_over');
    expect(e.getState().winner).toBe('p0');
  });
});
