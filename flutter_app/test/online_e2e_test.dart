// Teste ponta a ponta contra o servidor Node real.
// Rode com o servidor de pé:
//   (cd server && npx tsc && PORT=3999 BOT_DELAY_MS=30 node dist/index.js)
//   COUP_E2E_URL=http://localhost:3999 flutter test test/online_e2e_test.dart
import 'dart:async';
import 'dart:io';

import 'package:coup/engine/models.dart';
import 'package:coup/game/online_game_controller.dart';
import 'package:flutter_test/flutter_test.dart';

/// Política simples para o cliente jogar sozinho.
void autoplay(OnlineGameController c) {
  if (!c.isMyDecision) return;
  final s = c.state!;
  final me = c.me!;
  switch (s.phase) {
    case Phase.action:
      final target = s.players.firstWhere((p) => p.id != me.id && p.isAlive);
      c.sendAction(
        me.coins >= 7
            ? GameAction(
                type: ActionType.coup,
                source: me.id,
                target: target.id,
              )
            : GameAction(type: ActionType.income, source: me.id),
      );
    case Phase.challenge:
    case Phase.block:
      c.sendResponse(ResponseType.pass);
    case Phase.losingInfluence:
      c.selectInfluence(me.aliveRoles.first);
    case Phase.exchanging:
      c.confirmExchange(me.aliveRoles);
    default:
      break;
  }
}

void main() {
  final url = Platform.environment['COUP_E2E_URL'];

  test(
    'duas pessoas e um bot jogam uma partida inteira online',
    () async {
      final host = OnlineGameController(url!);
      final guest = OnlineGameController(url);
      expect(await host.connect(), isTrue);
      expect(await guest.connect(), isTrue);

      host.createRoom(roomName: 'Teste', playerName: 'Ana');
      await _until(() => host.inRoom);
      expect(host.amHost, isTrue);

      guest.joinRoom(code: host.roomCode!, playerName: 'Bia');
      await _until(() => guest.inRoom && host.state!.players.length == 2);
      host.addBot();
      await _until(() => guest.state!.players.length == 3);

      var hiddenChecked = false;
      void watch(OnlineGameController c) {
        final s = c.state;
        if (s != null &&
            c.started &&
            s.phase != Phase.gameOver &&
            !hiddenChecked) {
          final others = s.players.where((p) => p.id != c.myId);
          expect(
            others
                .expand((p) => p.cards)
                .where((x) => !x.isFlipped)
                .every((x) => x.hidden),
            isTrue,
            reason: 'cartas vivas dos outros devem chegar ocultas',
          );
          expect(c.me!.cards.every((x) => !x.hidden), isTrue);
          expect(s.deck, isEmpty);
          expect(s.deckCount, greaterThan(0));
          hiddenChecked = true;
        }
        // Responde depois do microtask para não reentrar no listener.
        scheduleMicrotask(() => autoplay(c));
      }

      host.addListener(() => watch(host));
      guest.addListener(() => watch(guest));
      host.startGame();

      await _until(
        () =>
            host.state?.phase == Phase.gameOver &&
            guest.state?.phase == Phase.gameOver,
        timeout: const Duration(seconds: 60),
      );
      expect(hiddenChecked, isTrue);
      expect(host.state!.winner, isNotNull);
      // No fim, todas as cartas são reveladas.
      expect(
        guest.state!.players.expand((p) => p.cards).any((c) => c.hidden),
        isFalse,
      );

      host.playAgain();
      await _until(() => !guest.started);
      expect(guest.state!.players.length, 3);

      host.dispose();
      guest.dispose();
    },
    skip: url == null ? 'defina COUP_E2E_URL' : false,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}

Future<void> _until(
  bool Function() cond, {
  Duration timeout = const Duration(seconds: 10),
}) async {
  final end = DateTime.now().add(timeout);
  while (!cond()) {
    if (DateTime.now().isAfter(end)) {
      throw TimeoutException('condição não atingida');
    }
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
}
