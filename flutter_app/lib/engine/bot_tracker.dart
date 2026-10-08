import 'dart:math';

import 'models.dart';

/// O que cada jogador já declarou e como se saiu nos desafios.
class PlayerModel {
  /// Quantas vezes declarou ter cada personagem desde a última troca de mão.
  final Map<Role, int> claims = {};
  int bluffsCaught = 0;
  int proven = 0;

  Set<Role> get claimedRoles => {
    for (final e in claims.entries)
      if (e.value > 0) e.key,
  };

  /// Tendência a blefar estimada pelo histórico (começa em ~25%).
  double get bluffTendency =>
      ((bluffsCaught + 1) / (bluffsCaught + proven + 4)).clamp(0.08, 0.85);
}

/// Memória pública da mesa, igual para todos os bots: declarações, provas e
/// blefes pegos. Só usa o que qualquer jogador atento veria.
class TableTracker {
  final Map<String, PlayerModel> players = {};
  GameAction? _action;
  PendingBlock? _block;
  int? _reveal;
  int? _resolved;
  int? _loss;

  PlayerModel of(String id) => players.putIfAbsent(id, PlayerModel.new);

  void observe(GameState s) {
    // Cada declaração conta uma vez: o motor cria um objeto novo por jogada.
    final a = s.currentAction;
    if (a != null && !identical(a, _action)) {
      _action = a;
      final role = _roleOf(a.type);
      if (role != null) {
        of(a.source).claims.update(role, (v) => v + 1, ifAbsent: () => 1);
      }
    }
    final pb = s.pendingBlock;
    if (pb != null && !identical(pb, _block)) {
      _block = pb;
      of(pb.blockerId).claims.update(pb.role, (v) => v + 1, ifAbsent: () => 1);
    }
    final r = s.lastReveal;
    if (r != null && r.stamp != _reveal) {
      _reveal = r.stamp;
      final m = of(r.playerId);
      if (r.proven) {
        m.proven++;
      } else {
        m.bluffsCaught++;
      }
      // Provou: a carta voltou ao baralho e ele comprou outra. Blefou: não
      // tinha. Nos dois casos a declaração deixa de valer.
      m.claims.remove(r.role);
    }
    final l = s.lastLoss;
    if (l != null && l.stamp != _loss) {
      _loss = l.stamp;
      of(l.playerId).claims.remove(l.role);
    }
    final res = s.lastResolved;
    if (res != null && res.stamp != _resolved) {
      _resolved = res.stamp;
      // Trocou de mão: tudo o que declarou antes perde o valor.
      if (res.actionType == ActionType.exchange.wire) {
        of(res.actorId).claims.clear();
      }
    }
  }

  static Role? _roleOf(ActionType t) => switch (t) {
    ActionType.tax => Role.duke,
    ActionType.assassinate => Role.assassin,
    ActionType.steal => Role.captain,
    ActionType.exchange => Role.ambassador,
    _ => null,
  };

  /// Probabilidade de [playerId] realmente ter [role], do ponto de vista de
  /// quem tem a mão [myRoles]. Combina contagem de cartas, o histórico de
  /// blefes e a coerência das declarações.
  double pHas(GameState s, String playerId, Role role, List<Role> myRoles) {
    final p = s.playerById(playerId);
    if (p == null || !p.isAlive) return 0;
    var visible = 0;
    var hiddenElsewhere = s.deckCount;
    for (final q in s.players) {
      visible += q.cards.where((c) => c.isFlipped && c.role == role).length;
      if (q.id != playerId) {
        hiddenElsewhere += q.cards.where((c) => !c.isFlipped).length;
      }
    }
    final mine = myRoles.where((r) => r == role).length;
    final copies = 3 - visible - mine;
    if (copies <= 0) return 0;

    // Chance a priori de ter ao menos uma cópia entre k cartas ocultas.
    final k = p.influence;
    // Cartas que podem estar com ele: as dele e as que não sei onde estão,
    // sem contar a minha mão (que eu conheço).
    final pool = max(k, hiddenElsewhere + k - myRoles.length);
    var noCopy = 1.0;
    for (var i = 0; i < k; i++) {
      noCopy *= max(0, pool - copies - i) / max(1, pool - i);
    }
    final prior = (1 - noCopy).clamp(0.02, 0.98);

    // Atualiza pela declaração: quem tem a carta sempre pode declarar; quem
    // não tem, declara com a sua tendência a blefar.
    final m = of(playerId);
    final b = m.bluffTendency;
    var odds = prior / (1 - prior) / b;

    // Coerência: já declarou este personagem antes e ninguém derrubou.
    if ((m.claims[role] ?? 0) > 1) odds *= 1.6;
    // Declarou mais personagens diferentes do que tem cartas: algum é blefe.
    final distinct = {...m.claimedRoles, role}.length;
    if (distinct > k) odds *= k / distinct;

    return (odds / (1 + odds)).clamp(0.0, 1.0);
  }
}
