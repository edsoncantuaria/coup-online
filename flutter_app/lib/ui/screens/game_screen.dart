import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../../game/online_game_controller.dart';
import '../theme.dart';
import '../widgets/arena.dart';
import '../widgets/my_panel.dart';
import '../widgets/opponent_seat.dart';
import '../widgets/table_extras.dart';
import 'rules_screen.dart';

/// Largura a partir da qual o registro vira uma coluna fixa ao lado da mesa.
const _wideBreakpoint = 900.0;

class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.controller});
  final GameController controller;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  GameController get c => widget.controller;
  int? _lastInvalidStamp;
  bool _wasMyDecision = false;

  @override
  void initState() {
    super.initState();
    _lastInvalidStamp = c.state?.lastInvalid?.stamp;
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
    final messenger = ScaffoldMessenger.of(context);
    final notice = c.takeNotice();
    if (notice != null) {
      messenger.showSnackBar(SnackBar(content: Text(notice)));
    }
    final inv = c.state?.lastInvalid;
    if (inv != null && inv.stamp != _lastInvalidStamp) {
      _lastInvalidStamp = inv.stamp;
      messenger.showSnackBar(
        SnackBar(
          content: Text(inv.reason),
          backgroundColor: CoupColors.redDeep,
        ),
      );
    }
    final mine = c.isMyDecision;
    if (mine && !_wasMyDecision) HapticFeedback.mediumImpact();
    _wasMyDecision = mine;
    setState(() {});
  }

  bool get _canLeaveFreely {
    final s = c.state;
    return s == null || !c.started || s.phase == Phase.gameOver;
  }

  Future<void> _confirmLeave() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: CoupColors.surface,
        title: const Text('Sair da partida?'),
        content: Text(
          c.isOnline
              ? 'Você será removido da sala e não poderá voltar a esta partida.'
              : 'A partida atual será perdida.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Continuar jogando'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: CoupColors.red,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sair'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = c.state;
    final wide = MediaQuery.sizeOf(context).width >= _wideBreakpoint;
    final showTable = s != null && c.started;

    return PopScope(
      canPop: _canLeaveFreely,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmLeave();
      },
      child: Scaffold(
        appBar: AppBar(
          title: _title(s),
          actions: [
            IconButton(
              tooltip: 'Regras',
              icon: const Icon(Icons.menu_book_outlined),
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const RulesScreen())),
            ),
            if (showTable && !wide)
              Builder(
                builder: (ctx) => IconButton(
                  tooltip: 'Registro',
                  icon: const Icon(Icons.receipt_long_outlined),
                  onPressed: () => Scaffold.of(ctx).openEndDrawer(),
                ),
              ),
          ],
        ),
        endDrawer: showTable && !wide
            ? Drawer(
                backgroundColor: CoupColors.secondary,
                child: SafeArea(child: LogPanel(logs: s.logs)),
              )
            : null,
        body: s == null
            ? const Center(child: CircularProgressIndicator())
            : !c.started
            ? LobbyView(controller: c as OnlineGameController)
            : Row(
                children: [
                  Expanded(child: _table(s, wide)),
                  if (wide)
                    Container(
                      width: 320,
                      decoration: const BoxDecoration(
                        color: CoupColors.secondary,
                        border: Border(
                          left: BorderSide(color: CoupColors.border),
                        ),
                      ),
                      child: SafeArea(child: LogPanel(logs: s.logs)),
                    ),
                ],
              ),
      ),
    );
  }

  Widget _title(GameState? s) {
    final main = c.isOnline ? 'Sala ${c.roomCode ?? ''}' : 'Coup';
    final stats = s?.matchStats;
    return Column(
      children: [
        Text(
          main.toUpperCase(),
          style: const TextStyle(
            letterSpacing: 4,
            fontWeight: FontWeight.w800,
            fontSize: 15,
          ),
        ),
        if (s != null && c.started)
          Text(
            [
              if (stats != null) 'Rodada ${stats.round}',
              'Corte: ${s.deckCount} cartas',
            ].join(' · '),
            style: const TextStyle(fontSize: 11, color: CoupColors.textMuted),
          ),
      ],
    );
  }

  Widget _table(GameState s, bool wide) {
    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 14, 8, 0),
              child: _opponents(s, wide),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 520),
                    child: Builder(
                      builder: (ctx) => Arena(
                        state: s,
                        myId: c.myId,
                        showRecentLog: !wide,
                        onOpenLog: wide
                            ? null
                            : () => Scaffold.of(ctx).openEndDrawer(),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: MyPanel(controller: c),
              ),
            ),
          ],
        ),
        Positioned.fill(
          child: FlashReveal(state: s, myId: c.myId),
        ),
        if (s.phase == Phase.gameOver)
          Positioned.fill(
            child: GameOverPanel(state: s, controller: c),
          ),
      ],
    );
  }

  Widget _opponents(GameState s, bool wide) {
    final others = s.players.where((p) => p.id != c.myId).toList();
    final pending = c.pendingActorId;
    final a = s.currentAction;
    final inResponse = s.phase != Phase.action && s.phase != Phase.gameOver;

    return LayoutBuilder(
      builder: (context, box) {
        // Até 3 por linha no celular; todos numa linha em telas largas.
        final perRow = wide || others.length <= 3 ? others.length : 3;
        final width = (box.maxWidth / (perRow == 0 ? 1 : perRow)).clamp(
          96.0,
          150.0,
        );
        return Wrap(
          alignment: WrapAlignment.center,
          runSpacing: 14,
          children: [
            for (final p in others)
              OpponentSeat(
                player: p,
                width: width,
                revealAll: s.phase == Phase.gameOver,
                state: pending == p.id && inResponse
                    ? SeatState.waiting
                    : s.currentPlayer?.id == p.id && s.phase != Phase.gameOver
                    ? SeatState.turn
                    : a?.target == p.id && inResponse
                    ? SeatState.target
                    : SeatState.idle,
                statusLabel: s.pendingBlock?.blockerId == p.id
                    ? 'BLOQUEIA'
                    : a?.target == p.id && inResponse
                    ? 'ALVO'
                    : null,
              ),
          ],
        );
      },
    );
  }
}
