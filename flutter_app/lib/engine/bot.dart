import 'dart:math';

import 'coup_engine.dart';
import 'models.dart';

class _OpponentMemory {
  List<Role> knownRoles = [];
  final Set<Role> provenRoles = {};
  int bluffsCaught = 0;
}

class _Tuning {
  const _Tuning(
    this.challengeRate,
    this.blockRate,
    this.bluffRate,
    this.aggression,
    this.greed,
  );
  final double challengeRate;
  final double blockRate;
  final double bluffRate;
  final double aggression;
  final double greed;
}

const _tunings = {
  BotPersonality.cautious: _Tuning(0.12, 0.55, 0.08, 0.2, 0.65),
  BotPersonality.tyrant: _Tuning(0.25, 0.55, 0.28, 0.75, 0.3),
  BotPersonality.bluffer: _Tuning(0.55, 0.65, 0.6, 0.5, 0.4),
  BotPersonality.balanced: _Tuning(0.3, 0.6, 0.25, 0.45, 0.5),
};

class BotResponse {
  const BotResponse(this.type, [this.role]);
  final ResponseType type;
  final Role? role;
}

/// IA dos bots (porta de `client/engine/BotManager.ts`), com memória
/// por partida do que cada bot observou (cartas provadas, blefes pegos).
class BotBrain {
  BotBrain(this.engine, {Random? random}) : _rng = random ?? Random();

  final CoupEngine engine;
  final Random _rng;
  final Map<String, Map<String, _OpponentMemory>> _memory = {};
  final Map<String, int> _lastSeenReveal = {};

  GameState get _s => engine.state;

  double _r() => _rng.nextDouble();

  _OpponentMemory _opp(String botId, String oppId) => _memory
      .putIfAbsent(botId, () => {})
      .putIfAbsent(oppId, _OpponentMemory.new);

  void _observe(String botId) {
    for (final p in _s.players) {
      if (p.id == botId) continue;
      _opp(botId, p.id).knownRoles = p.cards
          .where((c) => c.isFlipped)
          .map((c) => c.role)
          .toList();
    }
    final reveal = _s.lastReveal;
    if (reveal != null && reveal.stamp != _lastSeenReveal[botId]) {
      _lastSeenReveal[botId] = reveal.stamp;
      if (reveal.playerId != botId) {
        final o = _opp(botId, reveal.playerId);
        if (reveal.proven) {
          o.provenRoles.add(reveal.role);
        } else {
          o.bluffsCaught++;
        }
      }
    }
  }

  _Tuning _tuning(String botId) =>
      _tunings[_s.playerById(botId)?.personality ?? BotPersonality.balanced]!;

  GameAction decideAction(String botId) {
    _observe(botId);
    final bot = _s.playerById(botId)!;
    final t = _tuning(botId);
    final mine = bot.aliveRoles;
    bool has(Role r) => mine.contains(r);

    if (bot.coins >= 10) {
      final tgt = _threateningTarget(botId);
      if (tgt != null) {
        return GameAction(type: ActionType.coup, source: botId, target: tgt);
      }
    }
    if (bot.coins >= 7 && _r() < t.aggression * 0.6) {
      final tgt = _threateningTarget(botId);
      if (tgt != null) {
        return GameAction(type: ActionType.coup, source: botId, target: tgt);
      }
    }
    if (bot.coins >= 3) {
      final wantKill = has(Role.assassin) || _r() < t.bluffRate;
      if (wantKill && _r() < t.aggression) {
        final tgt = _threateningTarget(botId);
        if (tgt != null) {
          return GameAction(
            type: ActionType.assassinate,
            source: botId,
            target: tgt,
          );
        }
      }
    }
    final wantsTax = has(Role.duke) || _r() < t.bluffRate * 0.8;
    if (wantsTax && _r() < t.greed * 0.8) {
      return GameAction(type: ActionType.tax, source: botId);
    }
    final stealTarget = _stealTarget(botId);
    if (stealTarget != null) {
      final wantsSteal = has(Role.captain) || _r() < t.bluffRate * 0.7;
      if (wantsSteal && _r() < 0.4 + t.aggression * 0.4) {
        return GameAction(
          type: ActionType.steal,
          source: botId,
          target: stealTarget,
        );
      }
    }
    if ((has(Role.ambassador) || _r() < t.bluffRate * 0.3) && _r() < 0.25) {
      return GameAction(type: ActionType.exchange, source: botId);
    }
    if (_r() < t.greed * 0.5) {
      return GameAction(type: ActionType.foreignAid, source: botId);
    }
    return GameAction(type: ActionType.income, source: botId);
  }

