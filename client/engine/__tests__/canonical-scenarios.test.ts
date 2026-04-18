import { describe, it, expect } from 'vitest';
import { CoupEngine } from '../CoupEngine';
import type { GameState, Role } from '../types';

describe('regra das 10 moedas (golpe obrigatório)', () => {
  it('rejeita renda com 10+ moedas e aceita golpe', () => {
    const e = new CoupEngine('t');
    e.addPlayer('human-1', 'H', false);
    e.addPlayer('b', 'B', true);
    e.startGame();
    const st0 = e.getState();
    const hi = st0.players.findIndex((p) => p.id === 'human-1');
    e.getState().turnIndex = hi;
    const human = e.getState().players.find((p) => p.id === 'human-1');
    expect(human).toBeDefined();
    human!.coins = 10;

    const bad = e.validateAction('human-1', { type: 'income', source: 'human-1' });
    expect(bad.ok).toBe(false);

    const good = e.validateAction('human-1', {
      type: 'coup',
      source: 'human-1',
      target: 'b',
    });
    expect(good.ok).toBe(true);
  });
});

describe('fase de desafio após ação desafiável', () => {
  it('entra em challenge após declarar taxa (duque)', () => {
    const e = new CoupEngine('t');
    e.addPlayer('human-1', 'H', false);
    e.addPlayer('b', 'B', true);
    e.startGame();
    e.getState().turnIndex = 0;
    expect(e.getCurrentPlayer().id).toBe('human-1');

    e.handleAction('human-1', { type: 'tax', source: 'human-1' });
    expect(e.getState().phase).toBe('challenge');
    expect(e.getState().currentAction?.type).toBe('tax');
  });
});

describe('bloqueio — ajuda externa', () => {
  it('passa para block e resolve após o oponente passar', () => {
    const e = new CoupEngine('t');
    e.addPlayer('human-1', 'H', false);
    e.addPlayer('b', 'B', true);
    e.startGame();
    e.getState().turnIndex = 0;

    e.handleAction('human-1', { type: 'foreign_aid', source: 'human-1' });
    expect(e.getState().phase).toBe('block');
    expect(e.getState().waitingForResponseIndex).toBe(1);

    e.handleResponse('b', 'pass');
    expect(e.getState().phase).toBe('action');
    const human = e.getState().players.find((p) => p.id === 'human-1');
    expect(human!.coins).toBeGreaterThanOrEqual(2);
  });
});

describe('embaixador — troca (estado exchanging)', () => {
  it('completa troca a partir de snapshot e avança o turno', () => {
    const deck: Role[] = Array.from({ length: 12 }, () => 'duke' as Role);
    const snapshot: GameState = {
      roomId: 't',
      players: [
        {
          id: 'human-1',
          name: 'H',
          isBot: false,
          coins: 2,
          cards: [
            { role: 'duke', isFlipped: false },
            { role: 'captain', isFlipped: false },
          ],
          deadCards: [],
          isConnected: true,
          isReady: true,
        },
        {
          id: 'b1',
          name: 'Bot',
          isBot: true,
          coins: 2,
          cards: [
            { role: 'assassin', isFlipped: false },
            { role: 'contessa', isFlipped: false },
          ],
          deadCards: [],
          isConnected: true,
          isReady: true,
          personality: 'balanced',
        },
      ],
      deck,
      turnIndex: 0,
      phase: 'exchanging',
      exchangingCards: ['ambassador', 'contessa'],
      logs: [],
      responses: {},
      waitingForResponseIndex: 0,
      responderCycleStartIndex: null,
    };

    const e = CoupEngine.hydrate(snapshot);
    e.handleExchangeChoice('human-1', ['duke', 'ambassador']);
    const st = e.getState();
    expect(st.phase).toBe('action');
    expect(st.exchangingCards).toBeUndefined();
  });
});
