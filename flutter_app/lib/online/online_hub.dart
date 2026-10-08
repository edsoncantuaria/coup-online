import '../game/online_game_controller.dart';
import 'account_service.dart';
import 'lobby_service.dart';
import 'online_connection.dart';
import 'social_service.dart';

/// Uma conexão com o servidor compartilhada pelas telas online: conta,
/// fila, salas abertas, amigos e as mesas jogadas nela.
class OnlineHub {
  OnlineHub._(String serverUrl) : connection = OnlineConnection(serverUrl) {
    account = AccountService(connection);
    lobby = LobbyService(connection);
    social = SocialService(connection);
  }

  static OnlineHub? _current;

  /// O hub em uso, se alguma tela online já abriu um.
  static OnlineHub? get current => _current;

  /// O hub deste servidor (troca de servidor fecha o anterior).
  static OnlineHub forServer(String serverUrl) {
    final c = _current;
    if (c != null && c.connection.serverUrl == serverUrl) return c;
    c?.dispose();
    return _current = OnlineHub._(serverUrl);
  }

  final OnlineConnection connection;
  late final AccountService account;
  late final LobbyService lobby;
  late final SocialService social;

  /// Conecta, retoma a sessão salva e carrega amigos.
  Future<bool> start() async {
    await account.restore();
    final ok = await connection.connect();
    if (ok && account.isLoggedIn) await social.refresh();
    return ok;
  }

  /// Uma mesa nesta conexão. Crie antes de entrar na fila ou numa sala.
  OnlineGameController newTable() =>
      OnlineGameController.shared(connection)..connect();

  void dispose() {
    social.dispose();
    lobby.dispose();
    account.dispose();
    connection.dispose();
    if (identical(_current, this)) _current = null;
  }
}
