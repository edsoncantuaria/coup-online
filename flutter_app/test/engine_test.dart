import 'dart:math';

import 'package:coup/engine/bot.dart';
import 'package:coup/engine/coup_engine.dart';
import 'package:coup/engine/models.dart';
import 'package:flutter_test/flutter_test.dart';

Player stub(String id, int coins, List<Role> roles, {List<bool>? flipped}) =>
    Player(
      id: id,
      name: id,
      isBot: true,
      coins: coins,
      cards: [
        for (var i = 0; i < roles.length; i++)
          GameCard(roles[i], isFlipped: flipped?[i] ?? false),
      ],
    );

CoupEngine table(
  List<Player> players, {
  int turn = 0,
  List<Role>? deck,
  int seed = 1,
}) {
  final s = GameState(roomId: 't')
    ..players = players
    ..turnIndex = turn
    ..deck =
        deck ??
        [Role.duke, Role.captain, Role.contessa, Role.assassin, Role.ambassador]
    ..matchStats = MatchStats(
      startedAt: 0,
      perPlayer: {for (final p in players) p.id: PlayerStats()},
    );
  return CoupEngine.hydrate(s, random: Random(seed));
}

GameAction act(ActionType t, String src, [String? target]) =>
    GameAction(type: t, source: src, target: target);

