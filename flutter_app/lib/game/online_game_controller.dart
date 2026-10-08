import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../engine/models.dart';
import '../online/online_connection.dart';
import 'game_controller.dart';

/// Partida online contra o servidor Node (`/server`, socket.io).
///
/// Por padrão tem a própria conexão. Com [OnlineGameController.shared] usa a
/// mesma [OnlineConnection] da conta, do lobby e dos amigos — necessário
/// para jogar a partida encontrada pela fila ou entrar por convite.
class OnlineGameController extends GameController {
  OnlineGameController(String serverUrl)
    : this._(OnlineConnection(serverUrl), ownsConnection: true);

  /// Usa uma conexão compartilhada; ao sair, só deixa a sala (não desconecta).
  OnlineGameController.shared(OnlineConnection connection)
    : this._(connection, ownsConnection: false);

  OnlineGameController._(this.connection, {required bool ownsConnection})
    : _ownsConnection = ownsConnection; // ignore: prefer_initializing_formals

  final OnlineConnection connection;
  final bool _ownsConnection;
  final List<VoidCallback> _unlisteners = [];
  GameState? _state;
  String? _roomCode;
  String? _roomName;
  bool _started = false;
  bool _matchmade = false;
  String? _hostId;
  String? _notice;
  bool _disposed = false;
  Map<String, String> _accounts = const {};

  String get serverUrl => connection.serverUrl;

  @override
  GameState? get state => _state;

  @override
  String get myId => connection.socketId;

  @override
  bool get isOnline => true;

  @override
  String? get roomCode => _roomCode;

  String? get roomName => _roomName;

  bool get connected => connection.connected;

  /// Socket bruto, para recursos que só trafegam sinalização (chat de voz).
  io.Socket? get socket => connection.socket;

  bool get inRoom => _roomCode != null && _state != null;

  String? get hostId => _hostId;

  bool get amHost => _hostId != null && _hostId == myId;

  /// A sala foi montada pela fila de "Buscar partida".
  bool get matchmade => _matchmade;

  /// Conta do jogador da mesa (null para convidados e bots). Use para
  /// pedir amizade depois da partida.
  String? userIdOf(String playerId) => _accounts[playerId];

  @override
  bool get started => _started;

  @override
  String? takeNotice() {
    final n = _notice;
    _notice = null;
    return n;
  }

  /// Conecta ao servidor. Retorna `false` se não conseguir em [timeout].
  Future<bool> connect({Duration timeout = const Duration(seconds: 8)}) async {
    if (_disposed) return false;
    if (_unlisteners.isEmpty) _listen();
    final wasConnected = connection.connected;
    final ok = await connection.connect(timeout: timeout);
    // Conexão compartilhada já pode estar numa sala (fila, convite).
    if (ok && wasConnected) syncRoom();
    return ok;
  }

  void _listen() {
    void on(String event, void Function(dynamic) handler) =>
        _unlisteners.add(connection.listen(event, handler));

    on('connect', (_) {
      if (!_disposed) notifyListeners();
    });
    on('disconnect', (_) {
      if (_disposed) return;
      if (_roomCode != null) {
        _notice = 'Conexão perdida com o servidor.';
      }
      _roomCode = null;
      _state = null;
      _started = false;
      notifyListeners();
    });
    on('room_created', (data) {
      if (data is Map) _roomCode = data['roomId'] as String?;
      notifyListeners();
    });
    on('room_error', (data) {
      _notice = data is Map ? '${data['message']}' : 'Erro na sala.';
      notifyListeners();
    });
    on('room_update', (data) {
      if (data is! Map) return;
      _state = GameState.fromJson(data);
      _roomCode = _state!.roomId;
      final players = data['players'];
      if (players is List) {
        _accounts = {
          for (final p in players)
            if (p is Map && p['id'] is String && p['userId'] is String)
              p['id'] as String: p['userId'] as String,
        };
      }
      final meta = data['roomMeta'];
      if (meta is Map) {
        _roomName = meta['displayName'] as String?;
        _hostId = meta['hostId'] as String?;
        _started = meta['started'] == true;
        _matchmade = meta['matchmade'] == true;
      }
      notifyListeners();
    });
  }

  /// Pede ao servidor o estado da sala em que este socket já está.
  void syncRoom() => connection.emit('room_sync');

  /// Cria uma sala. [isPrivate] (ou uma senha) esconde a sala da lista de
  /// salas abertas: só entra quem tem o código ou um convite.
  void createRoom({
    required String roomName,
    required String playerName,
    String? password,
    bool isPrivate = false,
  }) {
    connection.emit('create_room', {
      'displayName': roomName,
      'playerName': playerName,
      if (password != null && password.isNotEmpty) 'password': password,
      if (isPrivate) 'private': true,
    });
  }

  /// Entra por código, pela lista de salas abertas ou por convite (o
  /// convite dispensa a senha). Logado, o nome na mesa é o da conta.
  void joinRoom({
    required String code,
    required String playerName,
    String? password,
  }) {
    connection.emit('join_room', {
      'roomId': code.trim().toUpperCase(),
      'playerName': playerName,
      if (password != null && password.isNotEmpty) 'password': password,
    });
  }

  void addBot() => connection.emit('add_bot', _roomCode);

  void startGame() => connection.emit('start_game', _roomCode);

  @override
  void sendAction(GameAction action) => connection.emit('game_action', {
    'roomId': _roomCode,
    'action': action.toJson(),
  });

  @override
  void sendResponse(ResponseType response, [Role? role]) =>
      connection.emit('game_response', {
        'roomId': _roomCode,
        'response': response.name,
        if (role != null) 'role': role.name,
      });

  @override
  void selectInfluence(Role role) => connection.emit('select_influence', {
    'roomId': _roomCode,
    'role': role.name,
  });

  @override
  void confirmExchange(List<Role> kept) => connection.emit('confirm_exchange', {
    'roomId': _roomCode,
    'keptRoles': kept.map((r) => r.name).toList(),
  });

  @override
  void playAgain() => connection.emit('play_again', _roomCode);

  @override
  void leave() => dispose();

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    for (final u in _unlisteners) {
      u();
    }
    _unlisteners.clear();
    if (_ownsConnection) {
      connection.dispose();
    } else if (_roomCode != null) {
      connection.emit('leave_room');
    }
    super.dispose();
  }
}
