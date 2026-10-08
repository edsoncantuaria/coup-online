import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'online_connection.dart';

/// Conta logada. O email só chega para o próprio dono.
@immutable
class AccountUser {
  const AccountUser({
    required this.id,
    required this.username,
    this.email,
    this.emailVerified = false,
  });

  static AccountUser? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final username = json['username'];
    if (id is! String || username is! String) return null;
    final email = json['email'];
    return AccountUser(
      id: id,
      username: username,
      email: email is String ? email : null,
      emailVerified: json['emailVerified'] == true,
    );
  }

  final String id;
  final String username;

  /// Null em contas criadas antes do email.
  final String? email;
  final bool emailVerified;

  @override
  bool operator ==(Object other) =>
      other is AccountUser &&
      other.id == id &&
      other.username == username &&
      other.email == email &&
      other.emailVerified == emailVerified;

  @override
  int get hashCode => Object.hash(id, username, email, emailVerified);
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

  /// Valida o email (o link de confirmação é quem prova); null se ok.
  static String? validateEmail(String raw) {
    final e = raw.trim();
    if (e.length > 254 ||
        !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(e)) {
      return 'Digite um email válido.';
    }
    return null;
  }

  /// Valida a senha como o servidor; null se estiver ok.
  static String? validatePassword(String pw) {
    if (pw.length < 6) return 'A senha precisa de pelo menos 6 caracteres.';
    if (pw.length > 128) return 'Senha longa demais.';
    return null;
  }

  /// Há uma sessão salva neste aparelho (sem conectar).
  static Future<bool> hasSavedSession() async {
    try {
      return (await SharedPreferences.getInstance()).getString(tokenKey) !=
          null;
    } catch (_) {
      return false;
    }
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

  /// Cria a conta; o servidor manda o link de confirmação para o email.
  Future<ServerReply> register(String username, String email, String password) {
    final local =
        validateUsername(username) ??
        validateEmail(email) ??
        validatePassword(password);
    if (local != null) {
      return Future.value(_fail(ServerReply.failure('INVALID', local)));
    }
    return _signIn('account_register', {
      'username': username.trim(),
      'email': email.trim(),
      'password': password,
    });
  }

  /// Entra com o nome de usuário ou com o email.
  Future<ServerReply> login(String login, String password) {
    final l = login.trim();
    final local = l.contains('@') ? validateEmail(l) : validateUsername(l);
    if (local != null) {
      return Future.value(_fail(ServerReply.failure('INVALID', local)));
    }
    return _signIn('account_login', {'login': l, 'password': password});
  }

  /// Pede o link de troca de senha. A resposta é a mesma exista ou não
  /// uma conta com esse email.
  Future<ServerReply> forgotPassword(String email) async {
    final local = validateEmail(email);
    if (local != null) return _fail(ServerReply.failure('INVALID', local));
    return _call('account_forgot_password', {'email': email.trim()});
  }

  /// Manda de novo o link de confirmação do email.
  Future<ServerReply> resendVerification() =>
      _call('account_resend_verification');

  /// Atualiza a conta (ex.: depois de confirmar o email no navegador).
  Future<void> refresh() async {
    if (_token == null || !connection.connected) return;
    final reply = await connection.request('account_me');
    final u = reply.ok ? AccountUser.fromJson(reply.data['user']) : null;
    if (u != null && u != _user) {
      _user = u;
      notifyListeners();
    }
  }

  /// Sai da conta: revoga o token no servidor e apaga do aparelho.
  Future<void> logout() async {
    if (connection.connected) await connection.request('account_logout');
    await _setSession(null, null);
  }

  Future<ServerReply> _call(String event, [Map<String, dynamic>? data]) async {
    _setBusy(true);
    try {
      if (!await connection.connect()) {
        return _fail(
          const ServerReply.failure('OFFLINE', 'Sem conexão com o servidor.'),
        );
      }
      final reply = await connection.request(event, data);
      if (!reply.ok) return _fail(reply);
      _lastError = null;
      return reply;
    } finally {
      _setBusy(false);
    }
  }

  Future<ServerReply> _signIn(String event, Map<String, dynamic> data) async {
    _setBusy(true);
    try {
      if (!await connection.connect()) {
        return _fail(
          const ServerReply.failure('OFFLINE', 'Sem conexão com o servidor.'),
        );
      }
      final reply = await connection.request(event, data);
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
