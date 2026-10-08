import 'dart:math';

import 'package:coup/campaign/campaign.dart';
import 'package:coup/engine/bot.dart';
import 'package:coup/engine/coup_engine.dart';
import 'package:coup/engine/models.dart';
import 'package:flutter_test/flutter_test.dart';

/// Joga uma partida inteira com a IA no lugar do humano. Retorna se o
/// humano venceu.
bool simulate(MatchSetup setup, Random rng) {
  final e = CoupEngine('sim', random: rng)..rules = setup.rules;
  e.addPlayer(campaignHumanId, 'Humano');
  for (var i = 0; i < setup.botCount; i++) {
    e.addPlayer(
      'bot-$i',
      'Bot $i',
      isBot: true,
      personality: setup.personalities[i],
    );
  }
  e.startGame();
  // O humano é simulado pelo bot Normal; os rivais jogam no nível da corte.
  final brain = BotBrain(
    e,
    random: rng,
    skills: {
      for (var i = 0; i < setup.botCount; i++) 'bot-$i': setup.skills[i],
    },
  );
  for (var steps = 0; steps < 5000; steps++) {
    if (e.state.phase == Phase.gameOver) break;
    final actor = BotBrain.pendingActor(e.state);
    if (actor == null || !brain.playFor(actor)) {
      fail('partida travou na fase ${e.state.phase}');
    }
  }
  expect(e.state.phase, Phase.gameOver);
  // Conservação: as 15 cartas estão no baralho ou na mão de alguém.
  final cards =
      e.state.deck.length +
      e.state.players.fold<int>(0, (a, p) => a + p.cards.length);
  expect(cards, 15);
  return e.state.winner == campaignHumanId;
}

double rate(MatchSetup Function(Random) make, int n, int seed) {
  final rng = Random(seed);
  var wins = 0;
  for (var i = 0; i < n; i++) {
    if (simulate(make(rng), rng)) wins++;
  }
  return wins / n;
}

void main() {
  test('toda punição continua vencível em cada corte', () {
    const n = 400;
    final out = StringBuffer();
    for (var court = 0; court < courts.length; court++) {
      CampaignRun runWith(List<CurseId> c) =>
          CampaignRun(seed: 1, court: court, curses: c);
      final base = rate((r) => MatchSetup.forRun(runWith([]), r), n, court);
      out.writeln(
        'Corte ${court + 1} (${courts[court].bots} rivais): base ${(base * 100).round()}%',
      );
      for (final curse in curseInfo.values) {
        if (court < curse.fromCourt || court > curse.untilCourt) continue;
        final r = rate(
          (rng) => MatchSetup.forRun(runWith([curse.id]), rng),
          n,
          court * 100 + curse.id.index,
        );
        out.writeln('   ${curse.name.padRight(22)} ${(r * 100).round()}%');
        // Difícil, mas nunca impossível.
        if (const bool.fromEnvironment('CALIBRATE')) continue;
        expect(
          r,
          greaterThan(base * 0.4),
          reason: '${curse.name} na corte ${court + 1}',
        );
        expect(
          r,
          greaterThan(0.06),
          reason: '${curse.name} na corte ${court + 1}',
        );
      }
    }
    // ignore: avoid_print
    print(out);
  });

  test('campanhas inteiras: até onde a IA chega', () {
    final rng = Random(42);
    const runs = 1000;
    final reached = List.filled(courts.length + 1, 0);
    for (var i = 0; i < runs; i++) {
      final run = CampaignRun.start(random: rng);
      while (run.status == RunStatus.active) {
        final won = simulate(MatchSetup.forRun(run, rng), rng);
        run.finishMatch(won, rng);
        if (run.choosingBlessing) {
          run.chooseBlessing(run.offer[rng.nextInt(run.offer.length)], rng);
        }
        // JSON ida e volta a cada passo, como no aparelho.
        final again = CampaignRun.fromJson(run.toJson());
        expect(again.toJson(), run.toJson());
      }
      reached[run.status == RunStatus.won ? courts.length : run.court]++;
    }
    // ignore: avoid_print
    print(
      'Corte alcançada pela IA em $runs campanhas: $reached '
      '(vitórias: ${reached.last})',
    );
    expect(reached.last, greaterThan(0));
  });
}