void main() {
  group('validateAction', () {
    test('obriga golpe com 10+ moedas', () {
      final e = table([
        stub('a', 10, [Role.duke, Role.duke]),
        stub('b', 2, [Role.captain, Role.captain]),
      ]);
      expect(e.validateAction('a', act(ActionType.income, 'a')).ok, isFalse);
      expect(e.validateAction('a', act(ActionType.coup, 'a', 'b')).ok, isTrue);
    });

    test('custos, alvos e turno', () {
      final e = table([
        stub('a', 2, [Role.duke, Role.duke]),
        stub('b', 0, [Role.captain, Role.captain]),
      ]);
      expect(e.validateAction('b', act(ActionType.income, 'b')).ok, isFalse);
      expect(e.validateAction('a', act(ActionType.coup, 'a', 'b')).ok, isFalse);
      expect(
        e.validateAction('a', act(ActionType.assassinate, 'a', 'b')).ok,
        isFalse,
      );
      expect(
        e.validateAction('a', act(ActionType.steal, 'a', 'b')).ok,
        isFalse,
        reason: 'alvo sem moedas',
      );
      expect(e.validateAction('a', act(ActionType.steal, 'a')).ok, isFalse);
      expect(e.validateAction('a', act(ActionType.tax, 'a', 'b')).ok, isFalse);
      expect(e.validateAction('a', act(ActionType.tax, 'a')).ok, isTrue);
    });
  });

  group('desafios e bloqueios', () {
    test('blefe de Duque desafiado perde influência e a ação cancela', () {
      final e = table([
        stub('a', 2, [Role.captain, Role.contessa]),
        stub('b', 2, [Role.duke, Role.duke]),
      ]);
      e.handleAction('a', act(ActionType.tax, 'a'));
      expect(e.state.phase, Phase.challenge);
      e.handleResponse('b', ResponseType.challenge);
      expect(e.state.phase, Phase.losingInfluence);
      expect(e.state.losingInfluenceId, 'a');
      e.handleFlip('a', Role.contessa);
      expect(e.state.players[0].coins, 2);
      expect(e.state.currentPlayer!.id, 'b');
      expect(e.state.lastReveal!.proven, isFalse);
    });

    test('Duque legítimo: desafiante perde carta e taxa resolve', () {
      final e = table([
        stub('a', 2, [Role.duke, Role.contessa]),
        stub('b', 2, [Role.captain, Role.assassin]),
      ]);
      e.handleAction('a', act(ActionType.tax, 'a'));
      e.handleResponse('b', ResponseType.challenge);
      expect(e.state.losingInfluenceId, 'b');
      e.handleFlip('b', Role.assassin);
      expect(e.state.players[0].coins, 5);
      expect(e.state.lastReveal!.proven, isTrue);
      // A carta provada volta ao baralho e é substituída.
      expect(e.state.players[0].cards.length, 2);
    });

    test('roubo bloqueado com Embaixador sem desafio encerra a ação', () {
      final e = table([
        stub('a', 2, [Role.captain, Role.duke]),
        stub('b', 3, [Role.ambassador, Role.duke]),
      ]);
      e.handleAction('a', act(ActionType.steal, 'a', 'b'));
      e.handleResponse('b', ResponseType.pass); // não desafia o Capitão
      expect(e.state.phase, Phase.block);
      e.handleResponse('b', ResponseType.block, Role.ambassador);
      expect(e.state.pendingBlock!.role, Role.ambassador);
      e.handleResponse('a', ResponseType.pass);
      expect(e.state.players[1].coins, 3);
      expect(e.state.currentPlayer!.id, 'b');
    });

    test(
      'Condessa falsa desafiada: assassinato prossegue e alvo é eliminado',
      () {
        final e = table([
          stub('a', 3, [Role.assassin, Role.duke]),
          stub('b', 2, [Role.captain, Role.duke]),
        ]);
        e.handleAction('a', act(ActionType.assassinate, 'a', 'b'));
        e.handleResponse('b', ResponseType.pass);
        e.handleResponse('b', ResponseType.block);
        e.handleResponse('a', ResponseType.challenge);
        expect(e.state.losingInfluenceId, 'b');
        e.handleFlip('b', Role.captain);
        // Perde a última carta pelo assassinato.
        expect(e.state.phase, Phase.gameOver);
        expect(e.state.winner, 'a');
      },
    );

    test('ajuda externa: bloqueio falso reabre bloqueio para os demais', () {
      final e = table([
        stub('a', 2, [Role.captain, Role.captain]),
        stub('b', 2, [Role.contessa, Role.assassin]),
        stub('c', 2, [Role.duke, Role.ambassador]),
      ]);
      e.handleAction('a', act(ActionType.foreignAid, 'a'));
      expect(e.state.waitingFor!.id, 'b');
      e.handleResponse('b', ResponseType.block);
      e.handleResponse('c', ResponseType.challenge);
      e.handleFlip('b', Role.assassin);
      expect(e.state.phase, Phase.block);
      expect(e.state.pendingBlock, isNull);
      expect(e.state.waitingFor!.id, 'b');
      e.handleResponse('b', ResponseType.pass);
      e.handleResponse('c', ResponseType.block);
      e.handleResponse('a', ResponseType.pass);
      e.handleResponse('b', ResponseType.pass);
      expect(e.state.players[0].coins, 2);
      expect(e.state.currentPlayer!.id, 'b');
    });
  });

  test(
    'troca do Embaixador mantém a quantidade de cartas e devolve o resto',
    () {
      final e = table(
        [
          stub('a', 2, [Role.ambassador, Role.duke]),
          stub('b', 2, [Role.captain, Role.captain]),
        ],
        deck: [Role.contessa, Role.assassin, Role.duke],
      );
      e.handleAction('a', act(ActionType.exchange, 'a'));
      e.handleResponse('b', ResponseType.pass);
      expect(e.state.phase, Phase.exchanging);
      final pool = [
        ...e.state.players[0].aliveRoles,
        ...e.state.exchangingCards!,
      ];
      e.handleExchangeChoice('a', [Role.captain, Role.duke]); // inválido
      expect(e.state.phase, Phase.exchanging);
      e.handleExchangeChoice('a', [pool[2], pool[3]]);
      expect(e.state.players[0].aliveRoles, [pool[2], pool[3]]);
      expect(e.state.deck.length, 3);
      expect(e.state.phase, Phase.action);
    },
  );

  test('serialização JSON ida e volta preserva o estado', () {
    final e = CoupEngine('r', random: Random(3));
    for (var i = 0; i < 4; i++) {
      e.addPlayer('p$i', 'P$i', isBot: true);
    }
    e.startGame();
    final copy = GameState.fromJson(e.state.toJson());
    expect(copy.toJson(), e.state.toJson());
  });

  test(
    'stress: centenas de partidas entre bots terminam sem violar invariantes',
    () {
      for (var seed = 0; seed < 300; seed++) {
        final rng = Random(seed);
        final e = CoupEngine('sim', random: rng);
        final n = 2 + seed % 5;
        for (var i = 0; i < n; i++) {
          e.addPlayer(
            'p$i',
            'P$i',
            isBot: true,
            personality: BotPersonality.values[i % 4],
          );
        }
        e.startGame();
        final brain = BotBrain(e, random: rng);
        var steps = 0;
        while (e.state.phase != Phase.gameOver && steps < 5000) {
          final actor = BotBrain.pendingActor(e.state);
          expect(
            actor,
            isNotNull,
            reason: 'seed $seed travou em ${e.state.phase}',
          );
          expect(
            brain.playFor(actor!),
            isTrue,
            reason: 'seed $seed fase ${e.state.phase}',
          );
          steps++;
          final s = e.state;
          final cards =
              s.players.fold<int>(0, (a, p) => a + p.cards.length) +
              s.deck.length +
              (s.exchangingCards?.length ?? 0);
          expect(cards, 15, reason: 'seed $seed: cartas não conservadas');
          expect(s.players.every((p) => p.coins >= 0), isTrue);
        }
        expect(
          e.state.phase,
          Phase.gameOver,
          reason: 'seed $seed não terminou',
        );
        expect(e.state.players.where((p) => p.isAlive).length, 1);
      }
    },
  );
}
