import 'dart:math';

import 'house_rules.dart';
import 'labels.dart';
import 'models.dart';

/// Resultado de [CoupEngine.validateAction].
class ValidationResult {
  const ValidationResult.ok() : reason = null;
  const ValidationResult.fail(this.reason);
  final String? reason;
  bool get ok => reason == null;
}

/// Motor de regras do Coup. Porta fiel de `client/engine/CoupEngine.ts`,
/// para que offline (Dart) e online (Node) sigam exatamente as mesmas regras.
class CoupEngine {
  CoupEngine(String roomId, {Random? random})
    : _rng = random ?? Random(),
      state = GameState(roomId: roomId);

  /// Reidrata a partir de um snapshot (retomar partida / testes).
  factory CoupEngine.hydrate(GameState snapshot, {Random? random}) {
    final e = CoupEngine(
      snapshot.roomId.isEmpty ? 'offline-room' : snapshot.roomId,
      random: random,
    );
    e.state = snapshot.copy();
    e._gameStarted = snapshot.players.any((p) => p.cards.isNotEmpty);
    return e;
  }

  final Random _rng;
  GameState state;
  bool _gameStarted = false;

  /// Variações de regra (campanha). Definir antes de [startGame].
  HouseRules rules = HouseRules.standard;

  /// Escudos restantes por jogador nesta partida.
  final Map<String, int> shieldsLeft = {};

  /// Carta de cada jogador que os bots conhecem desde o início.
  final Map<String, Role> exposed = {};

  final Map<String, int> _ownTurns = {};

  /// Relógio injetável (testes).
  int Function() now = () => DateTime.now().millisecondsSinceEpoch;

  bool get isGameStarted => _gameStarted;

  static const int maxPlayers = 6;
  static const List<Role> allRoles = Role.values;

  void addPlayer(
    String id,
    String name, {
    bool isBot = false,
    BotPersonality? personality,
  }) {
    state.players.add(
      Player(
        id: id,
        name: name,
        isBot: isBot,
        personality: isBot ? (personality ?? BotPersonality.balanced) : null,
      ),
    );
  }

  void startGame() {
    state.deck = _shuffle(_buildDeck());
    for (final p in state.players) {
      p.cards = [
        for (var i = 0; i < rules.cardsAtStart(p.id).clamp(1, 2); i++)
          GameCard(state.deck.removeLast()),
      ];
      p.coins = rules.coinsAtStart(p.id);
      final shields = rules.shields[p.id];
      if (shields != null && shields > 0) shieldsLeft[p.id] = shields;
      if (rules.exposeOneCard.contains(p.id)) {
        exposed[p.id] = p.cards[_rng.nextInt(p.cards.length)].role;
      }
    }
    final first = state.players.indexWhere((p) => p.id == rules.firstPlayerId);
    state.turnIndex = first >= 0 ? first : _rng.nextInt(state.players.length);
    state.phase = Phase.action;
    state.waitingForResponseIndex = null;
    state.responses = {};
    state.matchStats = MatchStats(
      startedAt: now(),
      perPlayer: {for (final p in state.players) p.id: PlayerStats()},
    );
    _addLog('🎲 Sorteio: ${currentPlayer.name} começa o jogo!');
    _gameStarted = true;
  }

  Player get currentPlayer {
    final p = state.currentPlayer;
    if (p == null) throw StateError('Current player not found');
    return p;
  }

