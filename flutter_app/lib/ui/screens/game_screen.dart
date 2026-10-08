import 'package:flutter/material.dart';

import '../../engine/coup_engine.dart';
import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../../game/online_game_controller.dart';
import '../theme.dart';
import '../widgets/influence_card.dart';
import '../widgets/player_seat.dart';
import 'rules_screen.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.controller});
  final GameController controller;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  GameController get c => widget.controller;
  ActionType? _targeting;
  final Set<int> _exchangePick = {};
  int? _lastInvalidStamp;

  @override
  void initState() {
    super.initState();
    c.addListener(_onChange);
  }

  @override
  void dispose() {
    c.removeListener(_onChange);
    c.leave();
    super.dispose();
  }

  void _onChange() {
    if (!mounted) return;
    final notice = c.takeNotice();
    if (notice != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(notice)));
    }
    final inv = c.state?.lastInvalid;
    if (inv != null && inv.stamp != _lastInvalidStamp) {
      final first = _lastInvalidStamp == null && c.isOnline;
      _lastInvalidStamp = inv.stamp;
      if (!first) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(inv.reason),
            backgroundColor: CoupColors.redDeep,
          ),
        );
      }
    }
    final s = c.state;
    if (s == null || s.phase != Phase.action || !c.isMyDecision) {
      _targeting = null;
    }
    if (s?.phase != Phase.exchanging) _exchangePick.clear();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = c.state;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          c.isOnline ? 'SALA ${c.roomCode ?? ''}' : 'COUP',
          style: const TextStyle(
            letterSpacing: 4,
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Regras',
            icon: const Icon(Icons.menu_book_outlined),
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const RulesScreen())),
          ),
          Builder(
            builder: (ctx) => IconButton(
              tooltip: 'Registro',
              icon: const Icon(Icons.receipt_long_outlined),
              onPressed: () => Scaffold.of(ctx).openEndDrawer(),
            ),
          ),
        ],
      ),
      endDrawer: _LogDrawer(logs: s?.logs ?? const []),
      body: SafeArea(
        child: s == null
            ? const Center(child: CircularProgressIndicator())
            : !c.started
            ? _LobbyView(controller: c as OnlineGameController)
            : _table(s),
      ),
    );
  }

  Widget _table(GameState s) {
    final me = c.me;
    final others = s.players.where((p) => p.id != c.myId).toList();
    final waitingId = c.pendingActorId;

    return Stack(
      children: [
        Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Column(
                  children: [
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final p in others)
                          PlayerSeat(
                            player: p,
                            isTurn: s.currentPlayer?.id == p.id,
                            isWaiting:
                                waitingId == p.id && s.phase != Phase.action,
                            showCards: s.phase == Phase.gameOver,
                            selectable:
                                _targeting != null && _isValidTarget(s, p),
                            onTap: _targeting != null && _isValidTarget(s, p)
                                ? () => _sendTargeted(p.id)
                                : null,
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _CenterPanel(
                      state: s,
                      controller: c,
                      targeting: _targeting,
                    ),
                  ],
                ),
              ),
            ),
            if (me != null) _myArea(s, me),
          ],
        ),
        if (s.phase == Phase.gameOver) _GameOverPanel(state: s, controller: c),
      ],
    );
  }

  // --------------------------------------------------------------- my area

  Widget _myArea(GameState s, Player me) {
    final cardWidth = (MediaQuery.sizeOf(context).height * 0.1).clamp(
      60.0,
      96.0,
    );
    final losing =
        s.phase == Phase.losingInfluence &&
        s.losingInfluenceId == me.id &&
        !c.busy;
    return Container(
      decoration: const BoxDecoration(
        color: CoupColors.secondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: CoupColors.goldSoft, width: 0.6)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  me.name,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: s.currentPlayer?.id == me.id
                        ? CoupColors.goldHigh
                        : CoupColors.text,
                  ),
                ),
              ),
              if (c.turnTimer != null) _TimerChip(seconds: c.turnTimer!),
              const SizedBox(width: 8),
              CoinBadge(coins: me.coins, large: true),
            ],
          ),
          const SizedBox(height: 10),
          if (s.phase == Phase.exchanging && c.isMyDecision)
            _exchangePicker(s, me)
          else
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (final card in me.cards) ...[
                  InfluenceCard(
                    role: card.role,
                    flipped: card.isFlipped,
                    width: cardWidth,
                    highlight: losing && !card.isFlipped,
                    onTap: losing && !card.isFlipped
                        ? () => c.selectInfluence(card.role)
                        : null,
                  ),
                  const SizedBox(width: 12),
                ],
              ],
            ),
          const SizedBox(height: 12),
          _decisionPanel(s, me),
        ],
      ),
    );
  }

  Widget _decisionPanel(GameState s, Player me) {
    if (!me.isAlive && s.phase != Phase.gameOver) {
      return const _Hint('Você foi eliminado. Acompanhe o fim da partida.');
    }
    if (!c.isMyDecision) {
      return c.busy
          ? const SizedBox(height: 40)
          : const _Hint('Aguardando os outros nobres.');
    }
    switch (s.phase) {
      case Phase.action:
        return _actionButtons(s, me);
      case Phase.challenge:
        final a = s.currentAction!;
        return _choiceRow(
          [
            _Choice(
              'DESAFIAR',
              CoupColors.red,
              () => c.sendResponse(ResponseType.challenge),
              Icons.gavel,
            ),
            _Choice(
              'DEIXAR PASSAR',
              null,
              () => c.sendResponse(ResponseType.pass),
              Icons.check,
            ),
          ],
          header:
              '${s.playerById(a.source)?.name} diz ter ${roleLabel(CoupEngine.requiredRole(a.type)!)}. Desafiar?',
        );
      case Phase.block:
        final a = s.currentAction!;
        final pb = s.pendingBlock;
        if (pb != null) {
          return _choiceRow(
            [
              _Choice(
                'DESAFIAR BLOQUEIO',
                CoupColors.red,
                () => c.sendResponse(ResponseType.challenge),
                Icons.gavel,
              ),
              _Choice(
                'ACEITAR',
                null,
                () => c.sendResponse(ResponseType.pass),
                Icons.check,
              ),
            ],
            header:
                '${s.playerById(pb.blockerId)?.name} bloqueia com ${roleLabel(pb.role)}.',
          );
        }
        return _choiceRow(
          [
            for (final r in CoupEngine.blockingRoles(a.type))
              _Choice(
                'BLOQUEAR (${roleLabel(r).toUpperCase()})',
                CoupColors.info,
                () => c.sendResponse(ResponseType.block, r),
                Icons.shield,
              ),
            _Choice(
              'PERMITIR',
              null,
              () => c.sendResponse(ResponseType.pass),
              Icons.check,
            ),
          ],
          header:
              'Bloquear ${actionLabel(a.type)} de ${s.playerById(a.source)?.name}?',
        );
      case Phase.losingInfluence:
        return const _Hint(
          'Toque na carta que você vai perder.',
          color: CoupColors.error,
        );
      case Phase.exchanging:
        final need = me.influence;
        return FilledButton(
          onPressed: _exchangePick.length == need
              ? () {
                  final pool = [...me.aliveRoles, ...?s.exchangingCards];
                  c.confirmExchange(_exchangePick.map((i) => pool[i]).toList());
                }
              : null,
          child: Text('MANTER ${_exchangePick.length}/$need'),
        );
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _exchangePicker(GameState s, Player me) {
    final pool = [...me.aliveRoles, ...?s.exchangingCards];
    final need = me.influence;
    return Column(
      children: [
        Text(
          'Escolha $need carta(s) para manter',
          style: const TextStyle(color: CoupColors.textSecondary, fontSize: 12),
        ),
        const SizedBox(height: 8),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          children: [
            for (var i = 0; i < pool.length; i++)
              InfluenceCard(
                role: pool[i],
                width: 70,
                selected: _exchangePick.contains(i),
                onTap: () => setState(() {
                  if (_exchangePick.contains(i)) {
                    _exchangePick.remove(i);
                  } else if (_exchangePick.length < need) {
                    _exchangePick.add(i);
                  }
                }),
              ),
          ],
        ),
      ],
    );
  }

  // ---------------------------------------------------------------- actions

  bool _isValidTarget(GameState s, Player p) {
    if (!p.isAlive || p.id == c.myId) return false;
    if (_targeting == ActionType.steal && p.coins < 1) return false;
    return true;
  }

  void _sendTargeted(String targetId) {
    final t = _targeting;
    if (t == null) return;
    setState(() => _targeting = null);
    c.sendAction(GameAction(type: t, source: c.myId, target: targetId));
  }

  String? _whyNot(GameState s, Player me, ActionType t) {
    if (me.coins >= 10 && t != ActionType.coup) return 'Golpe obrigatório';
    if (t == ActionType.coup && me.coins < 7) return '7 moedas';
    if (t == ActionType.assassinate && me.coins < 3) return '3 moedas';
    if (t == ActionType.steal &&
        !s.players.any((p) => p.id != me.id && p.isAlive && p.coins > 0)) {
      return 'Ninguém tem moedas';
    }
    return null;
  }

  Widget _actionButtons(GameState s, Player me) {
    if (_targeting != null) {
      return Column(
        children: [
          _Hint(
            'Escolha o alvo de ${actionLabel(_targeting!)} na mesa.',
            color: CoupColors.error,
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => setState(() => _targeting = null),
            child: const Text('CANCELAR'),
          ),
        ],
      );
    }

    final btnWidth = ((MediaQuery.sizeOf(context).width - 48) / 2).clamp(
      120.0,
      170.0,
    );
    Widget btn(ActionType t, IconData icon, {Role? role}) {
      final why = _whyNot(s, me, t);
      final style = role != null ? roleStyle(role) : null;
      final bluff = role != null && !me.aliveRoles.contains(role);
      return SizedBox(
        width: btnWidth,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            side: BorderSide(
              color:
                  style?.accent.withValues(alpha: 0.7) ?? CoupColors.goldSoft,
            ),
            backgroundColor: style?.top.withValues(alpha: 0.35),
          ),
          onPressed: why != null
              ? null
              : () {
                  if (CoupEngine.actionNeedsTarget(t)) {
                    final targets = s.players.where((p) {
                      if (p.id == me.id || !p.isAlive) return false;
                      return t != ActionType.steal || p.coins > 0;
                    }).toList();
                    if (targets.length == 1) {
                      c.sendAction(
                        GameAction(
                          type: t,
                          source: me.id,
                          target: targets.first.id,
                        ),
                      );
                    } else {
                      setState(() => _targeting = t);
                    }
                  } else {
                    c.sendAction(GameAction(type: t, source: me.id));
                  }
                },
          child: Row(
            children: [
              Icon(icon, size: 18, color: style?.accent ?? CoupColors.goldHigh),
              const SizedBox(width: 6),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _shortLabel(t),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      why ??
                          (bluff
                              ? '${_actionHint(t)} · blefe'
                              : _actionHint(t)),
                      style: TextStyle(
                        fontSize: 10,
                        color: bluff && why == null
                            ? CoupColors.bluff
                            : CoupColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 8,
      runSpacing: 8,
      children: [
        btn(ActionType.income, Icons.add_circle_outline),
        btn(ActionType.foreignAid, Icons.public),
        btn(ActionType.coup, Icons.whatshot),
        btn(ActionType.tax, Icons.account_balance, role: Role.duke),
        btn(ActionType.steal, Icons.anchor, role: Role.captain),
        btn(ActionType.assassinate, Icons.colorize, role: Role.assassin),
        btn(ActionType.exchange, Icons.swap_horiz, role: Role.ambassador),
      ],
    );
  }

  String _shortLabel(ActionType t) => switch (t) {
    ActionType.income => 'Renda',
    ActionType.foreignAid => 'Ajuda Externa',
    ActionType.coup => 'Golpe',
    ActionType.tax => 'Taxa',
    ActionType.steal => 'Extorsão',
    ActionType.assassinate => 'Assassinar',
    ActionType.exchange => 'Troca',
  };

  String _actionHint(ActionType t) => switch (t) {
    ActionType.income => '+1 moeda',
    ActionType.foreignAid => '+2 · Duque bloqueia',
    ActionType.coup => '-7 · elimina carta',
    ActionType.tax => 'Duque · +3 moedas',
    ActionType.steal => 'Capitão · rouba 2',
    ActionType.assassinate => 'Assassino · -3',
    ActionType.exchange => 'Embaixador',
  };

  Widget _choiceRow(List<_Choice> choices, {String? header}) {
    return Column(
      children: [
        if (header != null) ...[
          Text(
            header,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: CoupColors.textSecondary,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
        ],
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final ch in choices)
              ch.color == null
                  ? OutlinedButton.icon(
                      onPressed: ch.onTap,
                      icon: Icon(ch.icon, size: 18),
                      label: Text(ch.label),
                    )
                  : FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: ch.color,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: ch.onTap,
                      icon: Icon(ch.icon, size: 18),
                      label: Text(ch.label),
                    ),
          ],
        ),
      ],
    );
  }
}

