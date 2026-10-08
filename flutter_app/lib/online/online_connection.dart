import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// Resposta de um pedido ao servidor (eventos com ack).
///
/// O servidor sempre responde `{ ok: true, ... }` ou
/// `{ ok: false, code, message }`.
class ServerReply {
  const ServerReply({
    required this.ok,
    this.code,
    this.message,
    this.data = const {},
  });

  factory ServerReply.fromJson(Object? json) {
    if (json is! Map) {
      return const ServerReply(
        ok: false,
        code: 'BAD_REPLY',
        message: 'Resposta inválida do servidor.',
      );
    }
    final data = json.map((k, v) => MapEntry('$k', v));
    return ServerReply(
      ok: data['ok'] == true,
      code: data['code'] as String?,
      message: data['message'] as String?,
      data: data,
    );
  }

  const ServerReply.failure(String this.code, String this.message)
    : ok = false,
      data = const {};

  final bool ok;

  /// Código estável do erro (`RATE_LIMITED`, `UNAUTHORIZED`, ...).
  final String? code;

  /// Mensagem em português pronta para mostrar.
  final String? message;

  /// Payload inteiro da resposta.
  final Map<String, dynamic> data;

  @override
  String toString() => ok ? 'ServerReply(ok)' : 'ServerReply($code: $message)';
}

/// Uma conexão socket.io com o servidor, compartilhada por conta, lobby,
/// amigos e partida (o servidor identifica o jogador pelo socket).
class OnlineConnection extends ChangeNotifier {
  OnlineConnection(this.serverUrl);

  final String serverUrl;
  io.Socket? _socket;
  bool _disposed = false;
  String? _authToken;
  final _connects = StreamController<void>.broadcast();

  /// Ouvintes registrados; reaplicados se o socket for recriado.
  final _listeners = <(String, void Function(dynamic))>[];

  io.Socket? get socket => _socket;

  bool get connected => _socket?.connected ?? false;

  /// Id do socket atual (é o id do jogador na mesa).
  String get socketId => _socket?.id ?? '';

  /// Dispara a cada conexão (inclusive reconexões automáticas).
  Stream<void> get onConnected => _connects.stream;

  /// Token de sessão mandado no handshake (vale também para reconexões).
  set authToken(String? token) {
    _authToken = token;
    final s = _socket;
    if (s != null) s.auth = token == null ? null : {'token': token};
  }

  /// Conecta ao servidor. Retorna `false` se não conseguir em [timeout].
  Future<bool> connect({Duration timeout = const Duration(seconds: 8)}) async {
    if (connected) return true;
    if (_disposed) return false;
    final completer = Completer<bool>();
    var socket = _socket;
    if (socket == null) {
      final builder = io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableForceNew();
      if (_authToken != null) builder.setAuth({'token': _authToken});
      socket = io.io(serverUrl, builder.build());
      _socket = socket;
      socket.onConnect((_) {
        if (_disposed) return;
        _connects.add(null);
        notifyListeners();
      });
      socket.onDisconnect((_) {
        if (!_disposed) notifyListeners();
      });
      for (final (event, handler) in _listeners) {
        socket.on(event, handler);
      }
    }
    void onOk(dynamic _) {
      if (!completer.isCompleted) completer.complete(true);
    }

    void onErr(dynamic _) {
      if (!completer.isCompleted) completer.complete(false);
    }

    socket.on('connect', onOk);
    socket.on('connect_error', onErr);
    socket.connect();
    final timer = Timer(timeout, () => onErr(null));
    final ok = await completer.future;
    timer.cancel();
    socket.off('connect', onOk);
    socket.off('connect_error', onErr);
    if (!ok && !connected) {
      socket.dispose();
      if (identical(_socket, socket)) _socket = null;
    }
    return ok;
  }

  /// Manda um evento e espera o ack do servidor.
  Future<ServerReply> request(
    String event, [
    Map<String, dynamic>? data,
    Duration timeout = const Duration(seconds: 8),
  ]) {
    final s = _socket;
    if (s == null || !s.connected) {
      return Future.value(
        const ServerReply.failure('OFFLINE', 'Sem conexão com o servidor.'),
      );
    }
    final completer = Completer<ServerReply>();
    s.emitWithAck(
      event,
      data ?? <String, dynamic>{},
      ack: (dynamic reply) {
        if (!completer.isCompleted) {
          completer.complete(ServerReply.fromJson(reply));
        }
      },
    );
    return completer.future.timeout(
      timeout,
      onTimeout: () => const ServerReply.failure(
        'TIMEOUT',
        'O servidor demorou para responder.',
      ),
    );
  }

  /// Escuta um evento empurrado pelo servidor. Devolve a função que para.
  /// Pode ser chamado antes de [connect].
  VoidCallback listen(String event, void Function(dynamic data) handler) {
    final entry = (event, handler);
    _listeners.add(entry);
    _socket?.on(event, handler);
    return () {
      _listeners.remove(entry);
      _socket?.off(event, handler);
    };
  }

  void emit(String event, [dynamic data]) => _socket?.emit(event, data);

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _socket?.dispose();
    _socket = null;
    _connects.close();
    super.dispose();
  }
}