  /// Remove jogador (desconexão).
  void disconnectPlayer(String playerId) {
    final idx = state.players.indexWhere((p) => p.id == playerId);
    if (idx == -1) return;
    final label = state.players[idx].name;

    state.players.removeAt(idx);
    _adjustTurnIndexAfterRemove(idx);

    if (!_gameStarted) {
      _addLog('$label saiu da sala.');
      return;
    }

    if (const [
      Phase.challenge,
      Phase.block,
      Phase.reveal,
      Phase.losingInfluence,
      Phase.exchanging,
    ].contains(state.phase)) {
      state.phase = Phase.action;
      state.currentAction = null;
      state.pendingBlock = null;
      state.responses = {};
      state.losingInfluenceId = null;
      state.losingContext = null;
      state.exchangingCards = null;
      state.pendingResolution = null;
      state.waitingForResponseIndex = null;
    }

    _addLog('$label desconectou e foi removido da partida.');

    if (state.players.isEmpty) {
      state.phase = Phase.gameOver;
      state.winner = null;
      _addLog('Sala encerrada.');
      return;
    }
    if (state.players.length == 1) {
      state.phase = Phase.gameOver;
      state.winner = state.players.first.id;
      _addLog('Fim de jogo!');
      return;
    }
    if (state.phase == Phase.gameOver) return;
    if (_checkWinner()) return;
    // Se o turno caiu num eliminado, avança até um vivo.
    var guard = 0;
    while (!currentPlayer.isAlive && guard++ < state.players.length) {
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
    }
    _addLog('Turno de ${currentPlayer.name}');
  }

  /// Mensagem no registro vinda de fora do motor (relógio do turno).
  void note(String message) => _addLog(message);

  /// Elimina quem deixou o tempo acabar vezes demais. Só entre jogadas
  /// (fase de ação), para não cancelar a jogada de mais ninguém.
  void forfeitIdle(String playerId) {
    if (state.phase != Phase.action) return;
    final p = state.playerById(playerId);
    if (p == null || !p.isAlive) return;
    for (final c in p.cards) {
      c.isFlipped = true;
    }
    _addLog('⏰ ${p.name} foi eliminado por ficar sem jogar.');
    final s = _stats(playerId);
    if (s != null) s.eliminatedAtRound ??= state.matchStats!.round;
    if (currentPlayer.id == playerId) {
      nextTurn();
    } else {
      _checkWinner();
    }
  }

  void _adjustTurnIndexAfterRemove(int removedIdx) {
    if (state.players.isEmpty) return;
    if (removedIdx < state.turnIndex) {
      state.turnIndex--;
    } else if (removedIdx == state.turnIndex) {
      state.turnIndex = state.turnIndex % state.players.length;
    }
    if (state.turnIndex >= state.players.length) state.turnIndex = 0;
  }

  // ---------------------------------------------------------------- stats

  PlayerStats? _stats(String? id) =>
      id == null ? null : state.matchStats?.perPlayer[id];

  void _recordCoinChange(String? id, int delta) {
    final s = _stats(id);
    if (s == null) return;
    if (delta > 0) {
      s.coinsGained += delta;
    } else {
      s.coinsLost += -delta;
    }
  }

  void _recordCardLost(String id) {
    final s = _stats(id);
    if (s == null) return;
    s.cardsLost += 1;
    final p = state.playerById(id);
    if (p != null && !p.isAlive) s.eliminatedAtRound = state.matchStats!.round;
  }

  void _setResolved(
    ActionType type,
    String actorId,
    String summary, [
    String? targetId,
  ]) {
    state.lastResolved = ResolvedInfo(
      actionType: type.wire,
      actorId: actorId,
      targetId: targetId,
      summary: summary,
      stamp: now(),
    );
  }

  // ----------------------------------------------------------------- deck

  List<Role> _buildDeck() => [
    for (final r in allRoles) ...[r, r, r],
  ];

  List<Role> _shuffle(List<Role> deck) {
    final d = [...deck];
    for (var i = d.length - 1; i > 0; i--) {
      final j = _rng.nextInt(i + 1);
      final t = d[i];
      d[i] = d[j];
      d[j] = t;
    }
    return d;
  }

  void _addLog(String message) {
    state.logs.add(message);
    if (state.logs.length > 50) state.logs.removeAt(0);
  }

  String _name(String? id) => state.playerById(id)?.name ?? 'Desconhecido';

  // ----------------------------------------------------------- validation

