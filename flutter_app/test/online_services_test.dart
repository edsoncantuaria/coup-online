// Camada de dados online (contas, lobby, amigos) sem servidor: parse dos
// payloads, validações locais e comportamento offline.
import 'package:coup/online/account_service.dart';
import 'package:coup/online/lobby_service.dart';
import 'package:coup/online/online_connection.dart';
import 'package:coup/online/social_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('ServerReply lê sucesso, erro e lixo', () {
    final ok = ServerReply.fromJson({'ok': true, 'roomId': 'ABCDE'});
    expect(ok.ok, isTrue);
    expect(ok.data['roomId'], 'ABCDE');
    final err = ServerReply.fromJson({
      'ok': false,
      'code': 'RATE_LIMITED',
      'message': 'Calma',
    });
    expect(err.ok, isFalse);
    expect(err.code, 'RATE_LIMITED');
    expect(ServerReply.fromJson('??').code, 'BAD_REPLY');
  });

  test('validações de conta seguem as regras do servidor', () {
    expect(AccountService.validateUsername('ana'), isNull);
    expect(AccountService.validateUsername('João_99'), isNull);
    expect(AccountService.validateUsername('ab'), isNotNull);
    expect(AccountService.validateUsername('com espaço'), isNotNull);
    expect(AccountService.validateUsername('a' * 21), isNotNull);
    expect(AccountService.validatePassword('12345'), isNotNull);
    expect(AccountService.validatePassword('123456'), isNull);
  });

  test('salas abertas e status da fila', () {
    final room = OpenRoom.fromJson({
      'roomId': 'QWERT',
      'displayName': 'Mesa',
      'hostName': 'Ana',
      'players': 4,
      'humans': 2,
      'maxPlayers': 6,
    })!;
    expect(room.hostName, 'Ana');
    expect(room.freeSeats, 2);
    expect(OpenRoom.fromJson({'displayName': 'sem id'}), isNull);

    final s = QueueStatus.fromJson({
      'state': 'searching',
      'position': 2,
      'queued': 3,
      'waitedMs': 1500,
      'botFillInMs': 18000,
    });
    expect(s.searching, isTrue);
    expect(s.position, 2);
    expect(s.botFillIn, const Duration(seconds: 18));
    final m = QueueStatus.fromJson({'state': 'matched', 'roomId': 'ZXCVB'});
    expect(m.state, QueueState.matched);
    expect(m.roomId, 'ZXCVB');
    expect(QueueStatus.fromJson(null).state, QueueState.idle);
  });

  test('amigos, convites e motivos de denúncia', () {
    final f = Friend.fromJson({
      'userId': 'u_1',
      'username': 'Bia',
      'status': 'in_match',
    })!;
    expect(f.status, FriendStatus.inMatch);
    expect(f.isOnline, isTrue);
    expect(friendStatusFromWire('in_lobby'), FriendStatus.inLobby);
    expect(friendStatusFromWire('???'), FriendStatus.offline);

    final inv = RoomInvite.fromJson({
      'roomId': 'ABCDE',
      'roomName': 'Corte',
      'expiresAt': DateTime.now().millisecondsSinceEpoch + 60000,
      'from': {'userId': 'u_2', 'username': 'Caio'},
    })!;
    expect(inv.from.username, 'Caio');
    expect(inv.expired, isFalse);
    expect(RoomInvite.fromJson({'roomId': 'X'}), isNull);

    expect(ReportReason.voiceAbuse.wire, 'voice_abuse');
    expect(ReportReason.antiGame.wire, 'anti_game');
  });

  test('sem servidor: pedidos falham com OFFLINE e nada quebra', () async {
    SharedPreferences.setMockInitialValues({});
    final conn = OnlineConnection('http://127.0.0.1:9');
    final account = AccountService(conn);
    final lobby = LobbyService(conn);
    final social = SocialService(conn);

    expect(await account.restore(), isFalse);
    final bad = await account.login('x', 'segredo');
    expect(bad.code, 'INVALID');
    expect(account.lastError, isNotNull);
    expect((await social.refresh()).code, 'OFFLINE');
    expect((await lobby.refreshRooms()), isEmpty);

    social.dispose();
    lobby.dispose();
    account.dispose();
    conn.dispose();
  });

  test('token salvo é lido na restauração', () async {
    SharedPreferences.setMockInitialValues({
      AccountService.tokenKey: 'token-antigo',
    });
    final conn = OnlineConnection('http://127.0.0.1:9');
    final account = AccountService(conn);
    // Sem servidor não confirma a sessão, mas também não apaga o token.
    expect(await account.restore(), isFalse);
    expect(account.token, 'token-antigo');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(AccountService.tokenKey), 'token-antigo');
    account.dispose();
    conn.dispose();
  });
}
