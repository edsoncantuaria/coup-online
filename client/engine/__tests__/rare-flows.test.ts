import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CoupEngine } from '../CoupEngine';
import { emptyPlayerStats, type Role } from '../types';
import { minimalSnapshot, playerStub, withRandomSeed } from './test-utils';

/** Acesso aos ramos defensivos que o fluxo público não costuma atingir. */
function callPrivateEngine(
  e: CoupEngine,
  method: 'openBlockPhaseForTarget' | 'reopenBlockPhaseEveryone'
): void {
  const fn = (
    CoupEngine.prototype as unknown as Record<
      string,
      (this: CoupEngine) => void
    >
  )[method];
  fn.call(e);
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openBlockPhaseForTarget — após desafiante perder contra ação legítima', () => {
  it('assassinato: desafiante escolhe carta e o alvo entra em fase de bloqueio (Condessa)', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.addPlayer('p2', 'P2', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p0')!.coins = 5;
    e.getState().players.find((p) => p.id === 'p0')!.cards = [
      { role: 'assassin', isFlipped: false },
      { role: 'duke', isFlipped: false },
    ];
    e.getState().players.find((p) => p.id === 'p1')!.cards = [
      { role: 'captain', isFlipped: false },
      { role: 'captain', isFlipped: false },
    ];
    e.getState().players.find((p) => p.id === 'p2')!.cards = [
      { role: 'captain', isFlipped: false },
      { role: 'captain', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'assassinate', source: 'p0', target: 'p1' });
    expect(e.getState().phase).toBe('challenge');
    e.handleResponse('p1', 'challenge');

    expect(e.getState().phase).toBe('losing_influence');
    expect(e.getState().pendingResolution?.type).toBe('allow_block');

    e.handleFlip('p1', 'captain');
    const st = e.getState();
    expect(st.phase).toBe('block');
    expect(st.currentAction?.type).toBe('assassinate');
    expect(st.pendingBlock).toBeUndefined();
    expect(st.waitingForResponseIndex).toBe(1);

    e.handleResponse('p1', 'pass');
    expect(e.getState().phase).toBe('action');
    expect(
      e.getState().players.find((p) => p.id === 'p1')!.cards.every((c) => c.isFlipped)
    ).toBe(true);
  });

  it('extorsão: desafiante perde e o alvo pode bloquear com Capitão/Embaixador', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p0')!.coins = 5;
    e.getState().players.find((p) => p.id === 'p1')!.coins = 3;
    e.getState().players.find((p) => p.id === 'p0')!.cards = [
      { role: 'captain', isFlipped: false },
      { role: 'duke', isFlipped: false },
    ];
    e.getState().players.find((p) => p.id === 'p1')!.cards = [
      { role: 'contessa', isFlipped: false },
      { role: 'ambassador', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'steal', source: 'p0', target: 'p1' });
    e.handleResponse('p1', 'challenge');
    expect(e.getState().pendingResolution?.type).toBe('allow_block');

    e.handleFlip('p1', 'contessa');
    expect(e.getState().phase).toBe('block');
    expect(e.getState().currentAction?.type).toBe('steal');
    e.handleResponse('p1', 'block', 'ambassador');
    expect(e.getState().pendingBlock?.role).toBe('ambassador');
  });
});

describe('openBlockPhaseForTarget — alvo eliminado no desafio (ação cancelada)', () => {
  it('roubo: alvo com 1 influência perde o desafio e some — golpe de roubo não resolve', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.addPlayer('p2', 'P2', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p0')!.coins = 5;
    e.getState().players.find((p) => p.id === 'p1')!.coins = 3;
    e.getState().players.find((p) => p.id === 'p0')!.cards = [
      { role: 'captain', isFlipped: false },
      { role: 'captain', isFlipped: false },
    ];
    e.getState().players.find((p) => p.id === 'p1')!.cards = [
      { role: 'duke', isFlipped: true },
      { role: 'contessa', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'steal', source: 'p0', target: 'p1' });
    expect(e.getState().phase).toBe('challenge');
    e.handleResponse('p1', 'challenge');

    const st = e.getState();
    expect(st.phase).toBe('action');
    expect(st.currentAction).toBeNull();
    const p1 = e.getState().players.find((p) => p.id === 'p1')!;
    expect(p1.cards.every((c) => c.isFlipped)).toBe(true);
    expect(e.getState().players.find((p) => p.id === 'p0')!.coins).toBe(5);
    expect(e.getState().players.find((p) => p.id === 'p1')!.coins).toBe(3);
  });
});

