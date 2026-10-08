import 'package:flutter/foundation.dart';

import '../engine/house_rules.dart';
import '../engine/models.dart';

/// Contrato comum entre partida offline (motor local + bots) e online
/// (servidor socket.io). A UI só conversa com esta interface.
abstract class GameController extends ChangeNotifier {
  /// Estado atual visto por este jogador (online: cartas alheias ocultas).
  GameState? get state;

  /// Id do jogador local.
  String get myId;

  /// Segundos restantes para o jogador local decidir (null = sem relógio).
  int? get turnTimer => null;

  /// Duração total do relógio de decisão (para a barra de progresso).
  int get turnTimerTotal => 30;

  /// Verdadeiro enquanto a mesa "respira" entre jogadas (inputs travados).
  bool get busy => false;

  bool get isOnline;

  /// Código da sala (online).
  String? get roomCode => null;

  /// Já começou a partida (fora do lobby).
  bool get started;

  /// Mensagem de erro/aviso pendente para a UI exibir uma vez.
  String? takeNotice() => null;

  void sendAction(GameAction action);
  void sendResponse(ResponseType response, [Role? role]);
  void selectInfluence(Role role);
  void confirmExchange(List<Role> kept);

  /// Reinicia com os mesmos jogadores (offline) ou volta ao lobby (online).
  void playAgain();

  /// Sai da partida e libera recursos.
  void leave();

  Player? get me => state?.playerById(myId);

  /// Regras da partida (campanha); online é sempre o Coup oficial.
  HouseRules get rules => HouseRules.standard;

  /// Cartas dos rivais que o jogador local pode ver (bênção Olho Clínico).
  Map<String, Role> get peeks => const {};

  /// De quem o jogo espera uma decisão agora.
  String? get pendingActorId {
    final s = state;
    if (s == null || !started) return null;
    return switch (s.phase) {
      Phase.action => s.currentPlayer?.id,
      Phase.challenge || Phase.block || Phase.exchanging => s.waitingFor?.id,
      Phase.losingInfluence => s.losingInfluenceId,
      _ => null,
    };
  }

  bool get isMyDecision => !busy && pendingActorId == myId;
}
