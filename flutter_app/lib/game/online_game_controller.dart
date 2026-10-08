import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../engine/models.dart';
import 'game_controller.dart';

/// Partida online contra o servidor Node (`/server`, socket.io).
class OnlineGameController extends GameController {
  OnlineGameController(this.serverUrl);

  final String serverUrl;
  io.Socket? _socket;
  GameState? _state;
  String? _roomCode;
  String? _roomName;
  bool _started = false;
  String? _hostId;
  String? _notice;
  bool _disposed = false;

  @override
  GameState? get state => _state;

  @override
  String get myId => _socket?.id ?? '';

  @override
  bool get isOnline => true;

  @override
  String? get roomCode => _roomCode;

  String? get roomName => _roomName;

  bool get connected => _socket?.connected ?? false;

  /// Socket bruto, para recursos que só trafegam sinalização (chat de voz).
  io.Socket? get socket => _socket;

  bool get inRoom => _roomCode != null && _state != null;

  String? get hostId => _hostId;

  bool get amHost => _hostId != null && _hostId == myId;

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
    if (connected) return true;
    final completer = Completer<bool>();
    final socket = io.io(
      serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableForceNew()
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      if (!completer.isCompleted) completer.complete(true);
      notifyListeners();
    });
    socket.onConnectError((_) {
      if (!completer.isCompleted) completer.complete(false);
    });
    socket.onDisconnect((_) {
      if (_disposed) return;
      if (_roomCode != null) {
        _notice = 'Conexão perdida com o servidor.';
      }
      _roomCode = null;
      _state = null;
      _started = false;
      notifyListeners();
    });
    socket.on('room_created', (data) {
      if (data is Map) _roomCode = data['roomId'] as String?;
      notifyListeners();
    });
    socket.on('room_error', (data) {
      _notice = data is Map ? '${data['message']}' : 'Erro na sala.';
      notifyListeners();
    });
    socket.on('room_update', (data) {
      if (data is! Map) return;
      _state = GameState.fromJson(data);
      _roomCode = _state!.roomId;
      final meta = data['roomMeta'];
      if (meta is Map) {
        _roomName = meta['displayName'] as String?;
        _hostId = meta['hostId'] as String?;
        _started = meta['started'] == true;
      }
      notifyListeners();
    });

    socket.connect();
    Future.delayed(timeout, () {
      if (!completer.isCompleted) completer.complete(false);
    });
    final ok = await completer.future;
    if (!ok) {
      socket.dispose();
      _socket = null;
    }
    return ok;
  }

  void createRoom({
    required String roomName,
    required String playerName,
    String? password,
  }) {
    _socket?.emit('create_room', {
      'displayName': roomName,
      'playerName': playerName,
      if (password != null && password.isNotEmpty) 'password': password,
    });
  }

  void joinRoom({
    required String code,
    required String playerName,
    String? password,
  }) {
    _socket?.emit('join_room', {
      'roomId': code.trim().toUpperCase(),
      'playerName': playerName,
      if (password != null && password.isNotEmpty) 'password': password,
    });
  }

  void addBot() => _socket?.emit('add_bot', _roomCode);

  void startGame() => _socket?.emit('start_game', _roomCode);

  @override
  void sendAction(GameAction action) => _socket?.emit('game_action', {
    'roomId': _roomCode,
    'action': action.toJson(),
  });

  @override
  void sendResponse(ResponseType response, [Role? role]) =>
      _socket?.emit('game_response', {
        'roomId': _roomCode,
        'response': response.name,
        if (role != null) 'role': role.name,
      });

  @override
  void selectInfluence(Role role) => _socket?.emit('select_influence', {
    'roomId': _roomCode,
    'role': role.name,
  });

  @override
  void confirmExchange(List<Role> kept) => _socket?.emit('confirm_exchange', {
    'roomId': _roomCode,
    'keptRoles': kept.map((r) => r.name).toList(),
  });

  @override
  void playAgain() => _socket?.emit('play_again', _roomCode);

  @override
  void leave() => dispose();

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _socket?.dispose();
    _socket = null;
    super.dispose();
  }
}
