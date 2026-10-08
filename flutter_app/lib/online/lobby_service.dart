import 'dart:async';

import 'package:flutter/foundation.dart';

import 'online_connection.dart';

/// Sala pública aberta, como aparece na lista do lobby.
@immutable
class OpenRoom {
  const OpenRoom({
    required this.roomId,
    required this.displayName,
    required this.hostName,
    required this.players,
    required this.humans,
    required this.maxPlayers,
    this.hostUserId,
  });

  static OpenRoom? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['roomId'];
    if (id is! String) return null;
    int n(Object? v, int d) => v is num ? v.toInt() : d;
    return OpenRoom(
      roomId: id,
      displayName: '${json['displayName'] ?? ''}',
      hostName: '${json['hostName'] ?? ''}',
      hostUserId: json['hostUserId'] as String?,
      players: n(json['players'], 0),
      humans: n(json['humans'], n(json['players'], 0)),
      maxPlayers: n(json['maxPlayers'], 6),
    );
  }

  final String roomId;
  final String displayName;

  /// Quem criou a sala (anfitrião atual).
  final String hostName;

  /// Conta do anfitrião, se ele estiver logado.
  final String? hostUserId;

  /// Lugares ocupados (humanos + bots).
  final int players;
  final int humans;
  final int maxPlayers;

  int get freeSeats => (maxPlayers - players).clamp(0, maxPlayers);
}

enum QueueState { idle, searching, matched }

/// Situação na fila de "Buscar partida".
@immutable
class QueueStatus {
  const QueueStatus({
    required this.state,
    this.position = 0,
    this.queued = 0,
    this.waited = Duration.zero,
    this.botFillIn = Duration.zero,
    this.roomId,
  });

  static const idle = QueueStatus(state: QueueState.idle);

  factory QueueStatus.fromJson(Object? json) {
    if (json is! Map) return idle;
    Duration ms(Object? v) => Duration(milliseconds: v is num ? v.toInt() : 0);
    final state = switch (json['state']) {
      'searching' => QueueState.searching,
      'matched' => QueueState.matched,
      _ => QueueState.idle,
    };
    return QueueStatus(
      state: state,
      position: (json['position'] as num?)?.toInt() ?? 0,
      queued: (json['queued'] as num?)?.toInt() ?? 0,
      waited: ms(json['waitedMs']),
      botFillIn: ms(json['botFillInMs']),
      roomId: json['roomId'] as String?,
    );
  }

  final QueueState state;

  /// Posição na fila (1 = o próximo).
  final int position;

  /// Quantos estão na fila agora.
  final int queued;
  final Duration waited;

  /// Quanto falta para a mesa começar completada por bots.
  final Duration botFillIn;

  /// Sala da partida encontrada (quando [state] é `matched`).
  final String? roomId;

  bool get searching => state == QueueState.searching;
}

/// Salas abertas e fila de partida pública.
///
/// Para jogar a partida encontrada, crie o [OnlineGameController] com a
/// mesma [OnlineConnection] (`OnlineGameController.shared`) antes de entrar
/// na fila: o servidor já coloca o socket na sala e manda o estado.
class LobbyService extends ChangeNotifier {
  LobbyService(this.connection) {
    _unlisteners = [
      connection.listen('rooms_update', _onRooms),
      connection.listen('queue_status', _onQueueStatus),
      connection.listen('match_found', _onMatchFound),
    ];
    _connSub = connection.onConnected.listen((_) {
      // Reconectou: a fila do servidor esqueceu o socket antigo.
      if (_watching) _requestWatch();
      if (_queue.state == QueueState.searching) _setQueue(QueueStatus.idle);
    });
  }

  final OnlineConnection connection;
  late final List<VoidCallback> _unlisteners;
  late final StreamSubscription<void> _connSub;
  final _queueCtrl = StreamController<QueueStatus>.broadcast();
  final _matchCtrl = StreamController<String>.broadcast();

