// Teste ponta a ponta contra o servidor Node real.
// Rode com o servidor de pé:
//   (cd server && npx tsc && PORT=3999 BOT_DELAY_MS=30 QUEUE_BOT_FILL_MS=3000 node dist/index.js)
//   COUP_E2E_URL=http://localhost:3999 flutter test test/online_e2e_test.dart
import 'dart:async';
import 'dart:io';

import 'package:coup/engine/models.dart';
import 'package:coup/game/online_game_controller.dart';
import 'package:coup/online/account_service.dart';
import 'package:coup/online/lobby_service.dart';
import 'package:coup/online/online_connection.dart';
import 'package:coup/online/social_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  test(
    'lista de salas abertas: criador, lugares e entrar pela lista',
    () async {
      final c1 = OnlineConnection(url!);
      final c2 = OnlineConnection(url);
      final c3 = OnlineConnection(url);
      final host = OnlineGameController.shared(c1);
      final guest = OnlineGameController.shared(c2);
      final secret = OnlineGameController.shared(c3);
      final lobby = LobbyService(c2);
      expect(await host.connect(), isTrue);
      expect(await guest.connect(), isTrue);
      expect(await secret.connect(), isTrue);
      expect((await lobby.watchRooms()).ok, isTrue);

      host.createRoom(roomName: 'Mesa E2E', playerName: 'Lia');
      secret.createRoom(
        roomName: 'Secreta E2E',
        playerName: 'Rui',
        isPrivate: true,
      );
      await _until(() => host.inRoom && secret.inRoom);
      await _until(() => lobby.rooms.any((r) => r.roomId == host.roomCode));
      final room = lobby.rooms.firstWhere((r) => r.roomId == host.roomCode);
      expect(room.hostName, 'Lia');
      expect(room.players, 1);
      expect(lobby.rooms.any((r) => r.roomId == secret.roomCode), isFalse);

      guest.joinRoom(code: room.roomId, playerName: 'Téo');
      await _until(() => host.state?.players.length == 2);
      await _until(
        () =>
            lobby.rooms.any((r) => r.roomId == host.roomCode && r.players == 2),
      );

      host.startGame();
      await _until(() => !lobby.rooms.any((r) => r.roomId == host.roomCode));

      for (final d in [host, guest, secret, lobby, c1, c2, c3]) {
        d.dispose();
      }
    },
    skip: url == null ? 'defina COUP_E2E_URL' : false,
    timeout: const Timeout(Duration(minutes: 1)),
  );

  test(
    'buscar partida: a fila junta dois jogadores e bots completam a mesa',
    () async {
      final conns = [OnlineConnection(url!), OnlineConnection(url)];
      final games = conns.map(OnlineGameController.shared).toList();
      final lobbies = conns.map(LobbyService.new).toList();
      for (final g in games) {
        expect(await g.connect(), isTrue);
      }
      final found = lobbies.map((l) => l.matchFound.first).toList();
      final first = await lobbies[0].joinQueue(playerName: 'Fila A');
      expect(first.ok, isTrue);
      expect(lobbies[0].queueStatus.searching, isTrue);
      expect(lobbies[0].queueStatus.botFillIn, greaterThan(Duration.zero));
      expect((await lobbies[1].joinQueue(playerName: 'Fila B')).ok, isTrue);

      // Sem mais ninguém, bots completam a mesa depois da espera do
      // servidor (QUEUE_BOT_FILL_MS, 20 s por padrão).
      final rooms = await Future.wait(found)
          .timeout(const Duration(seconds: 45));
      expect(rooms[0], rooms[1]);
      await _until(
        () => games.every((g) => g.roomCode == rooms[0] && g.started),
      );
      final st = games[0].state!;
      expect(st.players.length, greaterThanOrEqualTo(4));
      expect(st.players.where((p) => !p.isBot).length, 2);
      expect(games[0].matchmade, isTrue);
      expect(lobbies[1].queueStatus.state, QueueState.matched);

      for (final d in [...games, ...lobbies, ...conns]) {
        d.dispose();
      }
    },
    skip: url == null ? 'defina COUP_E2E_URL' : false,
    timeout: const Timeout(Duration(minutes: 1)),
  );

  test(
    'contas, amizade depois da partida, convite e denúncia',
    () async {
      SharedPreferences.setMockInitialValues({});
      final tag = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
      final ca = OnlineConnection(url!);
      final cb = OnlineConnection(url);
      final accA = AccountService(ca);
      final accB = AccountService(cb);
      final socialA = SocialService(ca);
      final socialB = SocialService(cb);

      expect((await accA.register('ana_$tag', 'segredo123')).ok, isTrue);
      expect((await accB.register('beto_$tag', 'segredo123')).ok, isTrue);
      expect(accA.user!.username, 'ana_$tag');
      expect(
        (await accA.register('ANA_$tag', 'segredo123')).code,
        'USERNAME_TAKEN',
      );

      // Jogam juntos numa sala privada.
      final gameA = OnlineGameController.shared(ca);
      final gameB = OnlineGameController.shared(cb);
      expect(await gameA.connect(), isTrue);
      expect(await gameB.connect(), isTrue);
      gameA.createRoom(roomName: 'Amigos', playerName: 'x', password: 'pw');
      await _until(() => gameA.inRoom);
      gameB.joinRoom(code: gameA.roomCode!, playerName: 'y', password: 'pw');
      await _until(() => gameA.state?.players.length == 2);
      final betoSeat = gameA.state!.players.firstWhere(
        (p) => p.id != gameA.myId,
      );
      expect(betoSeat.name, 'beto_$tag');
      final betoId = gameA.userIdOf(betoSeat.id);
      expect(betoId, accB.user!.id);

      final requests = socialB.friendRequests.first;
      final sent = await socialA.sendFriendRequest(userId: betoId);
      expect(sent.data['result'], 'sent');
      expect((await requests).username, 'ana_$tag');
      await _until(() => socialB.incoming.isNotEmpty);
      expect((await socialB.respond(accA.user!.id, accept: true)).ok, isTrue);
      await _until(() => socialA.friends.length == 1);
      expect(socialA.friends.single.status, FriendStatus.inLobby);

      // Beto sai, Ana convida; o convite dispensa a senha.
      gameB.dispose();
      await _until(() => gameA.state?.players.length == 1);
      await _until(() => socialA.friends.single.status == FriendStatus.online);
      final invited = socialB.invites.first;
      expect((await socialA.inviteToRoom(betoId!)).ok, isTrue);
      final inv = await invited;
      expect(inv.from.username, 'ana_$tag');
      final gameB2 = OnlineGameController.shared(cb);
      expect(await gameB2.connect(), isTrue);
      gameB2.joinRoom(code: inv.roomId, playerName: 'y');
      await _until(() => gameA.state?.players.length == 2);

      final rep = await socialA.report(
        playerId: gameB2.myId,
        reason: ReportReason.antiGame,
        note: 'teste automatizado',
      );
      expect(rep.ok, isTrue);
      final dup = await socialA.report(
        playerId: gameB2.myId,
        reason: ReportReason.voiceAbuse,
      );
      expect(dup.code, 'DUPLICATE');

      // Sessão salva (a última gravada no aparelho, a do Beto): outra
      // conexão entra com o token.
      final cc = OnlineConnection(url);
      final accA2 = AccountService(cc);
      expect(await accA2.restore(), isTrue);
      expect(accA2.user!.id, accB.user!.id);
      await accA2.logout();
      expect(accA2.isLoggedIn, isFalse);

      for (final d in [
        gameA,
        gameB2,
        socialA,
        socialB,
        accA,
        accB,
        accA2,
        ca,
        cb,
        cc,
      ]) {
        d.dispose();
      }
    },
    skip: url == null ? 'defina COUP_E2E_URL' : false,
    timeout: const Timeout(Duration(minutes: 1)),
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
