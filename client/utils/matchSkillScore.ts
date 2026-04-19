/**
 * Pontuação de performance da partida (local).
 * Mesma fórmula usada para MVP e para base de ranking futuro — manter estável.
 */
export function computeMatchSkillScore(s: {
  actionsTaken?: number;
  challengesWon?: number;
  bluffsCaught?: number;
  blocksSuccess?: number;
  bluffsSurvived?: number;
  coinsGained?: number;
  coinsLost?: number;
  cardsLost?: number;
}): number {
  return (
    (s.actionsTaken || 0) * 1 +
    (s.challengesWon || 0) * 4 +
    (s.bluffsCaught || 0) * 4 +
    (s.blocksSuccess || 0) * 3 +
    (s.bluffsSurvived || 0) * 2 +
    (s.coinsGained || 0) * 0.3 -
    (s.coinsLost || 0) * 0.15 -
    (s.cardsLost || 0) * 5
  );
}