  List<OpenRoom> _rooms = const [];
  bool _watching = false;
  QueueStatus _queue = QueueStatus.idle;
  String? _lastError;

  /// Salas públicas abertas (sem senha, não iniciadas, com lugar).
  List<OpenRoom> get rooms => _rooms;

  /// Recebendo atualizações da lista em tempo real.
  bool get watching => _watching;

  QueueStatus get queueStatus => _queue;

  /// Cada mudança da fila (procurando, posição, encontrada, parada).
  Stream<QueueStatus> get queueStatusStream => _queueCtrl.stream;

  /// Código da sala de cada partida encontrada pela fila.
  Stream<String> get matchFound => _matchCtrl.stream;

  String? get lastError => _lastError;

  /// Busca a lista uma vez.
  Future<List<OpenRoom>> refreshRooms() async {
    final reply = await connection.request('rooms_list');
    if (reply.ok) _setRooms(reply.data['rooms']);
    return _rooms;
  }

  /// Passa a receber a lista sempre que ela mudar.
  Future<ServerReply> watchRooms() async {
    _watching = true;
    return _requestWatch();
  }

  Future<ServerReply> unwatchRooms() async {
    _watching = false;
    return connection.request('rooms_unwatch');
  }

  Future<ServerReply> _requestWatch() async {
    final reply = await connection.request('rooms_watch');
    if (reply.ok) _setRooms(reply.data['rooms']);
    return reply;
  }

  /// Entra na fila de partida pública. Sai da sala atual, se houver.
  /// [playerName] só é usado por convidados (logado vale o nome da conta).
  Future<ServerReply> joinQueue({String? playerName}) async {
    if (!await connection.connect()) {
      return _fail(
        const ServerReply.failure('OFFLINE', 'Sem conexão com o servidor.'),
      );
    }
    // Esquece a partida anterior (o push de "encontrada" pode vir antes do ack).
    _queue = QueueStatus.idle;
    final reply = await connection.request('queue_join', {
      'playerName': ?playerName,
    });
    if (!reply.ok) return _fail(reply);
    _lastError = null;
    final status = QueueStatus.fromJson(reply.data['status']);
    // Um push de "encontrada" pode ter chegado antes do ack.
    if (_queue.state != QueueState.matched ||
        status.state == QueueState.matched) {
      _setQueue(status);
    }
    return reply;
  }

  Future<ServerReply> leaveQueue() async {
    final reply = await connection.request('queue_leave');
    _setQueue(QueueStatus.idle);
    return reply;
  }

  /// Volta a fila para "parado" depois de tratar a partida encontrada.
  void resetQueue() => _setQueue(QueueStatus.idle);

  void _onRooms(dynamic data) {
    if (data is Map) _setRooms(data['rooms']);
  }

  void _onQueueStatus(dynamic data) => _setQueue(QueueStatus.fromJson(data));

  void _onMatchFound(dynamic data) {
    final id = data is Map ? data['roomId'] : null;
    if (id is! String) return;
    _setQueue(QueueStatus(state: QueueState.matched, roomId: id));
    _matchCtrl.add(id);
  }

  void _setRooms(Object? list) {
    _rooms = list is List
        ? list.map(OpenRoom.fromJson).whereType<OpenRoom>().toList()
        : const [];
    notifyListeners();
  }

  void _setQueue(QueueStatus s) {
    // Depois de encontrada, só "parado" explícito tira desse estado.
    if (_queue.state == QueueState.matched && s.state == QueueState.searching) {
      return;
    }
    _queue = s;
    if (!_queueCtrl.isClosed) _queueCtrl.add(s);
    notifyListeners();
  }

  ServerReply _fail(ServerReply r) {
    _lastError = r.message;
    notifyListeners();
    return r;
  }

  @override
  void dispose() {
    for (final u in _unlisteners) {
      u();
    }
    _connSub.cancel();
    _queueCtrl.close();
    _matchCtrl.close();
    super.dispose();
  }
}
