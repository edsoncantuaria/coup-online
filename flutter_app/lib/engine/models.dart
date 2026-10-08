/// Modelos do jogo Coup. O formato JSON é idêntico ao estado enviado pelo
/// servidor Node (socket.io), para que o mesmo app jogue offline e online.
library;

enum Role { duke, assassin, captain, contessa, ambassador }

Role roleFromName(String name) =>
    Role.values.firstWhere((r) => r.name == name, orElse: () => Role.duke);

enum ActionType {
  income('income'),
  foreignAid('foreign_aid'),
  tax('tax'),
  steal('steal'),
  assassinate('assassinate'),
  exchange('exchange'),
  coup('coup');

  const ActionType(this.wire);
  final String wire;

  static ActionType? fromWire(String? s) {
    for (final t in values) {
      if (t.wire == s) return t;
    }
    return null;
  }
}

enum Phase {
  action('action'),
  challenge('challenge'),
  block('block'),
  reveal('reveal'),
  losingInfluence('losing_influence'),
  exchanging('exchanging'),
  gameOver('game_over');

  const Phase(this.wire);
  final String wire;

  static Phase fromWire(String? s) =>
      values.firstWhere((p) => p.wire == s, orElse: () => Phase.action);
}

enum ResponseType { pass, challenge, block, allow }

ResponseType responseFromName(String s) => ResponseType.values.firstWhere(
  (r) => r.name == s,
  orElse: () => ResponseType.pass,
);

enum BotPersonality { cautious, tyrant, bluffer, balanced }

enum PendingResolution {
  nextTurn('next_turn'),
  resolveAction('resolve_action'),
  actionFail('action_fail'),
  allowBlock('allow_block'),
  reopenBlock('reopen_block');

  const PendingResolution(this.wire);
  final String wire;

  static PendingResolution fromWire(String? s) => values.firstWhere(
    (p) => p.wire == s,
    orElse: () => PendingResolution.nextTurn,
  );
}

enum LossReason {
  coup('coup'),
  assassinate('assassinate'),
  challengeLost('challenge_lost'),
  bluffCaught('bluff_caught');

  const LossReason(this.wire);
  final String wire;

  static LossReason fromWire(String? s) =>
      values.firstWhere((p) => p.wire == s, orElse: () => LossReason.coup);
}

class GameAction {
  GameAction({required this.type, required this.source, this.target});

  final ActionType type;
  final String source;
  final String? target;

  Map<String, dynamic> toJson() => {
    'type': type.wire,
    'source': source,
    if (target != null) 'target': target,
  };

  static GameAction? fromJson(Object? json) {
    if (json is! Map) return null;
    final type = ActionType.fromWire(json['type'] as String?);
    if (type == null) return null;
    return GameAction(
      type: type,
      source: (json['source'] ?? '') as String,
      target: json['target'] as String?,
    );
  }
}

class GameCard {
  GameCard(this.role, {this.isFlipped = false});

  Role role;
  bool isFlipped;

  /// Carta oculta recebida do servidor (de outro jogador, ainda viva).
  bool hidden = false;

  Map<String, dynamic> toJson() => {
    'role': hidden ? null : role.name,
    'isFlipped': isFlipped,
  };

  factory GameCard.fromJson(Map json) {
    final r = json['role'];
    final c = GameCard(
      r is String ? roleFromName(r) : Role.duke,
      isFlipped: json['isFlipped'] == true,
    );
    c.hidden = r == null;
    return c;
  }
}

class Player {
  Player({
    required this.id,
    required this.name,
    this.isBot = false,
    this.coins = 2,
    List<GameCard>? cards,
    this.isConnected = true,
    this.personality,
  }) : cards = cards ?? [];

  final String id;
  final String name;
  final bool isBot;
  int coins;
  List<GameCard> cards;
  bool isConnected;
  BotPersonality? personality;