  ValidationResult validateAction(String playerId, GameAction action) {
    if (state.phase != Phase.action) {
      return const ValidationResult.fail('Não é a fase de ação.');
    }
    if (playerId != currentPlayer.id) {
      return const ValidationResult.fail('Não é o seu turno.');
    }
    final player = state.playerById(playerId);
    if (player == null) {
      return const ValidationResult.fail('Jogador não encontrado.');
    }
    if (!player.isAlive) {
      return const ValidationResult.fail('Jogador eliminado não pode agir.');
    }
    if (player.coins >= 10 && action.type != ActionType.coup) {
      return const ValidationResult.fail(
        'Com 10 moedas ou mais o jogador é OBRIGADO a realizar um Golpe de Estado.',
      );
    }
    if (!rules.allows(playerId, action.type)) {
      return ValidationResult.fail(
        '${actionLabel(action.type)} está proibida para você nesta partida.',
      );
    }
    final coupCost = rules.coupCostFor(playerId);
    if (action.type == ActionType.coup && player.coins < coupCost) {
      return ValidationResult.fail('Golpe requer $coupCost moedas.');
    }
    final killCost = rules.assassinCost(action.target);
    if (action.type == ActionType.assassinate && player.coins < killCost) {
      return ValidationResult.fail('Assassinato requer $killCost moedas.');
    }
    if (actionNeedsTarget(action.type)) {
      if (action.target == null) {
        return const ValidationResult.fail('Esta ação exige um alvo.');
      }
      if (action.target == playerId) {
        return const ValidationResult.fail(
          'Você não pode escolher a si mesmo como alvo.',
        );
      }
      final target = state.playerById(action.target);
      if (target == null) {
        return const ValidationResult.fail('Alvo inexistente.');
      }
      if (!target.isAlive) {
        return const ValidationResult.fail('Alvo já está eliminado.');
      }
      if (action.type == ActionType.steal && target.coins < 1) {
        return const ValidationResult.fail(
          'Não é possível roubar de quem não tem moedas.',
        );
      }
    } else if (action.target != null) {
      return const ValidationResult.fail('Esta ação não pode ter alvo.');
    }
    return const ValidationResult.ok();
  }

  static bool actionNeedsTarget(ActionType t) =>
      t == ActionType.coup ||
      t == ActionType.assassinate ||
      t == ActionType.steal;

  static bool isChallengeable(ActionType t) =>
      !(t == ActionType.income ||
          t == ActionType.coup ||
          t == ActionType.foreignAid);

  static bool isBlockable(ActionType t) =>
      t == ActionType.foreignAid ||
      t == ActionType.steal ||
      t == ActionType.assassinate;

  static Role? requiredRole(ActionType t) => switch (t) {
    ActionType.tax => Role.duke,
    ActionType.assassinate => Role.assassin,
    ActionType.steal => Role.captain,
    ActionType.exchange => Role.ambassador,
    _ => null,
  };

  /// Cartas que podem bloquear a ação.
  static List<Role> blockingRoles(ActionType t) => switch (t) {
    ActionType.foreignAid => const [Role.duke],
    ActionType.assassinate => const [Role.contessa],
    ActionType.steal => const [Role.captain, Role.ambassador],
    _ => const [],
  };

  // -------------------------------------------------------------- actions

  void handleAction(String playerId, GameAction action) {
    final check = validateAction(playerId, action);
    if (!check.ok) {
      _addLog('⛔ Ação inválida: ${check.reason}');
      state.lastInvalid = InvalidInfo(reason: check.reason!, stamp: now());
      return;
    }

    final player = state.playerById(playerId)!;
    state.currentAction = action;
    state.pendingBlock = null;
    state.responses = {};

    final actionName = actionLabel(action.type);
    _addLog(
      '📢 ${player.name} declarou $actionName'
      '${action.target != null ? ' contra ${_name(action.target)}' : ''}',
    );
    _stats(player.id)?.actionsTaken += 1;

    // Paga na declaração (regra oficial).
    if (action.type == ActionType.assassinate) {
      final cost = rules.assassinCost(action.target);
      player.coins -= cost;
      _recordCoinChange(player.id, -cost);
    } else if (action.type == ActionType.coup) {
      final cost = rules.coupCostFor(player.id);
      player.coins -= cost;
      _recordCoinChange(player.id, -cost);
    }

    if (isChallengeable(action.type)) {
      _addLog('🔍 Fase de DESAFIO iniciada para $actionName.');
      state.phase = Phase.challenge;
      state.responderCycleStartIndex = state.turnIndex;
      _setNextResponder(state.turnIndex);
    } else if (isBlockable(action.type)) {
      if (action.type == ActionType.foreignAid) {
        _addLog(
          '🛡️ Alguém deseja bloquear a Ajuda Externa de ${_name(action.source)} como Duque?',
        );
      }
      state.phase = Phase.block;
      state.responderCycleStartIndex = state.turnIndex;
      _setNextResponder(state.turnIndex);
    } else {
      resolveAction();
    }
  }

