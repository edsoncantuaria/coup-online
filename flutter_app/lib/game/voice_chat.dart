import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'online_game_controller.dart';

/// Servidores ICE. STUN público resolve a maioria das redes domésticas; para
/// redes com NAT restrito (4G, empresas) configure um TURN via
/// `--dart-define=COUP_TURN_URL=turn:host:3478 COUP_TURN_USER=... COUP_TURN_PASS=...`.
const _turnUrl = String.fromEnvironment('COUP_TURN_URL');
const _turnUser = String.fromEnvironment('COUP_TURN_USER');
const _turnPass = String.fromEnvironment('COUP_TURN_PASS');

Map<String, dynamic> get _rtcConfig => {
  'iceServers': [
    {
      'urls': ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
    if (_turnUrl.isNotEmpty)
      {'urls': _turnUrl, 'username': _turnUser, 'credential': _turnPass},
  ],
  'sdpSemantics': 'unified-plan',
};

/// Chat de voz da sala: malha WebRTC só de áudio, um par por jogador.
/// O servidor apenas repassa ofertas, respostas e candidatos ICE.
class VoiceChat extends ChangeNotifier {
  VoiceChat(this.game) {
    final s = game.socket;
    s?.on('voice_state', _onState);
    s?.on('voice_peers', _onPeers);
    s?.on('voice_signal', _onSignal);
  }

  final OnlineGameController game;

  MediaStream? _local;
  final Map<String, RTCPeerConnection> _pcs = {};
  final Map<String, RTCVideoRenderer> _players = {};
  final Map<String, List<RTCIceCandidate>> _pendingIce = {};

  /// Membros do chat de voz da sala → microfone mudo?
  Map<String, bool> members = {};
  bool joining = false;
  bool _disposed = false;
  String? error;

  bool get joined => _local != null;
  bool get muted => members[game.myId] ?? false;

  /// `null` se o jogador não está na voz; senão, se está mudo.
  bool? voiceOf(String playerId) => members[playerId];

  Future<void> join() async {
    if (joined || joining) return;
    joining = true;
    error = null;
    _notify();
    try {
      _local = await navigator.mediaDevices.getUserMedia({
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
        'video': false,
      });
      game.socket?.emit('voice_join');
    } catch (e) {
      error = 'Não foi possível usar o microfone.';
      _local = null;
    }
    joining = false;
    _notify();
  }

  void toggleMute() {
    final local = _local;
    if (local == null) return;
    final next = !muted;
    for (final t in local.getAudioTracks()) {
      t.enabled = !next;
    }
    members = {...members, game.myId: next};
    game.socket?.emit('voice_mute', {'muted': next});
    _notify();
  }

  Future<void> leave() async {
    if (!joined) return;
    game.socket?.emit('voice_leave');
    await _teardown();
    _notify();
  }

  Future<void> _teardown() async {
    for (final id in _pcs.keys.toList()) {
      await _closePeer(id);
    }
    for (final t in _local?.getTracks() ?? <MediaStreamTrack>[]) {
      await t.stop();
    }
    await _local?.dispose();
    _local = null;
  }

  // ------------------------------------------------------------ signaling

  void _onState(dynamic data) {
    if (data is! Map) return;
    final list = data['members'];
    if (list is! List) return;
    members = {
      for (final m in list)
        if (m is Map && m['id'] is String)
          m['id'] as String: m['muted'] == true,
    };
    // Fecha conexões com quem saiu.
    for (final id in _pcs.keys.toList()) {
      if (!members.containsKey(id)) _closePeer(id);
    }
    _notify();
  }

  Future<void> _onPeers(dynamic data) async {
    if (!joined || data is! Map) return;
    final peers = data['peers'];
    if (peers is! List) return;
    for (final id in peers.whereType<String>()) {
      final pc = await _peer(id);
      final offer = await pc.createOffer({'offerToReceiveAudio': true});
      await pc.setLocalDescription(offer);
      _send(id, {'type': 'offer', 'sdp': offer.sdp});
    }
  }

  Future<void> _onSignal(dynamic data) async {
    if (!joined || data is! Map) return;
    final from = data['from'];
    final msg = data['data'];
    if (from is! String || msg is! Map) return;
    try {
      switch (msg['type']) {
        case 'offer':
          final pc = await _peer(from);
          await pc.setRemoteDescription(
            RTCSessionDescription(msg['sdp'] as String?, 'offer'),
          );
          await _flushIce(from);
          final answer = await pc.createAnswer({'offerToReceiveAudio': true});
          await pc.setLocalDescription(answer);
          _send(from, {'type': 'answer', 'sdp': answer.sdp});
        case 'answer':
          final pc = _pcs[from];
          if (pc == null) return;
          await pc.setRemoteDescription(
            RTCSessionDescription(msg['sdp'] as String?, 'answer'),
          );
          await _flushIce(from);
        case 'candidate':
          final c = RTCIceCandidate(
            msg['candidate'] as String?,
            msg['sdpMid'] as String?,
            (msg['sdpMLineIndex'] as num?)?.toInt(),
          );
          final pc = _pcs[from];
          if (pc == null || await pc.getRemoteDescription() == null) {
            (_pendingIce[from] ??= []).add(c);
          } else {
            await pc.addCandidate(c);
          }
      }
    } catch (e) {
      debugPrint('voice: falha ao tratar sinal de $from: $e');
    }
  }

  Future<void> _flushIce(String id) async {
    final pc = _pcs[id];
    final queued = _pendingIce.remove(id);
    if (pc == null || queued == null) return;
    for (final c in queued) {
      await pc.addCandidate(c);
    }
  }

  void _send(String to, Map<String, dynamic> data) =>
      game.socket?.emit('voice_signal', {'to': to, 'data': data});

  Future<RTCPeerConnection> _peer(String id) async {
    final existing = _pcs[id];
    if (existing != null) return existing;
    final pc = await createPeerConnection(_rtcConfig);
    _pcs[id] = pc;
    for (final t in _local?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      await pc.addTrack(t, _local!);
    }
    pc.onIceCandidate = (c) {
      if (c.candidate == null) return;
      _send(id, {
        'type': 'candidate',
        'candidate': c.candidate,
        'sdpMid': c.sdpMid,
        'sdpMLineIndex': c.sdpMLineIndex,
      });
    };
    pc.onTrack = (ev) async {
      if (ev.streams.isEmpty) return;
      // O renderer cuida da reprodução do áudio (no navegador ele cria o
      // elemento <audio>; no celular o áudio sai sozinho).
      final r = _players[id] ?? RTCVideoRenderer();
      if (!_players.containsKey(id)) {
        await r.initialize();
        _players[id] = r;
      }
      r.srcObject = ev.streams.first;
      _notify();
    };
    pc.onConnectionState = (_) => _notify();
    return pc;
  }

  Future<void> _closePeer(String id) async {
    _pendingIce.remove(id);
    final pc = _pcs.remove(id);
    final r = _players.remove(id);
    try {
      r?.srcObject = null;
      await r?.dispose();
      await pc?.close();
    } catch (_) {}
  }

  /// Pares com áudio conectado (para diagnóstico e testes).
  int get connectedPeers => _pcs.values
      .where(
        (pc) =>
            pc.connectionState ==
            RTCPeerConnectionState.RTCPeerConnectionStateConnected,
      )
      .length;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    final s = game.socket;
    s?.off('voice_state', _onState);
    s?.off('voice_peers', _onPeers);
    s?.off('voice_signal', _onSignal);
    if (joined) s?.emit('voice_leave');
    unawaited(_teardown());
    super.dispose();
  }
}