  bool get isAlive => cards.any((c) => !c.isFlipped);
  int get influence => cards.where((c) => !c.isFlipped).length;
  List<Role> get aliveRoles =>
      cards.where((c) => !c.isFlipped).map((c) => c.role).toList();

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'isBot': isBot,
    'coins': coins,
    'cards': cards.map((c) => c.toJson()).toList(),
    'deadCards': <String>[],
    'isConnected': isConnected,
    'isReady': false,
    if (personality != null) 'personality': personality!.name,
  };

  factory Player.fromJson(Map json) => Player(
    id: json['id'] as String,
    name: (json['name'] ?? '?') as String,
    isBot: json['isBot'] == true,
    coins: (json['coins'] as num?)?.toInt() ?? 0,
    cards: ((json['cards'] as List?) ?? const [])
        .map((c) => GameCard.fromJson(c as Map))
        .toList(),
    isConnected: json['isConnected'] != false,
    personality: json['personality'] is String
        ? BotPersonality.values.firstWhere(
            (p) => p.name == json['personality'],
            orElse: () => BotPersonality.balanced,
          )
        : null,
  );
}

class PendingBlock {
  PendingBlock({
    required this.blockerId,
    required this.actionType,
    required this.role,
  });
  final String blockerId;
  final String actionType;
  final Role role;

  Map<String, dynamic> toJson() => {
    'blockerId': blockerId,
    'actionType': actionType,
    'role': role.name,
  };

  static PendingBlock? fromJson(Object? j) => j is Map
      ? PendingBlock(
          blockerId: j['blockerId'] as String,
          actionType: (j['actionType'] ?? '') as String,
          role: roleFromName(j['role'] as String),
        )
      : null;
}

class LosingContext {
  LosingContext({
    required this.reason,
    this.causedByPlayerId,
    required this.stamp,
  });
  final LossReason reason;
  final String? causedByPlayerId;
  final int stamp;

  Map<String, dynamic> toJson() => {
    'reason': reason.wire,
    if (causedByPlayerId != null) 'causedByPlayerId': causedByPlayerId,
    'stamp': stamp,
  };

  static LosingContext? fromJson(Object? j) => j is Map
      ? LosingContext(
          reason: LossReason.fromWire(j['reason'] as String?),
          causedByPlayerId: j['causedByPlayerId'] as String?,
          stamp: (j['stamp'] as num?)?.toInt() ?? 0,
        )
      : null;
}

/// Veredito de desafio exibido no centro da mesa.
class RevealInfo {
  RevealInfo({
    required this.role,
    required this.playerName,
    required this.playerId,
    required this.proven,
    required this.stamp,
  });
  final Role role;
  final String playerName;
  final String playerId;
  final bool proven;
  final int stamp;

  Map<String, dynamic> toJson() => {
    'role': role.name,
    'playerName': playerName,
    'playerId': playerId,
    'verdict': proven ? 'proven' : 'bluff',
    'stamp': stamp,
  };

  static RevealInfo? fromJson(Object? j) => j is Map
      ? RevealInfo(
          role: roleFromName(j['role'] as String),
          playerName: (j['playerName'] ?? '') as String,
          playerId: (j['playerId'] ?? '') as String,
          proven: j['verdict'] == 'proven',
          stamp: (j['stamp'] as num?)?.toInt() ?? 0,
        )
      : null;
}

class LossInfo {
  LossInfo({
    required this.role,
    required this.playerName,
    required this.playerId,
    required this.stamp,
  });
  final Role role;
  final String playerName;
  final String playerId;
  final int stamp;

  Map<String, dynamic> toJson() => {
    'role': role.name,
    'playerName': playerName,
    'playerId': playerId,
    'stamp': stamp,
  };

  static LossInfo? fromJson(Object? j) => j is Map
      ? LossInfo(
          role: roleFromName(j['role'] as String),
          playerName: (j['playerName'] ?? '') as String,
          playerId: (j['playerId'] ?? '') as String,
          stamp: (j['stamp'] as num?)?.toInt() ?? 0,
        )
      : null;
}

class ResolvedInfo {
  ResolvedInfo({
    required this.actionType,
    required this.actorId,
    required this.summary,
    this.targetId,
    required this.stamp,
  });
  final String actionType;
  final String actorId;
  final String? targetId;
  final String summary;
  final int stamp;

  Map<String, dynamic> toJson() => {
    'actionType': actionType,
    'actorId': actorId,
    if (targetId != null) 'targetId': targetId,
    'summary': summary,
    'stamp': stamp,
  };

  static ResolvedInfo? fromJson(Object? j) => j is Map
      ? ResolvedInfo(
          actionType: (j['actionType'] ?? '') as String,
          actorId: (j['actorId'] ?? '') as String,
          targetId: j['targetId'] as String?,
          summary: (j['summary'] ?? '') as String,
          stamp: (j['stamp'] as num?)?.toInt() ?? 0,
        )
      : null;
}