  void _setNextResponder(int startIndex) {
    final n = state.players.length;
    var next = (startIndex + 1) % n;
    var iterations = 0;

    while (iterations < n) {
      if (next == state.responderCycleStartIndex) break;
      final p = state.players[next];
      var skip = false;
      if (state.phase == Phase.challenge) {
        skip = p.id == state.currentAction?.source;
      } else if (state.phase == Phase.block) {
        if (state.pendingBlock != null) {
          skip = p.id == state.pendingBlock!.blockerId;
        } else {
          final a = state.currentAction;
          if (a?.type == ActionType.foreignAid) {
            skip = p.id == a!.source;
          } else {
            skip = p.id != a?.target;
          }
        }
      }
      if (p.isAlive && !skip) {
        state.waitingForResponseIndex = next;
        if (!p.isBot) _addLog('⏳ Vez de ${p.name} responder.');
        return;
      }
      next = (next + 1) % n;
      iterations++;
    }

    state.waitingForResponseIndex = null;
    state.responderCycleStartIndex = null;

    if (state.phase == Phase.challenge) {
      final action = state.currentAction;
      if (action == null) return;
      if (action.target != null && isBlockable(action.type)) {
        final target = state.playerById(action.target);
        if (target != null && target.isAlive) {
          state.phase = Phase.block;
          final ti = state.players.indexOf(target);
          state.waitingForResponseIndex = ti;
          state.responderCycleStartIndex = ti;
          _addLog(
            '🛡️ ${target.name}, deseja bloquear a ação de ${_name(action.source)}?',
          );
          return;
        }
      }
      resolveAction();
    } else if (state.phase == Phase.block) {
      final pb = state.pendingBlock;
      if (pb != null) {
        _addLog(
          '🚫 O bloqueio de ${_name(pb.blockerId)} foi aceito e a ação não surtirá efeito.',
        );
        _stats(pb.blockerId)?.blocksSuccess += 1;
        final blocked = state.currentAction;
        if (blocked != null) {
          _setResolved(
            blocked.type,
            blocked.source,
            'Bloqueio com ${roleLabel(pb.role)} impediu ${actionLabel(blocked.type)}.',
            blocked.target,
          );
        }
        state.currentAction = null;
        state.pendingBlock = null;
        nextTurn();
      } else {
        _addLog('✨ Ninguém bloqueou a ação.');
        state.phase = Phase.action;
        resolveAction();
      }
    }
  }