class _Choice {
  _Choice(this.label, this.color, this.onTap, this.icon);
  final String label;
  final Color? color;
  final VoidCallback onTap;
  final IconData icon;
}

class _Hint extends StatelessWidget {
  const _Hint(this.text, {this.color = CoupColors.textSecondary});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(
      text,
      textAlign: TextAlign.center,
      style: TextStyle(color: color),
    ),
  );
}

class _TimerChip extends StatelessWidget {
  const _TimerChip({required this.seconds});
  final int seconds;

  @override
  Widget build(BuildContext context) {
    final urgent = seconds <= 10;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: (urgent ? CoupColors.error : CoupColors.info).withValues(
          alpha: 0.15,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.timer_outlined,
            size: 16,
            color: urgent ? CoupColors.error : CoupColors.info,
          ),
          const SizedBox(width: 4),
          Text(
            '${seconds}s',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: urgent ? CoupColors.error : CoupColors.info,
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------- center panel

String describePhase(GameState s, String myId) {
  String n(String? id) => id == myId ? 'Você' : (s.playerById(id)?.name ?? '?');
  String waiting(String what) => s.waitingFor?.id == myId
      ? 'Sua vez de decidir se $what.'
      : 'Aguardando ${n(s.waitingFor?.id)} decidir se $what.';
  final a = s.currentAction;
  switch (s.phase) {
    case Phase.action:
      return s.currentPlayer?.id == myId
          ? 'Sua vez. Escolha uma ação.'
          : 'Vez de ${n(s.currentPlayer?.id)}.';
    case Phase.challenge:
      if (a == null) return '';
      final target = a.target != null ? ' contra ${n(a.target)}' : '';
      return '${n(a.source)} declarou ${actionLabel(a.type)}$target.\n'
          '${waiting('desafia')}';
    case Phase.block:
      if (a == null) return '';
      final pb = s.pendingBlock;
      if (pb != null) {
        return '${n(pb.blockerId)} bloqueou com ${roleLabel(pb.role)}.\n'
            '${waiting('desafia o bloqueio')}';
      }
      return '${n(a.source)} quer ${actionLabel(a.type)}.\n'
          '${waiting('bloqueia')}';
    case Phase.losingInfluence:
      return s.losingInfluenceId == myId
          ? 'Você deve perder uma influência.'
          : '${n(s.losingInfluenceId)} deve perder uma influência.';
    case Phase.exchanging:
      return '${n(s.waitingFor?.id)} está trocando cartas com a Corte.';
    case Phase.gameOver:
      return 'Fim de jogo.';
    case Phase.reveal:
      return '';
  }
}

class _CenterPanel extends StatelessWidget {
  const _CenterPanel({
    required this.state,
    required this.controller,
    this.targeting,
  });
  final GameState state;
  final GameController controller;
  final ActionType? targeting;

  @override
  Widget build(BuildContext context) {
    final s = state;
    final event = _latestEvent(s, controller.myId);
    return Container(
      constraints: const BoxConstraints(maxWidth: 520),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CoupColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: CoupColors.goldSoft.withValues(alpha: 0.4)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Pill(icon: Icons.style, text: 'Corte: ${s.deckCount}'),
              if (s.matchStats != null)
                _Pill(icon: Icons.loop, text: 'Rodada ${s.matchStats!.round}'),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            describePhase(s, controller.myId),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              height: 1.35,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 350),
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: ScaleTransition(
                scale: Tween(begin: 0.92, end: 1.0).animate(anim),
                child: child,
              ),
            ),
            child: event == null
                ? const SizedBox(key: ValueKey('none'), height: 0)
                : Container(
                    key: ValueKey(event.stamp),
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: event.color.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: event.color.withValues(alpha: 0.6),
                      ),
                    ),
                    child: Row(
                      children: [
                        if (event.role != null) ...[
                          InfluenceCard(role: event.role, width: 34),
                          const SizedBox(width: 10),
                        ] else ...[
                          Icon(event.icon, color: event.color),
                          const SizedBox(width: 10),
                        ],
                        Expanded(
                          child: Text(
                            event.text,
                            style: TextStyle(
                              color: event.color,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Event {
  _Event(this.stamp, this.text, this.color, this.icon, [this.role]);
  final int stamp;
  final String text;
  final Color color;
  final IconData icon;
  final Role? role;
}

_Event? _latestEvent(GameState s, String myId) {
  String n(String id, String name) => id == myId ? 'Você' : name;
  final events = <_Event>[
    if (s.lastResolved != null)
      _Event(
        s.lastResolved!.stamp,
        s.lastResolved!.summary,
        CoupColors.gold,
        Icons.campaign,
      ),
    if (s.lastReveal != null)
      _Event(
        s.lastReveal!.stamp,
        s.lastReveal!.proven
            ? '${n(s.lastReveal!.playerId, s.lastReveal!.playerName)} provou ter ${roleLabel(s.lastReveal!.role)}!'
            : '${n(s.lastReveal!.playerId, s.lastReveal!.playerName)} blefou ${roleLabel(s.lastReveal!.role)}!',
        s.lastReveal!.proven ? CoupColors.success : CoupColors.bluff,
        Icons.visibility,
        s.lastReveal!.role,
      ),
    if (s.lastLoss != null)
      _Event(
        s.lastLoss!.stamp,
        '${n(s.lastLoss!.playerId, s.lastLoss!.playerName)} perdeu ${roleLabel(s.lastLoss!.role)}.',
        CoupColors.error,
        Icons.heart_broken,
        s.lastLoss!.role,
      ),
  ];
  if (events.isEmpty) return null;
  events.sort((a, b) => b.stamp.compareTo(a.stamp));
  return events.first;
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 14, color: CoupColors.textMuted),
      const SizedBox(width: 4),
      Text(
        text,
        style: const TextStyle(fontSize: 12, color: CoupColors.textMuted),
      ),
    ],
  );
}

// --------------------------------------------------------------- game over

class _GameOverPanel extends StatelessWidget {
  const _GameOverPanel({required this.state, required this.controller});
  final GameState state;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final winner = state.playerById(state.winner);
    final iWon = winner?.id == controller.myId;
    final stats = state.matchStats?.perPlayer ?? const {};
    return Container(
      color: Colors.black.withValues(alpha: 0.75),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(20),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 460),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: CoupColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: iWon ? CoupColors.gold : CoupColors.red,
            width: 1.5,
          ),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                iWon ? Icons.emoji_events : Icons.sentiment_dissatisfied,
                size: 56,
                color: iWon ? CoupColors.goldHigh : CoupColors.error,
              ),
              const SizedBox(height: 8),
              Text(
                iWon ? 'VITÓRIA!' : 'DERROTA',
                style: TextStyle(
                  fontSize: 28,
                  letterSpacing: 6,
                  fontWeight: FontWeight.w900,
                  color: iWon ? CoupColors.goldHigh : CoupColors.error,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                winner == null
                    ? 'Ninguém dominou a corte.'
                    : 'O reino agora pertence a ${winner.name}.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: CoupColors.textSecondary),
              ),
              const SizedBox(height: 16),
              for (final p in state.players)
                if (stats[p.id] != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          p.id == state.winner
                              ? Icons.emoji_events
                              : Icons.person_outline,
                          size: 18,
                          color: p.id == state.winner
                              ? CoupColors.goldHigh
                              : CoupColors.textMuted,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.name,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                'Desafios ${stats[p.id]!.challengesWon}/${stats[p.id]!.challengesMade} · '
                                'Blefes ${stats[p.id]!.bluffsSurvived} · '
                                'Moedas +${stats[p.id]!.coinsGained}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: CoupColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('MENU'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: controller.playAgain,
                      child: const Text('JOGAR DE NOVO'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// --------------------------------------------------------------------- log

class _LogDrawer extends StatelessWidget {
  const _LogDrawer({required this.logs});
  final List<String> logs;

  @override
  Widget build(BuildContext context) => Drawer(
    backgroundColor: CoupColors.secondary,
    child: SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'REGISTRO DA CORTE',
              style: TextStyle(
                letterSpacing: 3,
                fontWeight: FontWeight.w800,
                color: CoupColors.gold,
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: logs.length,
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  logs[logs.length - 1 - i],
                  style: const TextStyle(
                    fontSize: 13,
                    color: CoupColors.textSecondary,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

// ------------------------------------------------------------------- lobby

class _LobbyView extends StatelessWidget {
  const _LobbyView({required this.controller});
  final OnlineGameController controller;

  @override
  Widget build(BuildContext context) {
    final s = controller.state!;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              controller.roomName ?? 'Sala',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'Compartilhe o código com seus amigos',
              textAlign: TextAlign.center,
              style: TextStyle(color: CoupColors.textSecondary),
            ),
            const SizedBox(height: 8),
            SelectableText(
              controller.roomCode ?? '',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 36,
                letterSpacing: 10,
                fontWeight: FontWeight.w900,
                color: CoupColors.goldHigh,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'NOBRES (${s.players.length}/6)',
              style: const TextStyle(
                letterSpacing: 2,
                color: CoupColors.textMuted,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 8),
            for (final p in s.players)
              Card(
                color: CoupColors.surface,
                child: ListTile(
                  leading: Icon(
                    p.isBot ? Icons.smart_toy_outlined : Icons.person,
                  ),
                  title: Text(
                    p.name + (p.id == controller.myId ? ' (você)' : ''),
                  ),
                ),
              ),
            const SizedBox(height: 20),
            if (controller.amHost) ...[
              OutlinedButton.icon(
                onPressed: s.players.length < 6 ? controller.addBot : null,
                icon: const Icon(Icons.smart_toy_outlined),
                label: const Text('ADICIONAR BOT'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: controller.startGame,
                child: const Text('INICIAR PARTIDA'),
              ),
            ] else
              const Text(
                'Aguardando o anfitrião iniciar a partida...',
                textAlign: TextAlign.center,
                style: TextStyle(color: CoupColors.textSecondary),
              ),
          ],
        ),
      ),
    );
  }
}