describe('reopenBlockPhaseEveryone — blefe de Duque na ajuda externa', () => {
  it('após blefe ser revelado, outros podem voltar a tentar bloquear a mesma ajuda externa', () => {
    withRandomSeed(2026, () => {
      const e = new CoupEngine('t');
      e.addPlayer('p0', 'P0', true);
      e.addPlayer('p1', 'P1', true);
      e.addPlayer('p2', 'P2', true);
      e.startGame();
      e.getState().turnIndex = 0;
      e.getState().players.find((p) => p.id === 'p1')!.cards = [
        { role: 'captain', isFlipped: false },
        { role: 'captain', isFlipped: false },
      ];

      e.handleAction('p0', { type: 'foreign_aid', source: 'p0' });
      expect(e.getState().phase).toBe('block');
      e.handleResponse('p1', 'block', 'duke');
      expect(e.getState().pendingBlock).toBeDefined();

      e.handleResponse('p2', 'challenge');
      expect(e.getState().phase).toBe('losing_influence');
      expect(e.getState().pendingResolution?.type).toBe('reopen_block');

      e.handleFlip('p1', 'captain');

      const st = e.getState();
      expect(st.phase).toBe('block');
      expect(st.currentAction?.type).toBe('foreign_aid');
      expect(st.pendingBlock).toBeUndefined();
      expect(st.matchStats?.perPlayer['p1']?.blocksFailed).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('desafio ao bloqueio — bloqueador prova a carta', () => {
  it('desafiante perde quando o bloqueio com Duque é legítimo (ajuda externa)', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p1')!.cards = [
      { role: 'duke', isFlipped: false },
      { role: 'captain', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'foreign_aid', source: 'p0' });
    e.handleResponse('p1', 'block', 'duke');
    e.handleResponse('p0', 'challenge');

    expect(e.getState().phase).toBe('losing_influence');
    expect(e.getState().losingInfluenceId).toBe('p0');
    expect(e.getState().lastReveal?.verdict).toBe('proven');
  });
});

describe('resolveAction — ramos defensivos sem alvo', () => {
  it('golpe e assassinato sem alvo apenas chamam nextTurn', () => {
    const snap = minimalSnapshot({
      players: [
        playerStub('p0', 10, [
          { role: 'captain' },
          { role: 'duke' },
        ]),
        playerStub('p1', 2, [
          { role: 'captain' },
          { role: 'duke' },
        ]),
      ],
      deck: ['duke', 'duke'] as Role[],
      turnIndex: 0,
      phase: 'action',
    });
    snap.currentAction = { type: 'coup', source: 'p0' };
    const e1 = CoupEngine.hydrate(snap);
    e1.resolveAction();
    expect(e1.getState().phase).toBe('action');

    const snap2 = minimalSnapshot({
      players: [
        playerStub('p0', 5, [
          { role: 'assassin' },
          { role: 'duke' },
        ]),
        playerStub('p1', 2, [
          { role: 'captain' },
          { role: 'duke' },
        ]),
      ],
      deck: ['duke', 'duke'] as Role[],
      turnIndex: 0,
      phase: 'action',
    });
    snap2.currentAction = { type: 'assassinate', source: 'p0' };
    const e2 = CoupEngine.hydrate(snap2);
    e2.resolveAction();
    expect(e2.getState().phase).toBe('action');
  });
});

describe('troca — deck vazio e validação de escolha', () => {
  it('exchange com deck vazio: não entra em exchanging e passa o turno', () => {
    const snap = minimalSnapshot({
      players: [
        playerStub('p0', 2, [
          { role: 'ambassador' },
          { role: 'duke' },
        ]),
        playerStub('p1', 2, [
          { role: 'captain' },
          { role: 'captain' },
        ]),
      ],
      deck: [],
      turnIndex: 0,
      phase: 'action',
      matchStats: {
        startedAt: 0,
        round: 1,
        perPlayer: {
          p0: emptyPlayerStats(),
          p1: emptyPlayerStats(),
        },
      },
    });
    snap.currentAction = { type: 'exchange', source: 'p0' };
    const e = CoupEngine.hydrate(snap);
    e.resolveAction();
    expect(e.getState().exchangingCards).toBeUndefined();
    expect(e.getState().phase).toBe('action');
  });

  it('handleExchangeChoice rejeita contagem errada e papel inexistente no pool', () => {
    const e = CoupEngine.hydrate(
      minimalSnapshot({
        players: [
          playerStub('p0', 2, [
            { role: 'ambassador' },
            { role: 'duke' },
          ]),
        ],
        deck: [],
        turnIndex: 0,
        phase: 'exchanging',
        exchangingCards: ['captain', 'contessa'],
        waitingForResponseIndex: 0,
      })
    );
    e.handleExchangeChoice('p0', ['ambassador']);
    expect(e.getState().phase).toBe('exchanging');

    e.handleExchangeChoice('p0', ['ambassador', 'duke', 'contessa']);
    expect(e.getState().phase).toBe('exchanging');

    e.handleExchangeChoice('p0', ['ambassador', 'assassin']);
    expect(e.getState().phase).toBe('exchanging');
  });
});

describe('bloqueio de roubo — blefe no capitão desafiado', () => {
  it('bloqueio falso deixa o roubo resolver após o desafio', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p0')!.coins = 5;
    e.getState().players.find((p) => p.id === 'p1')!.coins = 4;
    e.getState().players.find((p) => p.id === 'p0')!.cards = [
      { role: 'captain', isFlipped: false },
      { role: 'duke', isFlipped: false },
    ];
    e.getState().players.find((p) => p.id === 'p1')!.cards = [
      { role: 'contessa', isFlipped: false },
      { role: 'contessa', isFlipped: false },
    ];

    e.handleAction('p0', { type: 'steal', source: 'p0', target: 'p1' });
    e.handleResponse('p1', 'pass');
    e.handleResponse('p1', 'block', 'captain');
    e.handleResponse('p0', 'challenge');

    expect(e.getState().phase).toBe('losing_influence');
    expect(e.getState().losingInfluenceId).toBe('p1');

    e.handleFlip('p1', 'contessa');
    expect(e.getState().phase).toBe('action');
    expect(e.getState().players.find((p) => p.id === 'p0')!.coins).toBeGreaterThan(5);
    expect(e.getState().players.find((p) => p.id === 'p1')!.coins).toBeLessThan(4);
  });
});

describe('handleFlip — rejeição silenciosa', () => {
  it('ignora fora da fase losing_influence', () => {
    const e = new CoupEngine('t');
    e.addPlayer('a', 'A', false);
    e.addPlayer('b', 'B', false);
    e.startGame();
    e.handleFlip('a', 'duke');
    expect(e.getState().phase).not.toBe('losing_influence');
  });

  it('não altera a mão quando o papel não existe ou já está virado', () => {
    const e = CoupEngine.hydrate(
      minimalSnapshot({
        players: [
          playerStub('p0', 2, [
            { role: 'captain', isFlipped: false },
            { role: 'duke', isFlipped: false },
          ]),
        ],
        deck: [],
        turnIndex: 0,
        phase: 'losing_influence',
        losingInfluenceId: 'p0',
        waitingForResponseIndex: 0,
      })
    );
    e.handleFlip('p0', 'assassin');
    expect(e.getState().phase).toBe('losing_influence');
    expect(
      e.getState().players[0]!.cards.filter((c) => !c.isFlipped).length
    ).toBe(2);
  });
});

describe('defensivo — ramos de segurança nos helpers privados', () => {
  it('openBlockPhaseForTarget sem alvo cai em resolveAction', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().players.find((p) => p.id === 'p0')!.coins = 5;
    e.getState().currentAction = { type: 'assassinate', source: 'p0' };
    callPrivateEngine(e, 'openBlockPhaseForTarget');
    expect(e.getState().currentAction).toBeNull();
  });

  it('reopenBlockPhaseEveryone sem ação atual apenas passa o turno', () => {
    const e = new CoupEngine('t');
    e.addPlayer('p0', 'P0', true);
    e.addPlayer('p1', 'P1', true);
    e.startGame();
    e.getState().turnIndex = 0;
    e.getState().currentAction = undefined;
    callPrivateEngine(e, 'reopenBlockPhaseEveryone');
    expect(e.getState().phase).toBe('action');
  });
});