  void handleResponse(String playerId, ResponseType response, [Role? role]) {
    final wi = state.waitingForResponseIndex;
    if (wi == null) return;
    if (state.phase != Phase.challenge && state.phase != Phase.block) return;
    final expected = state.players[wi];
    if (playerId != expected.id) return;

    state.responses[playerId] = response;

    switch (response) {
      case ResponseType.pass:
      case ResponseType.allow:
        _addLog('📜 ${expected.name} decide PASSAR.');
        _setNextResponder(wi);
      case ResponseType.challenge:
        _addLog('⚔️ ${expected.name} DESAFIOU!');
        _stats(playerId)?.challengesMade += 1;
        _resolveChallenge(playerId);
      case ResponseType.block:
        if (state.phase != Phase.block || state.pendingBlock != null) {
          _addLog(
            '🚫 Tentativa de bloqueio fora de hora por ${expected.name}.',
          );
          return;
        }
        final a = state.currentAction;
        if (a == null) return;
        final isTarget = a.target == playerId;
        final canBlock =
            a.type == ActionType.foreignAid ||
            ((a.type == ActionType.steal || a.type == ActionType.assassinate) &&
                isTarget);
        if (!canBlock) {
          _addLog('🚫 Tentativa de bloqueio inválida por ${expected.name}.');
          return;
        }
        var blockRole = Role.duke;
        if (a.type == ActionType.assassinate) {
          blockRole = Role.contessa;
        } else if (a.type == ActionType.steal) {
          blockRole = (role == Role.ambassador)
              ? Role.ambassador
              : Role.captain;
        }
        _addLog('🛡️ ${expected.name} bloqueia como ${roleLabel(blockRole)}!');
        _stats(playerId)?.blocksMade += 1;
        state.phase = Phase.block;
        state.responses = {};
        state.pendingBlock = PendingBlock(
          blockerId: playerId,
          actionType: a.type.wire,
          role: blockRole,
        );
        state.responderCycleStartIndex = wi;
        _setNextResponder(wi);
    }
  }

  void _resolveChallenge(String challengerId) {
    final action = state.currentAction;
    if (action == null) return;

    final pb = state.pendingBlock;
    final isChallengingBlock = state.phase == Phase.block && pb != null;
    final targetId = isChallengingBlock ? pb.blockerId : action.source;
    final actionRole = isChallengingBlock ? pb.role : requiredRole(action.type);

    if (actionRole == null) {
      state.phase = Phase.action;
      resolveAction();
      return;
    }

    final target = state.playerById(targetId);
    if (target == null) return;

    final cardIndex = target.cards.indexWhere(
      (c) => c.role == actionRole && !c.isFlipped,
    );

    if (cardIndex != -1) {
      _addLog('✅ ${target.name} PROVOU ser ${roleLabel(actionRole)}!');
      _stats(challengerId)?.challengesLost += 1;
      _stats(target.id)?.bluffsSurvived += 1;
      if (isChallengingBlock) _stats(target.id)?.blocksSuccess += 1;
      state.lastReveal = RevealInfo(
        role: actionRole,
        playerName: target.name,
        playerId: target.id,
        proven: true,
        stamp: now(),
      );

      // Devolve a carta provada ao baralho e compra outra, mantendo a posição.
      state.deck.add(actionRole);
      state.deck = _shuffle(state.deck);
      target.cards[cardIndex] = GameCard(state.deck.removeLast());

      if (isChallengingBlock) {
        _addLog(
          '🛡️ O bloqueio teve sucesso! A ação de ${_name(action.source)} foi impedida.',
        );
        state.currentAction = null;
        final waiting = _loseInfluence(
          challengerId,
          PendingResolution.nextTurn,
          LossReason.challengeLost,
          target.id,
        );
        if (!waiting) nextTurn();
      } else {
        final needsBlock = action.target != null && isBlockable(action.type);
        final waiting = _loseInfluence(
          challengerId,
          needsBlock
              ? PendingResolution.allowBlock
              : PendingResolution.resolveAction,
          LossReason.challengeLost,
          target.id,
        );
        if (!waiting) {
          if (needsBlock) {
            _openBlockPhaseForTarget();
          } else {
            resolveAction();
          }
        }
      }
    } else {
      _addLog('❗ ${target.name} estava blefando!');
      _stats(challengerId)?.challengesWon += 1;
      _stats(target.id)?.bluffsCaught += 1;
      if (isChallengingBlock) _stats(target.id)?.blocksFailed += 1;
      state.lastReveal = RevealInfo(
        role: actionRole,
        playerName: target.name,
        playerId: target.id,
        proven: false,
        stamp: now(),
      );

      if (isChallengingBlock) {
        state.phase = Phase.action;
        final isFA = action.type == ActionType.foreignAid;
        final waiting = _loseInfluence(
          targetId,
          isFA
              ? PendingResolution.reopenBlock
              : PendingResolution.resolveAction,
          LossReason.bluffCaught,
          challengerId,
        );
        if (!waiting && state.phase != Phase.gameOver) {
          if (isFA) {
            _addLog(
              '⚔️ O bloqueio de ${target.name} falhou! Outros nobres ainda podem tentar bloquear.',
            );
            state.pendingBlock = null;
            _reopenBlockPhaseEveryone();
          } else {
            _addLog(
              '⚔️ O bloqueio falhou! A ação original de ${_name(action.source)} prosseguirá.',
            );
            resolveAction();
          }
        }
      } else {
        _addLog('❌ A ação de ${target.name} falhou pois era um blefe.');
        state.currentAction = null;
        final waiting = _loseInfluence(
          targetId,
          PendingResolution.nextTurn,
          LossReason.bluffCaught,
          challengerId,
        );
        if (!waiting) nextTurn();
      }
    }
  }