class InvalidInfo {
  InvalidInfo({required this.reason, required this.stamp});
  final String reason;
  final int stamp;

  Map<String, dynamic> toJson() => {'reason': reason, 'stamp': stamp};

  static InvalidInfo? fromJson(Object? j) => j is Map
      ? InvalidInfo(
          reason: (j['reason'] ?? '') as String,
          stamp: (j['stamp'] as num?)?.toInt() ?? 0,
        )
      : null;
}

class PlayerStats {
  PlayerStats();

  int actionsTaken = 0;
  int challengesMade = 0;
  int challengesWon = 0;
  int challengesLost = 0;
  int bluffsCaught = 0;
  int bluffsSurvived = 0;
  int blocksMade = 0;
  int blocksSuccess = 0;
  int blocksFailed = 0;
  int coinsGained = 0;
  int coinsLost = 0;
  int cardsLost = 0;
  int? eliminatedAtRound;

  Map<String, dynamic> toJson() => {
    'actionsTaken': actionsTaken,
    'challengesMade': challengesMade,
    'challengesWon': challengesWon,
    'challengesLost': challengesLost,
    'bluffsCaught': bluffsCaught,
    'bluffsSurvived': bluffsSurvived,
    'blocksMade': blocksMade,
    'blocksSuccess': blocksSuccess,
    'blocksFailed': blocksFailed,
    'coinsGained': coinsGained,
    'coinsLost': coinsLost,
    'cardsLost': cardsLost,
    if (eliminatedAtRound != null) 'eliminatedAtRound': eliminatedAtRound,
  };

  factory PlayerStats.fromJson(Map j) {
    int v(String k) => (j[k] as num?)?.toInt() ?? 0;
    return PlayerStats()
      ..actionsTaken = v('actionsTaken')
      ..challengesMade = v('challengesMade')
      ..challengesWon = v('challengesWon')
      ..challengesLost = v('challengesLost')
      ..bluffsCaught = v('bluffsCaught')
      ..bluffsSurvived = v('bluffsSurvived')
      ..blocksMade = v('blocksMade')
      ..blocksSuccess = v('blocksSuccess')
      ..blocksFailed = v('blocksFailed')
      ..coinsGained = v('coinsGained')
      ..coinsLost = v('coinsLost')
      ..cardsLost = v('cardsLost')
      ..eliminatedAtRound = (j['eliminatedAtRound'] as num?)?.toInt();
  }
}

class MatchStats {
  MatchStats({
    required this.startedAt,
    this.round = 1,
    Map<String, PlayerStats>? perPlayer,
  }) : perPlayer = perPlayer ?? {};
  final int startedAt;
  int? endedAt;
  int round;
  final Map<String, PlayerStats> perPlayer;

  Map<String, dynamic> toJson() => {
    'startedAt': startedAt,
    if (endedAt != null) 'endedAt': endedAt,
    'round': round,
    'perPlayer': perPlayer.map((k, v) => MapEntry(k, v.toJson())),
  };

  static MatchStats? fromJson(Object? j) {
    if (j is! Map) return null;
    final m = MatchStats(
      startedAt: (j['startedAt'] as num?)?.toInt() ?? 0,
      round: (j['round'] as num?)?.toInt() ?? 1,
      perPlayer: ((j['perPlayer'] as Map?) ?? const {}).map(
        (k, v) => MapEntry(k as String, PlayerStats.fromJson(v as Map)),
      ),
    );
    m.endedAt = (j['endedAt'] as num?)?.toInt();
    return m;
  }
}

class GameState {
  GameState({required this.roomId});

  String roomId;
  List<Player> players = [];
  List<Role> deck = [];

  /// Tamanho do baralho (online, o servidor esconde as cartas mas manda a contagem).
  int? deckCountOverride;
  int turnIndex = 0;
  Phase phase = Phase.action;
  GameAction? currentAction;
  List<Role>? exchangingCards;
  String? losingInfluenceId;
  LosingContext? losingContext;
  PendingBlock? pendingBlock;
  List<String> logs = [];
  String? winner;
  int? waitingForResponseIndex;
  int? responderCycleStartIndex;
  Map<String, ResponseType> responses = {};
  PendingResolution? pendingResolution;
  RevealInfo? lastReveal;
  LossInfo? lastLoss;
  ResolvedInfo? lastResolved;
  MatchStats? matchStats;
  InvalidInfo? lastInvalid;