  BotResponse decideResponse(String botId) {
    _observe(botId);
    final action = _s.currentAction;
    if (action == null) return const BotResponse(ResponseType.pass);
    final t = _tuning(botId);
    final mine = _s.playerById(botId)?.aliveRoles ?? const <Role>[];

    if (_s.phase == Phase.block) {
      final pb = _s.pendingBlock;
      if (pb != null) {
        final o = _opp(botId, pb.blockerId);
        if (o.provenRoles.contains(pb.role)) {
          return const BotResponse(ResponseType.pass);
        }
        final knowsNot =
            !o.knownRoles.contains(pb.role) && o.knownRoles.isNotEmpty;
        final rate =
            t.challengeRate +
            (knowsNot ? 0.25 : 0) +
            _impossibleBonus(pb.role, mine);
        return _r() < rate
            ? const BotResponse(ResponseType.challenge)
            : const BotResponse(ResponseType.pass);
      }

      final isTarget = action.target == botId;
      final canBlock =
          action.type == ActionType.foreignAid ||
          ((action.type == ActionType.steal ||
                  action.type == ActionType.assassinate) &&
              isTarget);
      if (!canBlock) return const BotResponse(ResponseType.pass);

      switch (action.type) {
        case ActionType.assassinate:
          if (mine.contains(Role.contessa) || _r() < 0.5 + t.bluffRate * 0.5) {
            return const BotResponse(ResponseType.block, Role.contessa);
          }
        case ActionType.steal:
          if (mine.contains(Role.captain)) {
            return const BotResponse(ResponseType.block, Role.captain);
          }
          if (mine.contains(Role.ambassador)) {
            return const BotResponse(ResponseType.block, Role.ambassador);
          }
          if (_r() < t.bluffRate) {
            return BotResponse(
              ResponseType.block,
              _r() < 0.5 ? Role.captain : Role.ambassador,
            );
          }
        case ActionType.foreignAid:
          if (mine.contains(Role.duke) && _r() < t.blockRate) {
            return const BotResponse(ResponseType.block, Role.duke);
          }
          if (_r() < t.bluffRate * 0.8) {
            return const BotResponse(ResponseType.block, Role.duke);
          }
        default:
          break;
      }
      return const BotResponse(ResponseType.pass);
    }

    if (_s.phase == Phase.challenge) {
      final claim = CoupEngine.requiredRole(action.type);
      if (claim == null) return const BotResponse(ResponseType.pass);
      final o = _opp(botId, action.source);
      if (o.provenRoles.contains(claim)) {
        return const BotResponse(ResponseType.pass);
      }
      var rate = t.challengeRate + _impossibleBonus(claim, mine);
      rate += min(0.2, o.bluffsCaught * 0.08);
      // Desafiar quando eu mesmo sou o alvo de um assassinato vale mais.
      if (action.type == ActionType.assassinate && action.target == botId) {
        rate += 0.1;
      }
      return _r() < rate
          ? const BotResponse(ResponseType.challenge)
          : const BotResponse(ResponseType.pass);
    }
    return const BotResponse(ResponseType.pass);
  }