  void resolveAction() {
    if (state.phase == Phase.gameOver) return;
    final action = state.currentAction;
    if (action == null) return;
    state.currentAction = null;

    final source = state.playerById(action.source);
    if (source == null) return;

    void gain(int amount, String summary) {
      source.coins += amount;
      _recordCoinChange(source.id, amount);
      _setResolved(action.type, source.id, summary);
      _addLog('💰 ${source.name} agora tem ${source.coins} moedas.');
    }

    switch (action.type) {
      case ActionType.income:
        gain(1, '${source.name} tomou Renda (+1).');
      case ActionType.tax:
        gain(3, '${source.name} taxou como Duque (+3).');
      case ActionType.foreignAid:
        gain(2, '${source.name} recebeu Ajuda Externa (+2).');
      case ActionType.steal:
        final target = state.playerById(action.target);
        if (target != null) {
          final amount = min(target.coins, rules.stealFor(source.id));
          target.coins -= amount;
          source.coins += amount;
          _recordCoinChange(source.id, amount);
          _recordCoinChange(target.id, -amount);
          _setResolved(
            action.type,
            source.id,
            '${source.name} roubou $amount moeda${amount == 1 ? '' : 's'} de ${target.name}.',
            target.id,
          );
          _addLog(
            '💰 Roubo: ${source.name} (+$amount) | ${target.name} (${target.coins} restantes).',
          );
        }
      case ActionType.assassinate:
      case ActionType.coup:
        final isCoup = action.type == ActionType.coup;
        final tgt = state.playerById(action.target);
        if (tgt == null) {
          nextTurn();
          return;
        }
        _setResolved(
          action.type,
          source.id,
          isCoup
              ? '${source.name} executa Golpe contra ${tgt.name}.'
              : '${source.name} ordena assassinato contra ${tgt.name}.',
          tgt.id,
        );
        final pending = _loseInfluence(
          tgt.id,
          PendingResolution.nextTurn,
          isCoup ? LossReason.coup : LossReason.assassinate,
          source.id,
        );
        if (!pending) nextTurn();
        return;
      case ActionType.exchange:
        _setResolved(
          action.type,
          source.id,
          '${source.name} trocou cartas com a Corte.',
        );
        _handleExchange(source);
        return;
    }
    nextTurn();
  }

  void nextTurn() {
    if (state.phase == Phase.gameOver) return;
    final previous = state.turnIndex;
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
    if (state.matchStats != null &&
        previous == state.players.length - 1 &&
        state.turnIndex == 0) {
      state.matchStats!.round += 1;
    }

    if (_checkWinner()) return;

    while (!state.players[state.turnIndex].isAlive) {
      _addLog(
        '⚙️ Pulando ${state.players[state.turnIndex].name} (Sem influências).',
      );
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
    }

    state.phase = Phase.action;
    state.waitingForResponseIndex = null;
    state.currentAction = null;
    state.pendingBlock = null;
    state.responses = {};
    _addLog('📍 Turno de ${currentPlayer.name}');
    _chargeTurnTax(currentPlayer);
  }