  int get deckCount => deckCountOverride ?? deck.length;

  Player? get currentPlayer =>
      turnIndex >= 0 && turnIndex < players.length ? players[turnIndex] : null;

  Player? get waitingFor =>
      waitingForResponseIndex != null &&
          waitingForResponseIndex! >= 0 &&
          waitingForResponseIndex! < players.length
      ? players[waitingForResponseIndex!]
      : null;

  Player? playerById(String? id) {
    if (id == null) return null;
    for (final p in players) {
      if (p.id == id) return p;
    }
    return null;
  }

  Map<String, dynamic> toJson() => {
    'roomId': roomId,
    'players': players.map((p) => p.toJson()).toList(),
    'deck': deck.map((r) => r.name).toList(),
    'turnIndex': turnIndex,
    'phase': phase.wire,
    if (currentAction != null) 'currentAction': currentAction!.toJson(),
    if (exchangingCards != null)
      'exchangingCards': exchangingCards!.map((r) => r.name).toList(),
    if (losingInfluenceId != null) 'losingInfluenceId': losingInfluenceId,
    if (losingContext != null) 'losingContext': losingContext!.toJson(),
    if (pendingBlock != null) 'pendingBlock': pendingBlock!.toJson(),
    'logs': logs,
    if (winner != null) 'winner': winner,
    'waitingForResponseIndex': waitingForResponseIndex,
    'responderCycleStartIndex': responderCycleStartIndex,
    'responses': responses.map((k, v) => MapEntry(k, v.name)),
    if (pendingResolution != null)
      'pendingResolution': {'type': pendingResolution!.wire},
    if (lastReveal != null) 'lastReveal': lastReveal!.toJson(),
    if (lastLoss != null) 'lastLoss': lastLoss!.toJson(),
    if (lastResolved != null) 'lastResolved': lastResolved!.toJson(),
    if (matchStats != null) 'matchStats': matchStats!.toJson(),
    if (lastInvalid != null) 'lastInvalid': lastInvalid!.toJson(),
  };

  factory GameState.fromJson(Map json) {
    final s = GameState(roomId: (json['roomId'] ?? '') as String);
    s.players = ((json['players'] as List?) ?? const [])
        .map((p) => Player.fromJson(p as Map))
        .toList();
    s.deck = ((json['deck'] as List?) ?? const [])
        .whereType<String>()
        .map(roleFromName)
        .toList();
    if (json['deckCount'] is num) {
      s.deckCountOverride = (json['deckCount'] as num).toInt();
    }
    s.turnIndex = (json['turnIndex'] as num?)?.toInt() ?? 0;
    s.phase = Phase.fromWire(json['phase'] as String?);
    s.currentAction = GameAction.fromJson(json['currentAction']);
    final ex = json['exchangingCards'];
    s.exchangingCards = ex is List
        ? ex.whereType<String>().map(roleFromName).toList()
        : null;
    s.losingInfluenceId = json['losingInfluenceId'] as String?;
    s.losingContext = LosingContext.fromJson(json['losingContext']);
    s.pendingBlock = PendingBlock.fromJson(json['pendingBlock']);
    s.logs = ((json['logs'] as List?) ?? const []).map((e) => '$e').toList();
    s.winner = json['winner'] as String?;
    s.waitingForResponseIndex = (json['waitingForResponseIndex'] as num?)
        ?.toInt();
    s.responderCycleStartIndex = (json['responderCycleStartIndex'] as num?)
        ?.toInt();
    s.responses = ((json['responses'] as Map?) ?? const {}).map(
      (k, v) => MapEntry(k as String, responseFromName(v as String)),
    );
    final pr = json['pendingResolution'];
    s.pendingResolution = pr is Map
        ? PendingResolution.fromWire(pr['type'] as String?)
        : null;
    s.lastReveal = RevealInfo.fromJson(json['lastReveal']);
    s.lastLoss = LossInfo.fromJson(json['lastLoss']);
    s.lastResolved = ResolvedInfo.fromJson(json['lastResolved']);
    s.matchStats = MatchStats.fromJson(json['matchStats']);
    s.lastInvalid = InvalidInfo.fromJson(json['lastInvalid']);
    return s;
  }

  GameState copy() => GameState.fromJson(toJson());
}
