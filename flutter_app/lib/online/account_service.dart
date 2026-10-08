import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'online_connection.dart';

/// Conta logada (só id e nome; o resto nunca sai do servidor).
@immutable
class AccountUser {
  const AccountUser({required this.id, required this.username});

  static AccountUser? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final username = json['username'];
    if (id is! String || username is! String) return null;
    return AccountUser(id: id, username: username);
  }

  final String id;
  final String username;

  @override
  bool operator ==(Object other) =>
      other is AccountUser && other.id == id && other.username == username;

  @override
  int get hashCode => Object.hash(id, username);
}

/// Conta do jogador: cadastro, login, sessão salva no aparelho e logout.
/// Sem conta o jogador continua jogando como convidado.
class AccountService extends ChangeNotifier {
  AccountService(this.connection, {Future<SharedPreferences> Function()? prefs})
    : _prefs = prefs ?? SharedPreferences.getInstance {
    _unlisten = connection.listen('account_state', _onAccountState);
    _connSub = connection.onConnected.listen((_) => _onReconnect());
  }

  /// Chave do token de sessão no SharedPreferences.
  static const tokenKey = 'account.sessionToken';

  final OnlineConnection connection;
  final Future<SharedPreferences> Function() _prefs;
  late final VoidCallback _unlisten;
  late final StreamSubscription<void> _connSub;

  AccountUser? _user;
  String? _token;
  bool _busy = false;
  String? _lastError;

  AccountUser? get user => _user;
  bool get isLoggedIn => _user != null;
  bool get isGuest => _user == null;

  /// Pedido em andamento (para desabilitar botões).
  bool get busy => _busy;

  /// Última mensagem de erro (em português), ou null.
  String? get lastError => _lastError;

  /// Token de sessão atual (guardado no aparelho).
  String? get token => _token;

  /// Valida o nome de usuário como o servidor; null se estiver ok.
  static String? validateUsername(String raw) {
    final u = raw.trim();
    if (u.length < 3 || u.length > 20) {
      return 'Use de 3 a 20 caracteres.';
    }
    if (!RegExp(r'^[\p{L}\p{N}_.-]+$', unicode: true).hasMatch(u)) {
      return 'Use só letras, números, ponto, hífen ou sublinhado.';
    }
    return null;
  }

  /// Valida a senha como o servidor; null se estiver ok.
  static String? validatePassword(String pw) {
    if (pw.length < 6) return 'A senha precisa de pelo menos 6 caracteres.';
    if (pw.length > 128) return 'Senha longa demais.';
    return null;
  }

  /// Lê o token salvo e entra com ele (conecta se preciso).
  /// Retorna `true` se a sessão ainda vale.
  Future<bool> restore() async {
    final saved = await _readToken();
    if (saved == null) return false;
    _token = saved;
    connection.authToken = saved;
    if (!await connection.connect()) return false;
    return _authenticate();
  }

  Future<ServerReply> register(String username, String password) =>
      _signIn('account_register', username, password);

  Future<ServerReply> login(String username, String password) =>
      _signIn('account_login', username, password);

  /// Sai da conta: revoga o token no servidor e apaga do aparelho.
  Future<void> logout() async {
    if (connection.connected) await connection.request('account_logout');
    await _setSession(null, null);
  }

  Future<ServerReply> _signIn(
    String event,
    String username,
    String password,
  ) async {
    final local =
        validateUsername(username) ??
        (event == 'account_register' ? validatePassword(password) : null);
    if (local != null) return _fail(ServerReply.failure('INVALID', local));
    _setBusy(true);
    try {
      if (!await connection.connect()) {
        return _fail(
          const ServerReply.failure('OFFLINE', 'Sem conexão com o servidor.'),
        );
      }
      final reply = await connection.request(event, {
        'username': username.trim(),
        'password': password,
      });
      if (!reply.ok) return _fail(reply);
      await _setSession(
        AccountUser.fromJson(reply.data['user']),
        reply.data['token'] as String?,
      );
      return reply;
    } finally {
      _setBusy(false);
    }
  }

  Future<bool> _authenticate() async {
    final t = _token;
    if (t == null) return false;
    final reply = await connection.request('account_auth', {'token': t});
    if (reply.ok) {
      _user = AccountUser.fromJson(reply.data['user']);
      _lastError = null;
      notifyListeners();
      return _user != null;
    }
    if (reply.code == 'UNAUTHORIZED') await _setSession(null, null);
    return false;
  }

  /// O handshake já leva o token; isso só confirma quem somos depois de
  /// uma reconexão.
  void _onReconnect() {
    if (_token != null) _authenticate();
  }

  void _onAccountState(dynamic data) {
    if (data is! Map) return;
    final u = AccountUser.fromJson(data['user']);
    if (u == null && data['expired'] == true) {
      _setSession(null, null);
      return;
    }
    if (u != _user) {
      _user = u;
      notifyListeners();
    }
  }

  Future<void> _setSession(AccountUser? user, String? token) async {
    _user = user;
    _token = token;
    _lastError = null;
    connection.authToken = token;
    notifyListeners();
    try {
      final p = await _prefs();
      if (token == null) {
        await p.remove(tokenKey);
      } else {
        await p.setString(tokenKey, token);
      }
    } catch (_) {}
  }

  Future<String?> _readToken() async {
    try {
      return (await _prefs()).getString(tokenKey);
    } catch (_) {
      return null;
    }
  }

  ServerReply _fail(ServerReply r) {
    _lastError = r.message ?? 'Erro desconhecido.';
    notifyListeners();
    return r;
  }

  void _setBusy(bool b) {
    _busy = b;
    notifyListeners();
  }

  @override
  void dispose() {
    _unlisten();
    _connSub.cancel();
    super.dispose();
  }
}