  void _chargeTurnTax(Player p) {
    final every = rules.turnTax[p.id];
    if (every == null || every <= 0) return;
    final n = (_ownTurns[p.id] ?? 0) + 1;
    _ownTurns[p.id] = n;
    if (n % every == 0 && p.coins > 0) {
      p.coins -= 1;
      _recordCoinChange(p.id, -1);
      _addLog('👑 Pedágio Real: ${p.name} pagou 1 moeda à Coroa.');
    }
  }

  bool _checkWinner() {
    if (state.phase == Phase.gameOver) return true;
    final alive = state.players.where((p) => p.isAlive).toList();
    if (alive.length <= 1) {
      state.phase = Phase.gameOver;
      state.winner = alive.isEmpty ? null : alive.first.id;
      state.currentAction = null;
      state.waitingForResponseIndex = null;
      state.matchStats?.endedAt = now();
      _addLog(
        '🏆 FIM DE JOGO! O Reino agora pertence a ${alive.isEmpty ? 'ninguém' : alive.first.name}.',
      );
      return true;
    }
    return false;
  }

  void _handleExchange(Player player) {
    _addLog('🎭 ${player.name} está escolhendo cartas para troca...');
    final drew = <Role>[];
    for (var i = 0; i < 2 && state.deck.isNotEmpty; i++) {
      drew.add(state.deck.removeLast());
    }
    if (drew.isNotEmpty) {
      state.phase = Phase.exchanging;
      state.exchangingCards = drew;
      state.waitingForResponseIndex = state.players.indexOf(player);
    } else {
      nextTurn();
    }
  }

  /// Retorna `true` se o jogador precisa escolher qual carta perder.
  bool _loseInfluence(
    String playerId,
    PendingResolution next,
    LossReason reason,
    String? causedBy,
  ) {
    final player = state.playerById(playerId);
    if (player == null) return false;
    final alive = player.cards.where((c) => !c.isFlipped).toList();
    if (alive.isEmpty) return false;

    final shields = shieldsLeft[playerId] ?? 0;
    if (shields > 0) {
      shieldsLeft[playerId] = shields - 1;
      _addLog('🛡️ O Véu da Condessa protegeu ${player.name} da perda.');
      return false;
    }

    if (alive.length == 1) {
      final card = alive.first;
      card.isFlipped = true;
      _addLog(
        '💀 ${player.name} perdeu sua última influência (${roleLabel(card.role)})!',
      );
      state.lastLoss = LossInfo(
        role: card.role,
        playerName: player.name,
        playerId: player.id,
        stamp: now(),
      );
      _recordCardLost(playerId);
      _checkWinner();
      return false;
    }

    state.phase = Phase.losingInfluence;
    state.losingInfluenceId = playerId;
    state.waitingForResponseIndex = state.players.indexOf(player);
    state.pendingResolution = next;
    state.losingContext = LosingContext(
      reason: reason,
      causedByPlayerId: causedBy,
      stamp: now(),
    );
    _addLog(
      '🤔 ${player.name} deve escolher qual influência perder.'
      '${next == PendingResolution.resolveAction ? ' (ação ainda prosseguirá após escolha)' : ''}',
    );
    return true;
  }

  void handleFlip(String playerId, Role role) {
    if (state.phase != Phase.losingInfluence ||
        state.losingInfluenceId != playerId) {
      return;
    }
    final player = state.playerById(playerId);
    if (player == null) return;
    final idx = player.cards.indexWhere((c) => c.role == role && !c.isFlipped);
    if (idx == -1) return;

    player.cards[idx].isFlipped = true;
    _addLog('📉 ${player.name} revelou e perdeu seu ${roleLabel(role)}.');
    state.lastLoss = LossInfo(
      role: role,
      playerName: player.name,
      playerId: player.id,
      stamp: now(),
    );
    _recordCardLost(playerId);

    final resolution = state.pendingResolution ?? PendingResolution.nextTurn;
    state.pendingResolution = null;
    state.losingInfluenceId = null;
    state.losingContext = null;
    state.waitingForResponseIndex = null;

    _checkWinner();
    if (state.phase == Phase.gameOver) return;

    switch (resolution) {
      case PendingResolution.resolveAction:
        resolveAction();
      case PendingResolution.allowBlock:
        _openBlockPhaseForTarget();
      case PendingResolution.reopenBlock:
        _reopenBlockPhaseEveryone();
      case PendingResolution.nextTurn:
      case PendingResolution.actionFail:
        nextTurn();
    }
  }

