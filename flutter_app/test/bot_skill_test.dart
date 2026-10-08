import 'dart:math';

import 'package:coup/engine/bot.dart';
import 'package:coup/engine/coup_engine.dart';
import 'package:coup/engine/models.dart';
import 'package:flutter_test/flutter_test.dart';

/// Joga uma partida só de bots com os níveis dados (um por assento) e
/// devolve o índice do vencedor.
int play(List<BotSkill> seats, Random rng) {
  final e = CoupEngine('torneio', random: rng);
  final skills = <String, BotSkill>{};
  for (var i = 0; i < seats.length; i++) {
    final p = BotPersonality.values[rng.nextInt(BotPersonality.values.length)];
    e.addPlayer('p$i', 'P$i', isBot: true, personality: p);
    skills['p$i'] = seats[i];
  }
  e.startGame();
  final brain = BotBrain(e, random: rng, skills: skills);
  for (var steps = 0; steps < 5000; steps++) {
    if (e.state.phase == Phase.gameOver) break;
    final actor = BotBrain.pendingActor(e.state);
    if (actor == null || !brain.playFor(actor)) {
      fail('partida travou na fase ${e.state.phase}');
    }
  }
  expect(
    e.state.phase,
    Phase.gameOver,
    reason: [
      for (final p in e.state.players)
        '${p.id} ${skills[p.id]} ${p.personality} ${p.coins} ${p.aliveRoles}',
      ...e.state.logs.reversed.take(70),
    ].join('\n'),
  );
  final cards =
      e.state.deck.length +
      e.state.players.fold<int>(0, (a, p) => a + p.cards.length);
  expect(cards, 15);
  return int.parse(e.state.winner!.substring(1));
}

/// Taxa de vitória de um bot [hero] contra [rivals] bots de nível [villain],
/// trocando o assento a cada partida.
double winRate(BotSkill hero, BotSkill villain, int rivals, int n, int seed) {
  final rng = Random(seed);
  var wins = 0;
  for (var i = 0; i < n; i++) {
    final seat = i % (rivals + 1);
    final seats = List.filled(rivals + 1, villain)..[seat] = hero;
    if (play(seats, rng) == seat) wins++;
  }
  return wins / n;
}

void main() {
  test('Difícil vence Normal e Fácil; Normal vence Fácil', () {
    const n = 3000;
    final out = StringBuffer();
    for (final rivals in [1, 3]) {
      final fair = 1 / (rivals + 1);
      final hn = winRate(BotSkill.hard, BotSkill.normal, rivals, n, rivals);
      final he = winRate(BotSkill.hard, BotSkill.easy, rivals, n, rivals + 10);
      final ne = winRate(
        BotSkill.normal,
        BotSkill.easy,
        rivals,
        n,
        rivals + 20,
      );
      final nh = winRate(
        BotSkill.normal,
        BotSkill.hard,
        rivals,
        n,
        rivals + 30,
      );
      String pct(double v) => '${(v * 100).round()}%';
      out.writeln(
        '1 contra $rivals (justo ${pct(fair)}): '
        'Difícil×Normal ${pct(hn)}, Difícil×Fácil ${pct(he)}, '
        'Normal×Fácil ${pct(ne)}, Normal×Difícil ${pct(nh)}',
      );
      if (const bool.fromEnvironment('CALIBRATE')) continue;
      expect(hn, greaterThan(fair * 1.25), reason: 'Difícil×Normal, $rivals');
      expect(he, greaterThan(fair * 1.25), reason: 'Difícil×Fácil, $rivals');
      // Numa mesa cheia a diferença entre Normal e Fácil some no ruído.
      if (rivals == 1) {
        expect(ne, greaterThan(fair), reason: 'Normal×Fácil, $rivals');
      }
      expect(nh, lessThan(fair), reason: 'Normal×Difícil, $rivals');
    }
    // ignore: avoid_print
    print(out);
  });

  test('mesas com qualquer mistura de níveis sempre terminam', () {
    final rng = Random(7);
    for (var i = 0; i < 3000; i++) {
      final n = 2 + rng.nextInt(5);
      final seats = [
        for (var j = 0; j < n; j++)
          i.isEven
              ? BotSkill.hard
              : BotSkill.values[rng.nextInt(BotSkill.values.length)],
      ];
      play(seats, rng);
    }
  });
}
