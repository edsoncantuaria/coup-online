import 'dart:async';

import 'package:flutter/foundation.dart';

import 'online_connection.dart';

/// Situação de um amigo, do menos para o mais ocupado.
enum FriendStatus { offline, online, searching, inLobby, inMatch }

FriendStatus _statusFrom(Object? s) => switch (s) {
  'online' => FriendStatus.online,
  'searching' => FriendStatus.searching,
  'in_lobby' => FriendStatus.inLobby,
  'in_match' => FriendStatus.inMatch,
  _ => FriendStatus.offline,
};

/// Uma conta (pedido de amizade, remetente de convite).
@immutable
class FriendRef {
  const FriendRef({required this.userId, required this.username});

  static FriendRef? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['userId'];
    final name = json['username'];
    if (id is! String || name is! String) return null;
    return FriendRef(userId: id, username: name);
  }

  final String userId;
  final String username;
}

/// Amigo com a situação ao vivo.
@immutable
class Friend extends FriendRef {
  const Friend({
    required super.userId,
    required super.username,
    required this.status,
  });

  static Friend? fromJson(Object? json) {
    final ref = FriendRef.fromJson(json);
    if (ref == null) return null;
    return Friend(
      userId: ref.userId,
      username: ref.username,
      status: _statusFrom((json as Map)['status']),
    );
  }

  final FriendStatus status;

  bool get isOnline => status != FriendStatus.offline;
}

/// Convite de um amigo para a sala dele. Entre com
/// `OnlineGameController.joinRoom(code: invite.roomId, ...)`: o convite
/// dispensa a senha da sala.
@immutable
class RoomInvite {
  const RoomInvite({
    required this.roomId,
    required this.roomName,
    required this.from,
    required this.expiresAt,
  });

  static RoomInvite? fromJson(Object? json) {
    if (json is! Map) return null;
    final roomId = json['roomId'];
    final from = FriendRef.fromJson(json['from']);
    if (roomId is! String || from == null) return null;
    final exp = json['expiresAt'];
    return RoomInvite(
      roomId: roomId,
      roomName: '${json['roomName'] ?? ''}',
      from: from,
      expiresAt: exp is num
          ? DateTime.fromMillisecondsSinceEpoch(exp.toInt())
          : DateTime.now().add(const Duration(minutes: 10)),
    );
  }

  final String roomId;
  final String roomName;
  final FriendRef from;
  final DateTime expiresAt;

  bool get expired => DateTime.now().isAfter(expiresAt);
}

/// Motivos de denúncia aceitos pelo servidor.
enum ReportReason {
  voiceAbuse('voice_abuse', 'Abuso no chat de voz'),
  antiGame('anti_game', 'Antijogo');

  const ReportReason(this.wire, this.label);

  /// Valor mandado ao servidor.
  final String wire;

  /// Texto para a UI.
  final String label;
}

/// Amigos (só com conta), convites para sala e denúncias.
class SocialService extends ChangeNotifier {
  SocialService(this.connection) {
    _unlisteners = [
      connection.listen('friends_update', _onFriends),
      connection.listen('friend_request', _onFriendRequest),
      connection.listen('room_invite', _onInvite),
      connection.listen('account_state', _onAccountState),
    ];
  }

  /// Tamanho máximo da observação de uma denúncia.
  static const maxReportNote = 280;

  final OnlineConnection connection;
  late final List<VoidCallback> _unlisteners;
  final _invitesCtrl = StreamController<RoomInvite>.broadcast();
  final _requestsCtrl = StreamController<FriendRef>.broadcast();

  List<Friend> _friends = const [];
  List<FriendRef> _incoming = const [];
  List<FriendRef> _outgoing = const [];
  final List<RoomInvite> _invites = [];

  /// Amigos, os mais ocupados/online primeiro.
  List<Friend> get friends => _friends;

  /// Pedidos de amizade recebidos, aguardando resposta.
  List<FriendRef> get incoming => _incoming;

  /// Pedidos enviados ainda sem resposta.
  List<FriendRef> get outgoing => _outgoing;