  void handleExchangeChoice(String playerId, List<Role> keptRoles) {
    if (state.phase != Phase.exchanging) return;
    final wi = state.waitingForResponseIndex;
    if (wi == null || state.players[wi].id != playerId) return;
    final player = state.players[wi];
    final drawn = state.exchangingCards;
    if (drawn == null) return;

    final currentAlive = player.aliveRoles;
    if (keptRoles.length != currentAlive.length) {
      _addLog(
        '⛔ Troca inválida: deve manter exatamente ${currentAlive.length} carta(s).',
      );
      return;
    }
    final pool = [...currentAlive, ...drawn];
    for (final r in keptRoles) {
      if (!pool.remove(r)) {
        _addLog(
          '⛔ Troca inválida: tentativa de manter ${roleLabel(r)} fora do pool.',
        );
        return;
      }
    }

    var k = 0;
    for (final c in player.cards) {
      if (!c.isFlipped) c.role = keptRoles[k++];
    }

    _addLog('⚙️ Devolvendo ${pool.length} cartas ao baralho.');
    state.deck.addAll(pool);
    state.deck = _shuffle(state.deck);
    state.exchangingCards = null;
    _addLog('🎭 ${player.name} completou a troca de influências.');
    nextTurn();
  }

  void _openBlockPhaseForTarget() {
    final action = state.currentAction;
    if (action == null || action.target == null) {
      resolveAction();
      return;
    }
    final target = state.playerById(action.target);
    if (target == null || !target.isAlive) {
      _addLog('💀 O alvo ${target?.name ?? ''} já foi eliminado pelo desafio.');
      state.currentAction = null;
      nextTurn();
      return;
    }
    state.phase = Phase.block;
    state.responses = {};
    state.pendingBlock = null;
    final ti = state.players.indexOf(target);
    state.waitingForResponseIndex = ti;
    state.responderCycleStartIndex = ti;
    final roles = blockingRoles(action.type).map(roleLabel).join(' ou ');
    _addLog(
      '🛡️ ${target.name}, o desafio falhou! Deseja bloquear com $roles?',
    );
  }

  void _reopenBlockPhaseEveryone() {
    if (state.currentAction == null) {
      nextTurn();
      return;
    }
    _addLog('🛡️ Reiniciando fase de bloqueio para a Ajuda Externa...');
    state.phase = Phase.block;
    state.responses = {};
    state.pendingBlock = null;
    state.responderCycleStartIndex = state.turnIndex;
    _setNextResponder(state.turnIndex);
  }

  /// Lista todas as ações legais do jogador atual (UI e testes).
  List<GameAction> legalActions() {
    if (state.phase != Phase.action) return const [];
    final pid = currentPlayer.id;
    final out = <GameAction>[];
    void tryAdd(GameAction a) {
      if (validateAction(pid, a).ok) out.add(a);
    }

    for (final t in [
      ActionType.income,
      ActionType.foreignAid,
      ActionType.tax,
      ActionType.exchange,
    ]) {
      tryAdd(GameAction(type: t, source: pid));
    }
    for (final o in state.players.where((p) => p.id != pid && p.isAlive)) {
      for (final t in [
        ActionType.steal,
        ActionType.assassinate,
        ActionType.coup,
      ]) {
        tryAdd(GameAction(type: t, source: pid, target: o.id));
      }
    }
    return out;
  }
}
