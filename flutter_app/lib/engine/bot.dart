import 'dart:math';

import 'bot_tracker.dart';
import 'coup_engine.dart';
import 'models.dart';

/// Nível de jogo de um bot.
enum BotSkill {
  /// Joga no instinto: esquece o que viu e às vezes só pega a renda.
  easy('Fácil'),

  /// O bot clássico, com memória do que foi provado na mesa.
  normal('Normal'),

  /// Conta cartas, lembra de cada declaração e pesa riscos antes de agir.
  hard('Difícil');

  const BotSkill(this.label);
  final String label;
}

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
  BotBrain(
    this.engine, {
    Random? random,
    this.defaultSkill = BotSkill.normal,
    Map<String, BotSkill>? skills,
  }) : _rng = random ?? Random(),
       skills = skills ?? {};

  final CoupEngine engine;
  final Random _rng;
  final BotSkill defaultSkill;

  /// Nível por jogador; quem não está aqui joga no [defaultSkill].
  final Map<String, BotSkill> skills;

  /// Memória pública da mesa (declarações, provas, blefes pegos).
  final TableTracker tracker = TableTracker();
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

  BotSkill skillOf(String id) => skills[id] ?? defaultSkill;

  /// Registra o estado atual da mesa. Chame a cada mudança para que nenhuma
  /// declaração passe despercebida.
  void observe() => tracker.observe(_s);

  _Tuning _tuning(String botId) =>
      _tunings[_s.playerById(botId)?.personality ?? BotPersonality.balanced]!;

  GameAction decideAction(String botId) {
    _observe(botId);
    final skill = skillOf(botId);
    if (skill == BotSkill.hard) return _hardAction(botId);
    final bot = _s.playerById(botId)!;
    // O fácil às vezes nem pensa: pega o dinheiro garantido.
    if (skill == BotSkill.easy &&
        bot.coins < engine.rules.coupCostFor(botId) &&
        _r() < 0.4) {
      return GameAction(type: ActionType.income, source: botId);
    }
    final t = _tuning(botId);
    final mine = bot.aliveRoles;
    bool has(Role r) => mine.contains(r);

    final coupCost = engine.rules.coupCostFor(botId);
    // Alvo com assassinato barato (punição "Alvo Marcado") atrai os bots.
    final cheap = _s.players
        .where(
          (p) =>
              p.id != botId &&
              p.isAlive &&
              engine.rules.assassinCost(p.id) < 3 &&
              bot.coins >= engine.rules.assassinCost(p.id),
        )
        .map((p) => p.id)
        .firstOrNull;
    if (cheap != null &&
        bot.coins < coupCost &&
        _r() < 0.35 + t.aggression * 0.4) {
      return GameAction(
        type: ActionType.assassinate,
        source: botId,
        target: cheap,
      );
    }

    if (bot.coins >= 10) {
      final tgt = _threateningTarget(botId);
      if (tgt != null) {
        return GameAction(type: ActionType.coup, source: botId, target: tgt);
      }
    }
    if (bot.coins >= coupCost && _r() < t.aggression * 0.6) {
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
    final skill = skillOf(botId);
    if (skill == BotSkill.hard) return _hardResponse(botId, action);
    final easy = skill == BotSkill.easy;
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
        final spied = _spied(pb.blockerId, pb.role);
        if (spied != null) return BotResponse(spied);
        final rate =
            t.challengeRate +
            (knowsNot ? 0.25 : 0) +
            (easy ? 0 : _impossibleBonus(pb.role, mine)) +
            (easy ? 0 : _incoherence(pb.blockerId, pb.role)) +
            engine.rules.challengeBias(pb.blockerId);
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
          final bluff = easy ? 0.2 : 0.5 + t.bluffRate * 0.5;
          if (mine.contains(Role.contessa) || _r() < bluff) {
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
      final spied = _spied(action.source, claim);
      if (spied != null) return BotResponse(spied);
      var rate =
          t.challengeRate +
          (easy ? 0 : _impossibleBonus(claim, mine)) +
          (easy ? 0 : _incoherence(action.source, claim)) +
          engine.rules.challengeBias(action.source);
      if (!easy) rate += min(0.2, o.bluffsCaught * 0.08);
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

  /// Decisão certeira quando os bots espionaram a carta de [playerId]
  /// (punição "Espiões na Corte"): se ele afirma a carta que sabemos que
  /// tem, acreditamos; se só lhe resta outra carta, desafiamos.
  ResponseType? _spied(String playerId, Role claim) {
    final known = engine.exposed[playerId];
    final p = _s.playerById(playerId);
    if (known == null || p == null || !p.aliveRoles.contains(known)) {
      return null;
    }
    if (claim == known) return ResponseType.pass;
    if (p.influence == 1) return ResponseType.challenge;
    return null;
  }

  /// Leitura leve do nível Normal: quem já declarou mais personagens do que
  /// tem cartas está blefando em algum deles.
  double _incoherence(String playerId, Role claim) {
    final p = _s.playerById(playerId);
    if (p == null) return 0;
    final distinct = {...tracker.of(playerId).claimedRoles, claim}.length;
    return distinct > p.influence ? 0.2 : 0;
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
    // O fácil não pensa em qual carta guardar.
    if (skillOf(botId) == BotSkill.easy) {
      return alive[_rng.nextInt(alive.length)];
    }
    if (skillOf(botId) == BotSkill.hard) {
      // Guarda a carta que já declarou: continua crível nas próximas jogadas.
      final claimed = tracker.of(botId).claimedRoles;
      final unclaimed = alive.where((r) => !claimed.contains(r));
      if (unclaimed.isNotEmpty) return unclaimed.first;
    }
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

  // ---------------------------------------------------------------------
  // Nível Difícil: decide pesando probabilidades em vez de sortear.

  double _pHas(String botId, String playerId, Role role) =>
      tracker.pHas(_s, playerId, role, _s.playerById(botId)!.aliveRoles);

  /// Cópias de [role] que ainda podem estar escondidas com alguém além de mim.
  int _copiesOut(Role role, List<Role> mine) {
    var seen = 0;
    for (final p in _s.players) {
      seen += p.cards.where((c) => c.isFlipped && c.role == role).length;
    }
    return 3 - seen - mine.where((r) => r == role).length;
  }

  /// Quão perigoso é [p] para mim: dinheiro perto do golpe, cartas fortes
  /// declaradas e quantas influências ainda tem.
  double _threat(Player p) {
    final m = tracker.of(p.id);
    final claimed = m.claimedRoles;
    var t = p.coins.toDouble() + p.influence * 2.5;
    if (claimed.contains(Role.duke)) t += 2;
    if (claimed.contains(Role.assassin)) t += 2;
    if (claimed.contains(Role.captain)) t += 1;
    if (p.coins >= engine.rules.coupCostFor(p.id)) t += 4;
    return t;
  }

  List<Player> _rivals(String botId) =>
      _s.players.where((p) => p.id != botId && p.isAlive).toList();

  /// Alvo de golpe: quem me ameaça mais; se alguém está por um fio e é o
  /// último rival, termina o jogo.
  String? _hardCoupTarget(String botId) {
    final rivals = _rivals(botId);
    if (rivals.isEmpty) return null;
    rivals.sort((a, b) => _threat(b).compareTo(_threat(a)));
    return rivals.first.id;
  }

  GameAction _hardAction(String botId) {
    final bot = _s.playerById(botId)!;
    final mine = bot.aliveRoles;
    bool has(Role r) => mine.contains(r);
    final coins = bot.coins;
    final coupCost = engine.rules.coupCostFor(botId);
    final rivals = _rivals(botId);
    GameAction act(ActionType t, [String? target]) =>
        GameAction(type: t, source: botId, target: target);
    bool allowed(ActionType t) => engine.rules.allows(botId, t);
    // Blefe arriscado vale menos quando só me resta uma carta.
    final caution = bot.influence == 1 ? 0.45 : 1.0;
    final myClaims = tracker.of(botId).claimedRoles;
    // Blefe coerente: insistir no que já declarei, sem acumular personagens.
    bool canBluff(Role r) =>
        _copiesOut(r, mine) > 0 &&
        (myClaims.contains(r) || myClaims.length < bot.influence);

    if (coins >= 10 || (coins >= coupCost && _r() < 0.9)) {
      final tgt = _hardCoupTarget(botId);
      if (tgt != null) return act(ActionType.coup, tgt);
    }

    // Assassinato: alvo ameaçador que provavelmente não tem a Condessa.
    if (allowed(ActionType.assassinate)) {
      String? best;
      var bestScore = 0.0;
      for (final p in rivals) {
        if (coins < engine.rules.assassinCost(p.id)) continue;
        final pContessa = _pHas(botId, p.id, Role.contessa);
        var score = (1 - pContessa) * (_threat(p) + (p.influence == 1 ? 4 : 0));
        if (engine.rules.assassinCost(p.id) < 3) score *= 1.5;
        if (score > bestScore) {
          bestScore = score;
          best = p.id;
        }
      }
      if (best != null) {
        final pContessa = _pHas(botId, best, Role.contessa);
        if (has(Role.assassin) && pContessa < 0.55) {
          return act(ActionType.assassinate, best);
        }
        if (!has(Role.assassin) &&
            canBluff(Role.assassin) &&
            pContessa < 0.35 &&
            _r() < 0.3 * caution) {
          return act(ActionType.assassinate, best);
        }
      }
    }

    if (has(Role.duke) && allowed(ActionType.tax)) return act(ActionType.tax);

    // Roubo com Capitão de quem não deve ter como bloquear.
    String? stealFrom() {
      final amount = engine.rules.stealFor(botId);
      String? best;
      var bestScore = 0.0;
      for (final p in rivals) {
        if (p.coins < 1) continue;
        final pBlock = max(
          _pHas(botId, p.id, Role.captain),
          _pHas(botId, p.id, Role.ambassador),
        );
        // Quem já bloqueou ou declarou essas cartas vai bloquear de novo:
        // insistir só gira a mesa em falso.
        final claimed = tracker.of(p.id).claimedRoles;
        if (claimed.contains(Role.captain) ||
            claimed.contains(Role.ambassador)) {
          continue;
        }
        final score =
            min(p.coins, amount) * (1 - pBlock) +
            (p.coins >= engine.rules.coupCostFor(p.id) - 1 ? 1 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = p.id;
        }
      }
      return bestScore >= 1.2 ? best : null;
    }

    if (allowed(ActionType.steal)) {
      final tgt = stealFrom();
      if (tgt != null && has(Role.captain)) return act(ActionType.steal, tgt);
    }

    // Troca quando a mão é fraca (nada que gere dinheiro ou mate).
    final weak = !has(Role.duke) && !has(Role.captain) && !has(Role.assassin);
    if (has(Role.ambassador) && weak && allowed(ActionType.exchange)) {
      return act(ActionType.exchange);
    }

    // Blefes calculados.
    if (allowed(ActionType.tax) &&
        canBluff(Role.duke) &&
        _r() < (myClaims.contains(Role.duke) ? 0.85 : 0.4) * caution) {
      return act(ActionType.tax);
    }
    if (allowed(ActionType.steal) && canBluff(Role.captain)) {
      final tgt = stealFrom();
      if (tgt != null && _r() < 0.35 * caution) {
        return act(ActionType.steal, tgt);
      }
    }

    // Ajuda externa só se ninguém deve ter Duque para bloquear.
    if (allowed(ActionType.foreignAid)) {
      final dukeRisk = rivals.fold<double>(
        0,
        (a, p) => max(a, _pHas(botId, p.id, Role.duke)),
      );
      if (dukeRisk < 0.45) return act(ActionType.foreignAid);
    }
    if (has(Role.ambassador) && allowed(ActionType.exchange) && _r() < 0.3) {
      return act(ActionType.exchange);
    }
    return act(ActionType.income);
  }

  BotResponse _hardResponse(String botId, GameAction action) {
    final me = _s.playerById(botId)!;
    final mine = me.aliveRoles;
    // Perder um desafio custa uma carta; com uma só, custa o jogo.
    final cardValue = me.influence == 1 ? 3.0 : 1.0;
    const pass = BotResponse(ResponseType.pass);
    const challenge = BotResponse(ResponseType.challenge);
    final source = _s.playerById(action.source);
    final rivalsLeft = _rivals(botId).length;

    if (_s.phase == Phase.challenge) {
      final claim = CoupEngine.requiredRole(action.type);
      if (claim == null) return pass;
      final spied = _spied(action.source, claim);
      if (spied != null) return BotResponse(spied);
      final pBluff = 1 - _pHas(botId, action.source, claim);
      final onMe = action.target == botId;
      var value = switch (action.type) {
        ActionType.assassinate when onMe =>
          mine.contains(Role.contessa) ? 0.0 : cardValue,
        ActionType.steal when onMe =>
          mine.contains(Role.captain) || mine.contains(Role.ambassador)
              ? 0.0
              : 0.5,
        ActionType.tax =>
          source != null &&
                  source.coins + 3 >= engine.rules.coupCostFor(source.id)
              ? 0.5
              : 0.15,
        _ => 0.1,
      };
      // Derrubar alguém só me ajuda em parte quando há vários rivais.
      final knock = 1.0 / max(1, rivalsLeft - 1);
      value += knock;
      // Ser assassinado e perder o desafio tira duas cartas de uma vez.
      final lossIfWrong =
          onMe && action.type == ActionType.assassinate && me.influence == 2
          ? 2.5
          : cardValue;
      return pBluff * value > (1 - pBluff) * lossIfWrong ? challenge : pass;
    }

    if (_s.phase != Phase.block) return pass;
    final pb = _s.pendingBlock;
    if (pb != null) {
      final spied = _spied(pb.blockerId, pb.role);
      if (spied != null) return BotResponse(spied);
      final pBluff = 1 - _pHas(botId, pb.blockerId, pb.role);
      if (action.source != botId) {
        return pBluff > 0.8 && me.influence == 2 ? challenge : pass;
      }
      final value = switch (action.type) {
        ActionType.assassinate => 1.5,
        ActionType.steal => 0.6,
        _ => 0.35,
      };
      return pBluff * value > (1 - pBluff) * cardValue ? challenge : pass;
    }

    final onMe = action.target == botId;
    switch (action.type) {
      case ActionType.assassinate when onMe:
        if (mine.contains(Role.contessa)) {
          return const BotResponse(ResponseType.block, Role.contessa);
        }
        // Com uma carta só, não bloquear é morrer: o blefe é obrigatório.
        final pChallenged = _copiesOut(Role.contessa, mine) <= 0 ? 1.0 : 0.4;
        if (me.influence == 1 || _r() > pChallenged + 0.2) {
          return const BotResponse(ResponseType.block, Role.contessa);
        }
      case ActionType.steal when onMe:
        if (mine.contains(Role.captain)) {
          return const BotResponse(ResponseType.block, Role.captain);
        }
        if (mine.contains(Role.ambassador)) {
          return const BotResponse(ResponseType.block, Role.ambassador);
        }
        if (me.coins >= 2 && me.influence == 2 && _r() < 0.3) {
          final claims = tracker.of(botId).claimedRoles;
          return BotResponse(
            ResponseType.block,
            claims.contains(Role.ambassador) ? Role.ambassador : Role.captain,
          );
        }
      case ActionType.foreignAid:
        final dangerous =
            source != null &&
            source.coins + 2 >= engine.rules.coupCostFor(source.id) - 1;
        if (mine.contains(Role.duke) && (dangerous || _r() < 0.6)) {
          return const BotResponse(ResponseType.block, Role.duke);
        }
        if (!mine.contains(Role.duke) &&
            dangerous &&
            me.influence == 2 &&
            tracker.of(botId).claimedRoles.contains(Role.duke) &&
            _r() < 0.5) {
          return const BotResponse(ResponseType.block, Role.duke);
        }
      default:
        break;
    }
    return pass;
  }

  /// Faz o próximo movimento pendente de [playerId], se for a vez dele.
  /// Retorna `true` se algo foi jogado.
  bool playFor(String playerId) {
    observe();
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
