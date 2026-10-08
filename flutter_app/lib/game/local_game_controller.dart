import 'dart:async';
import 'dart:math';

import '../engine/bot.dart';
import '../engine/coup_engine.dart';
import '../engine/house_rules.dart';
import '../engine/models.dart';
import 'bot_names.dart';
import 'game_controller.dart';

/// Partida offline: humano contra bots, motor rodando no aparelho.
class LocalGameController extends GameController {
  LocalGameController({
    required this.playerName,
    required this.botCount,
    this.personalities,
    this.botDelay = const Duration(milliseconds: 1100),
    this.turnSeconds = 30,
    this.houseRules = HouseRules.standard,
    this.keenEye = false,
    this.skill = BotSkill.normal,
    this.skills,
    Random? random,
  }) : _rng = random ?? Random() {
    _newMatch();
  }

  final String playerName;
  final int botCount;
  final List<BotPersonality>? personalities;
  final Duration botDelay;
  final int turnSeconds;
  final HouseRules houseRules;
  final bool keenEye;

  /// Nível dos bots; [skills], se houver, define um por assento.
  final BotSkill skill;
  final List<BotSkill>? skills;
  final Random _rng;
  final Map<String, Role> _peeks = {};
  String? _notice;
  int _shields = 0;

  late CoupEngine _engine;
  late BotBrain _brain;
  Timer? _botTimer;
  Timer? _clock;
  int? _turnTimer;
  bool _busy = false;
  bool _disposed = false;

  static const humanId = 'human-1';

  @override
  GameState get state => _engine.state;

  @override
  String get myId => humanId;

  @override
  bool get isOnline => false;

  @override
  bool get started => true;

  @override
  bool get busy => _busy;

  @override
  int? get turnTimer => _turnTimer;

  @override
  int get turnTimerTotal => turnSeconds;

  @override
  HouseRules get rules => houseRules;

  @override
  Map<String, Role> get peeks => {
    for (final e in _peeks.entries)
      // Some quando o rival perde ou troca aquela carta.
      if (state.playerById(e.key)?.aliveRoles.contains(e.value) ?? false)
        e.key: e.value,
  };

  @override
  String? takeNotice() {
    final n = _notice;
    _notice = null;
    return n;
  }

  void _newMatch() {
    _engine = CoupEngine('offline', random: _rng);
    _engine.addPlayer(humanId, playerName.isEmpty ? 'Jogador' : playerName);
    final names = pickBotNames(botCount, _rng);
    for (var i = 0; i < botCount; i++) {
      final p = personalities != null && i < personalities!.length
          ? personalities![i]
          : BotPersonality.values[_rng.nextInt(BotPersonality.values.length)];
      _engine.addPlayer('bot-$i', names[i], isBot: true, personality: p);
    }
    _engine.rules = houseRules;
    _engine.startGame();
    _shields = _engine.shieldsLeft[humanId] ?? 0;
    _peeks.clear();
    if (keenEye) {
      for (final p in state.players.where((p) => p.isBot)) {
        _peeks[p.id] = p.cards[_rng.nextInt(p.cards.length)].role;
      }
    }
    _brain = BotBrain(
      _engine,
      random: _rng,
      defaultSkill: skill,
      skills: {
        for (var i = 0; i < (skills?.length ?? 0) && i < botCount; i++)
          'bot-$i': skills![i],
      },
    );
    _afterMutation(initial: true);
  }

  /// Depois de qualquer jogada: notifica a UI, segura a mesa por um instante
  /// para as animações e então aciona bot ou relógio do humano.
  void _afterMutation({bool initial = false}) {
    _botTimer?.cancel();
    _stopClock();
    _busy = true;
    _brain.observe();
    final shields = _engine.shieldsLeft[humanId] ?? 0;
    if (shields < _shields) {
      _notice = 'O Véu da Condessa protegeu você de perder uma influência!';
    }
    _shields = shields;
    notifyListeners();
    _botTimer = Timer(
      initial ? const Duration(milliseconds: 600) : botDelay,
      () {
        if (_disposed) return;
        _busy = false;
        _step();
      },
    );
  }

  void _step() {
    final actor = BotBrain.pendingActor(state);
    if (actor == null) {
      notifyListeners();
      return;
    }
    final p = state.playerById(actor);
    if (p != null && p.isBot) {
      if (_brain.playFor(actor)) {
        _afterMutation();
        return;
      }
    }
    if (actor == humanId) _startClock();
    notifyListeners();
  }

  void _startClock() {
    _stopClock();
    _turnTimer = turnSeconds;
    _clock = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_disposed) return;
      final left = (_turnTimer ?? 0) - 1;
      if (left <= 0) {
        _stopClock();
        // Tempo esgotado: a IA decide pelo jogador.
        if (_brain.playFor(humanId)) _afterMutation();
        return;
      }
      _turnTimer = left;
      notifyListeners();
    });
  }

  void _stopClock() {
    _clock?.cancel();
    _clock = null;
    _turnTimer = null;
  }

  bool get _canAct => !_busy && !_disposed;

  @override
  void sendAction(GameAction action) {
    if (!_canAct) return;
    final before = state.lastInvalid?.stamp;
    _engine.handleAction(humanId, action);
    if (state.lastInvalid?.stamp != before) {
      notifyListeners();
      return;
    }
    _afterMutation();
  }

  @override
  void sendResponse(ResponseType response, [Role? role]) {
    if (!_canAct) return;
    _engine.handleResponse(humanId, response, role);
    _afterMutation();
  }

  @override
  void selectInfluence(Role role) {
    if (!_canAct) return;
    _engine.handleFlip(humanId, role);
    _afterMutation();
  }

  @override
  void confirmExchange(List<Role> kept) {
    if (!_canAct) return;
    _engine.handleExchangeChoice(humanId, kept);
    _afterMutation();
  }

  @override
  void playAgain() {
    _botTimer?.cancel();
    _stopClock();
    _newMatch();
  }

  @override
  void leave() => dispose();

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _botTimer?.cancel();
    _stopClock();
    super.dispose();
  }
}