  /// Convites recebidos ainda válidos.
  List<RoomInvite> get pendingInvites =>
      _invites.where((i) => !i.expired).toList(growable: false);

  /// Cada convite novo para sala (para um aviso na UI).
  Stream<RoomInvite> get invites => _invitesCtrl.stream;

  /// Cada pedido de amizade novo recebido.
  Stream<FriendRef> get friendRequests => _requestsCtrl.stream;

  /// Busca a lista de amigos e pedidos (exige conta).
  Future<ServerReply> refresh() async {
    final reply = await connection.request('friends_list');
    if (reply.ok) _applyList(reply.data);
    return reply;
  }

  /// Pede amizade por id da conta (ex.: `OnlineGameController.userIdOf`)
  /// ou pelo nome de usuário. `data['result']` é `sent`, `accepted` ou
  /// `already_friends`.
  Future<ServerReply> sendFriendRequest({String? userId, String? username}) {
    assert(userId != null || username != null);
    return connection.request('friend_request', {
      'userId': ?userId,
      'username': ?username,
    });
  }

  Future<ServerReply> respond(String userId, {required bool accept}) =>
      connection.request('friend_respond', {
        'userId': userId,
        'accept': accept,
      });

  /// Desfaz a amizade ou cancela um pedido enviado.
  Future<ServerReply> removeFriend(String userId) =>
      connection.request('friend_remove', {'userId': userId});

  /// Convida um amigo online para a sala (lobby) em que você está.
  Future<ServerReply> inviteToRoom(String userId) =>
      connection.request('room_invite', {'userId': userId});

  /// Tira um convite da lista (aceito ou ignorado).
  void dismissInvite(RoomInvite invite) {
    _invites.remove(invite);
    notifyListeners();
  }

  /// Denuncia alguém da sua mesa atual ou de uma partida recente.
  /// [playerId] é o id do jogador na mesa (`Player.id`).
  Future<ServerReply> report({
    required String playerId,
    required ReportReason reason,
    String? note,
  }) {
    final n = note?.trim();
    return connection.request('report_player', {
      'playerId': playerId,
      'reason': reason.wire,
      if (n != null && n.isNotEmpty)
        'note': n.length > maxReportNote ? n.substring(0, maxReportNote) : n,
    });
  }

  void _applyList(Map data) {
    _friends = _parse(data['friends'], Friend.fromJson);
    _incoming = _parse(data['incoming'], FriendRef.fromJson);
    _outgoing = _parse(data['outgoing'], FriendRef.fromJson);
    notifyListeners();
  }

  static List<T> _parse<T>(Object? list, T? Function(Object?) f) =>
      list is List ? list.map(f).whereType<T>().toList() : <T>[];

  void _onFriends(dynamic data) {
    if (data is Map) _applyList(data);
  }

  void _onFriendRequest(dynamic data) {
    final from = data is Map ? FriendRef.fromJson(data['from']) : null;
    if (from != null && !_requestsCtrl.isClosed) _requestsCtrl.add(from);
  }

  void _onInvite(dynamic data) {
    final inv = RoomInvite.fromJson(data);
    if (inv == null) return;
    _invites
      ..removeWhere((i) => i.expired || i.roomId == inv.roomId)
      ..add(inv);
    if (!_invitesCtrl.isClosed) _invitesCtrl.add(inv);
    notifyListeners();
  }

  void _onAccountState(dynamic data) {
    // Saiu da conta: limpa tudo que era dela.
    if (data is Map && data['user'] == null) {
      _friends = const [];
      _incoming = const [];
      _outgoing = const [];
      _invites.clear();
      notifyListeners();
    }
  }

  @override
  void dispose() {
    for (final u in _unlisteners) {
      u();
    }
    _invitesCtrl.close();
    _requestsCtrl.close();
    super.dispose();
  }
}

/// Parse exposto para testes.
@visibleForTesting
FriendStatus friendStatusFromWire(Object? s) => _statusFrom(s);