  /// Aumenta a chance de desafiar quando as 3 cópias de [role] já estão
  /// visíveis (mortas na mesa ou na minha mão).
  double _impossibleBonus(Role role, List<Role> mine) {
    var seen = 0;
    for (final p in _s.players) {
      seen += p.cards.where((c) => c.isFlipped && c.role == role).length;
    }
    final remaining = 3 - seen - mine.where((r) => r == role).length;
    if (remaining <= 0) return 0.9;
    if (remaining == 1) return 0.15;
    return 0;
  }

  List<Role> decideExchange(
    String botId,
    List<Role> current,
    List<Role> drawn,
  ) {
    const priority = [
      Role.duke,
      Role.captain,
      Role.contessa,
      Role.assassin,
      Role.ambassador,
    ];
    final all = [...current, ...drawn]
      ..sort((a, b) => priority.indexOf(a).compareTo(priority.indexOf(b)));
    // Evita ficar com duas cartas iguais quando há alternativa.
    final kept = <Role>[];
    for (final r in all) {
      if (kept.length == current.length) break;
      if (!kept.contains(r)) kept.add(r);
    }
    for (final r in all) {
      if (kept.length == current.length) break;
      final countAll = all.where((x) => x == r).length;
      final countKept = kept.where((x) => x == r).length;
      if (countKept < countAll) kept.add(r);
    }
    return kept;
  }

  Role decideCardToLose(String botId) {
    const priority = [
      Role.ambassador,
      Role.contessa,
      Role.assassin,
      Role.captain,
      Role.duke,
    ];
    final alive = _s.playerById(botId)!.aliveRoles
      ..sort((a, b) => priority.indexOf(a).compareTo(priority.indexOf(b)));
    return alive.first;
  }

  String? _threateningTarget(String botId) {
    final alive = _s.players.where((p) => p.id != botId && p.isAlive).toList();
    if (alive.isEmpty) return null;
    alive.sort((a, b) {
      final d = a.influence - b.influence;
      return d != 0 ? d : b.coins - a.coins;
    });
    return alive.first.id;
  }

  String? _stealTarget(String botId) {
    final alive = _s.players
        .where((p) => p.id != botId && p.isAlive && p.coins >= 1)
        .toList();
    if (alive.isEmpty) return null;
    alive.sort((a, b) => b.coins - a.coins);
    return alive.first.id;
  }

  /// Faz o próximo movimento pendente de [playerId], se for a vez dele.
  /// Retorna `true` se algo foi jogado.
  bool playFor(String playerId) {
    final s = _s;
    switch (s.phase) {
      case Phase.action:
        if (s.currentPlayer?.id != playerId) return false;
        var a = decideAction(playerId);
        if (!engine.validateAction(playerId, a).ok) {
          a = GameAction(type: ActionType.income, source: playerId);
        }
        engine.handleAction(playerId, a);
        return true;
      case Phase.challenge:
      case Phase.block:
        if (s.waitingFor?.id != playerId) return false;
        final r = decideResponse(playerId);
        engine.handleResponse(playerId, r.type, r.role);
        return true;
      case Phase.losingInfluence:
        if (s.losingInfluenceId != playerId) return false;
        engine.handleFlip(playerId, decideCardToLose(playerId));
        return true;
      case Phase.exchanging:
        if (s.waitingFor?.id != playerId) return false;
        final me = s.playerById(playerId)!;
        engine.handleExchangeChoice(
          playerId,
          decideExchange(playerId, me.aliveRoles, s.exchangingCards ?? []),
        );
        return true;
      case Phase.reveal:
      case Phase.gameOver:
        return false;
    }
  }

  /// Id do jogador de quem o motor está esperando uma decisão agora.
  static String? pendingActor(GameState s) => switch (s.phase) {
    Phase.action => s.currentPlayer?.id,
    Phase.challenge || Phase.block || Phase.exchanging => s.waitingFor?.id,
    Phase.losingInfluence => s.losingInfluenceId,
    _ => null,
  };
}
