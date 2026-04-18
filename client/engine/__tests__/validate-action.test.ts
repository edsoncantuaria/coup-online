import { describe, it, expect } from 'vitest';
import { CoupEngine } from '../CoupEngine';

function setupTwoHumans() {
  const e = new CoupEngine('t');
  e.addPlayer('a', 'A', false);
  e.addPlayer('b', 'B', false);
  e.startGame();
  e.getState().turnIndex = 0;
  return e;
}

describe('validateAction — fase e turno', () => {
  it('rejeita fora da fase action', () => {
    const e = setupTwoHumans();
    e.getState().phase = 'challenge';
    const r = e.validateAction('a', { type: 'income', source: 'a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/fase/i);
  });

  it('rejeita quando não é o jogador da vez', () => {
    const e = setupTwoHumans();
    expect(e.getCurrentPlayer().id).toBe('a');
    const r = e.validateAction('b', { type: 'income', source: 'b' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/turno/i);
  });

  it('rejeita jogador eliminado', () => {
    const e = setupTwoHumans();
    const pa = e.getState().players.find((p) => p.id === 'a')!;
    pa.cards.forEach((c) => {
      c.isFlipped = true;
    });
    const r = e.validateAction('a', { type: 'income', source: 'a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/eliminad/i);
  });
});

describe('validateAction — regra das 10 moedas', () => {
  it('rejeita qualquer ação que não seja golpe com 10+ moedas', () => {
    const e = setupTwoHumans();
    const human = e.getState().players.find((p) => p.id === 'a')!;
    human.coins = 10;
    expect(e.validateAction('a', { type: 'income', source: 'a' }).ok).toBe(false);
    expect(e.validateAction('a', { type: 'tax', source: 'a' }).ok).toBe(false);
    expect(
      e.validateAction('a', { type: 'coup', source: 'a', target: 'b' }).ok
    ).toBe(true);
  });
});

describe('validateAction — custos', () => {
  it('rejeita golpe com menos de 7 moedas', () => {
    const e = setupTwoHumans();
    e.getState().players.find((p) => p.id === 'a')!.coins = 6;
    const r = e.validateAction('a', {
      type: 'coup',
      source: 'a',
      target: 'b',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/7/);
  });

  it('rejeita assassinato com menos de 3 moedas', () => {
    const e = setupTwoHumans();
    e.getState().players.find((p) => p.id === 'a')!.coins = 2;
    const r = e.validateAction('a', {
      type: 'assassinate',
      source: 'a',
      target: 'b',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/3/);
  });
});

describe('validateAction — alvos', () => {
  it('exige alvo em roubo, assassinato e golpe', () => {
    const e = setupTwoHumans();
    expect(
      e.validateAction('a', { type: 'steal', source: 'a' } as never).ok
    ).toBe(false);
    expect(
      e.validateAction('a', { type: 'assassinate', source: 'a' }).ok
    ).toBe(false);
    expect(e.validateAction('a', { type: 'coup', source: 'a' }).ok).toBe(false);
  });

  it('proíbe alvo em renda, ajuda externa, taxa e troca', () => {
    const e = setupTwoHumans();
    for (const type of ['income', 'foreign_aid', 'tax', 'exchange'] as const) {
      const r = e.validateAction('a', {
        type,
        source: 'a',
        target: 'b',
      });
      expect(r.ok).toBe(false);
    }
  });

  it('proíbe escolher a si mesmo como alvo', () => {
    const e = setupTwoHumans();
    const r = e.validateAction('a', {
      type: 'steal',
      source: 'a',
      target: 'a',
    });
    expect(r.ok).toBe(false);
  });

  it('rejeita alvo inexistente ou eliminado', () => {
    const e = setupTwoHumans();
    expect(
      e.validateAction('a', {
        type: 'coup',
        source: 'a',
        target: 'ghost',
      }).ok
    ).toBe(false);
    e.getState().players.find((p) => p.id === 'b')!.cards.forEach((c) => {
      c.isFlipped = true;
    });
    expect(
      e.validateAction('a', { type: 'coup', source: 'a', target: 'b' }).ok
    ).toBe(false);
  });

  it('rejeita roubo quando o alvo não tem moedas', () => {
    const e = setupTwoHumans();
    e.getState().players.find((p) => p.id === 'b')!.coins = 0;
    const r = e.validateAction('a', {
      type: 'steal',
      source: 'a',
      target: 'b',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/moedas/i);
  });
});

describe('validateAction — tipo de ação', () => {
  it('rejeita tipo desconhecido', () => {
    const e = setupTwoHumans();
    const r = e.validateAction('a', {
      type: 'invalid_action' as 'income',
      source: 'a',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/desconhecida/i);
  });
});

describe('validateAction — casos válidos', () => {
  it('aceita renda e taxa no turno correto', () => {
    const e = setupTwoHumans();
    expect(e.validateAction('a', { type: 'income', source: 'a' }).ok).toBe(
      true
    );
    expect(e.validateAction('a', { type: 'tax', source: 'a' }).ok).toBe(true);
  });
});
