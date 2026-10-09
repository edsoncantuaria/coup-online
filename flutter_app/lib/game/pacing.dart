import 'dart:math';

import '../engine/models.dart';

/// Ritmo da mesa: quanto dura cada cena, quanto um bot pensa e o relógio de
/// quem joga. O servidor (`server/src/socket/RoomManager.ts`) usa os mesmos
/// números para segurar a mesa enquanto o app mostra as cenas.
abstract final class Pacing {
  /// Congelamento do desafio ("Provado." / "Blefe.") e da perda de influência.
  static const freeze = Duration(milliseconds: 3400);

  /// Animação da carta quando uma ação resolve.
  static const effect = Duration(milliseconds: 2600);

  /// Animação de quem declara um bloqueio.
  static const block = Duration(milliseconds: 2400);

  /// Tempo de cada decisão do jogador.
  static const turnSeconds = 30;

  /// Estouros de tempo seguidos que eliminam o jogador.
  static const idleStrikes = 3;

  /// Quanto um bot pensa antes de agir: escolher a ação demora, reagir é
  /// rápido (as reações são pedidas uma pessoa por vez).
  static Duration think(Phase phase, Random rng) {
    final (min, max) = switch (phase) {
      Phase.action => (5000, 10000),
      Phase.exchanging => (2000, 3500),
      Phase.losingInfluence => (1500, 2500),
      _ => (1500, 3000),
    };
    return Duration(milliseconds: min + rng.nextInt(max - min + 1));
  }
}

/// Lembra os eventos já mostrados e diz quanto segurar a mesa para o app
/// exibir o que acabou de acontecer.
class SceneHold {
  int? _reveal;
  int? _loss;
  int? _resolved;
  String? _block;

  /// Esquece tudo menos o estado atual (início de partida).
  void reset(GameState s) => next(s);

  Duration next(GameState s) {
    final pb = s.pendingBlock;
    final block = pb == null
        ? null
        : '${s.turnIndex}-${pb.blockerId}-${pb.role.name}';
    var freeze = Duration.zero;
    if (s.lastReveal != null && s.lastReveal!.stamp != _reveal) {
      freeze += Pacing.freeze;
    }
    if (s.lastLoss != null && s.lastLoss!.stamp != _loss) {
      freeze += Pacing.freeze;
    }
    var effect = Duration.zero;
    if (s.lastResolved != null && s.lastResolved!.stamp != _resolved) {
      effect = Pacing.effect;
    }
    if (block != null && block != _block && effect < Pacing.block) {
      effect = Pacing.block;
    }
    _reveal = s.lastReveal?.stamp;
    _loss = s.lastLoss?.stamp;
    _resolved = s.lastResolved?.stamp;
    _block = block;
    return freeze > effect ? freeze : effect;
  }
}
