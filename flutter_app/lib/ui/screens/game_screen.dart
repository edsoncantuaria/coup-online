import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../branding.dart';
import '../../campaign/campaign.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../../game/online_game_controller.dart';
import '../../game/voice_chat.dart';
import '../../online/online_hub.dart';
import '../theme.dart';
import '../widgets/card_effects.dart';
import '../widgets/my_panel.dart';
import '../widgets/opponent_seat.dart';
import '../widgets/social_sheets.dart';
import '../widgets/stage.dart';
import '../widgets/table_extras.dart';
import '../widgets/voice_controls.dart';
import 'rules_screen.dart';

/// Largura a partir da qual o registro vira uma coluna fixa ao lado da mesa.
const _wideBreakpoint = 900.0;

class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.controller, this.campaign});
  final GameController controller;

  /// Partida de campanha: mostra as punições e, no fim, devolve à tela da
  /// campanha `true` (vitória) ou `false` (derrota). Sair no meio conta
  /// como derrota.
  final CampaignRun? campaign;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  GameController get c => widget.controller;
  int? _lastInvalidStamp;
  bool _wasMyDecision = false;
  VoiceChat? _voice;
  final _anchors = SeatAnchors();
  final _traces = ClaimTraces();
  int _logCount = 0;

  @override
  void initState() {
    super.initState();
    _lastInvalidStamp = c.state?.lastInvalid?.stamp;
    c.addListener(_onChange);
    final online = c;
    if (online is OnlineGameController) {
      _voice = VoiceChat(online)..addListener(_onVoice);
    }
  }

  void _onVoice() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    c.removeListener(_onChange);
    _voice
      ?..removeListener(_onVoice)
      ..dispose();
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
          content: Text(
            inv.reason,
            style: const TextStyle(color: Colors.white),
          ),
          backgroundColor: Tv.carmineDeep,
        ),
      );
    }
    final s = c.state;
    if (s != null) {
      // Partida nova (jogar de novo): os rastros recomeçam.
      if (s.logs.length < _logCount) _traces.clear();
      _logCount = s.logs.length;
      _traces.observe(s);
    }
    final mine = c.isMyDecision;
    if (mine && !_wasMyDecision) HapticFeedback.mediumImpact();
    _wasMyDecision = mine;
    setState(() {});
  }

  OnlineHub? get _hub {
    final online = c;
    return online is OnlineGameController ? hubOf(online) : null;
  }

  bool get _canLeaveFreely {
    final s = c.state;
    // Na campanha a saída sempre passa por aqui, para devolver o resultado.
    if (widget.campaign != null) return false;
    return s == null || !c.started || s.phase == Phase.gameOver;
  }

  Future<void> _confirmLeave() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sair da partida?'),
        content: Text(
          c.isOnline
              ? 'Você será removido da sala e não poderá voltar a esta partida.'
              : widget.campaign != null
              ? 'Sair agora conta como derrota na campanha.'
              : 'A partida atual será perdida.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Continuar jogando'),
          ),
          FilledButton(
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
        if (didPop) return;
        final s = c.state;
        if (widget.campaign != null && s?.phase == Phase.gameOver) {
          Navigator.of(context).pop(s!.winner == c.myId);
        } else {
          _confirmLeave();
        }
      },
      child: Scaffold(
        backgroundColor: Tv.ink,
        endDrawer: showTable && !wide
            ? Drawer(
                backgroundColor: Tv.stage,
                shape: const RoundedRectangleBorder(),
                child: SafeArea(child: SceneLog(logs: s.logs)),
              )
            : null,
        body: Column(
          children: [
            _topBar(s, showTable, wide),
            Expanded(
              child: s == null
                  ? const Center(child: CircularProgressIndicator())
                  : !c.started
                  ? LobbyView(
                      controller: c as OnlineGameController,
                      voice: _voice,
                    )
                  : Row(
                      children: [
                        Expanded(child: _table(s, wide)),
                        if (wide)
                          Container(
                            width: 320,
                            decoration: const BoxDecoration(
                              color: Tv.stage,
                              border: Border(left: BorderSide(color: Tv.rule)),
                            ),
                            child: SafeArea(
                              top: false,
                              child: SceneLog(logs: s.logs),
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

  /// A faixa de cima do letterbox: título da partida, a deixa da fase e os
  /// controles.
  Widget _topBar(GameState? s, bool showTable, bool wide) {
    final run = widget.campaign;
    final main = c.isOnline
        ? 'Sala ${c.roomCode ?? ''}'
        : run != null
        ? 'Corte ${run.court + 1} de ${courts.length}'
        : appName;
    final stats = s?.matchStats;
    final cue = showTable ? phaseCue(s!) : null;
    return ColoredBox(
      color: Colors.black,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 52,
          child: Row(
            children: [
              IconButton(
                tooltip: 'Voltar',
                icon: const Icon(Icons.arrow_back, color: Tv.creditDim),
                onPressed: () => Navigator.of(context).maybePop(),
              ),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      main,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TvType.name(17),
                    ),
                    if (showTable)
                      Text(
                        [
                          if (stats != null) 'Rodada ${stats.round}',
                          '${s!.deckCount} na Corte',
                        ].join(' · ').toUpperCase(),
                        maxLines: 1,
                        style: TvType.credit(9.5, color: Tv.creditMuted),
                      ),
                  ],
                ),
              ),
              if (cue != null)
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 120),
                  child: Text(
                    cue.cue,
                    key: ValueKey(cue.cue),
                    style: TvType.credit(
                      12,
                      color: cue.hot ? Tv.carmine : Tv.creditDim,
                      weight: FontWeight.w700,
                    ),
                  ),
                ),
              if (_voice != null && s != null) VoiceButton(voice: _voice!),
              Builder(
                builder: (ctx) => PopupMenuButton<String>(
                  tooltip: 'Mais',
                  icon: const Icon(Icons.more_vert, color: Tv.creditDim),
                  onSelected: (v) {
                    if (v == 'log') Scaffold.of(ctx).openEndDrawer();
                    if (v == 'invite') showInviteSheet(context, _hub!);
                    if (v == 'rules') {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const RulesScreen()),
                      );
                    }
                  },
                  itemBuilder: (_) => [
                    if (showTable && !wide)
                      const PopupMenuItem(
                        value: 'log',
                        child: Text('Registro da partida'),
                      ),
                    if (_hub?.account.isLoggedIn == true && !c.started)
                      const PopupMenuItem(
                        value: 'invite',
                        child: Text('Chamar amigos'),
                      ),
                    const PopupMenuItem(value: 'rules', child: Text('Regras')),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _table(GameState s, bool wide) {
    return Stack(
      children: [
        CardEffectsLayer(
          state: s,
          myId: c.myId,
          anchors: _anchors,
          child: Column(
            children: [
              if (widget.campaign != null) _CurseStrip(run: widget.campaign!),
              Padding(
                padding: EdgeInsets.fromLTRB(wide ? 32 : 16, 12, 16, 4),
                child: _cast(s, wide),
              ),
              Expanded(
                child: Stage(state: s, myId: c.myId, traces: _traces),
              ),
              MyPanel(
                controller: c,
                trailing: VoiceBadge(muted: _voice?.voiceOf(c.myId)),
                anchorKey: _anchors.keyFor(c.myId),
              ),
            ],
          ),
        ),
        Positioned.fill(
          child: FreezeFrame(state: s, myId: c.myId),
        ),
        if (s.phase == Phase.gameOver)
          Positioned.fill(
            child: FinalCredits(
              state: s,
              controller: c,
              onPlayer: c is OnlineGameController
                  ? (p) =>
                        showPlayerSheet(context, c as OnlineGameController, p)
                  : null,
              onContinue: widget.campaign == null
                  ? null
                  : () => Navigator.of(context).pop(s.winner == c.myId),
              continueLabel: s.winner == c.myId
                  ? 'Seguir para a próxima corte'
                  : 'Voltar à campanha',
            ),
          ),
      ],
    );
  }

  /// O elenco: os rivais em créditos lado a lado.
  Widget _cast(GameState s, bool wide) {
    final others = s.players.where((p) => p.id != c.myId).toList();
    final pending = c.pendingActorId;
    final a = s.currentAction;
    final inResponse = s.phase != Phase.action && s.phase != Phase.gameOver;
    const gap = 12.0;

    return LayoutBuilder(
      builder: (context, box) {
        // Até 3 por linha no celular; todos numa linha em telas largas.
        final perRow = wide || others.length <= 3 ? others.length : 3;
        final n = perRow == 0 ? 1 : perRow;
        final width = ((box.maxWidth - gap * (n - 1)) / n).clamp(96.0, 200.0);
        return Wrap(
          spacing: gap,
          runSpacing: 8,
          children: [
            for (final p in others)
              _seatTap(
                p,
                OpponentSeat(
                  player: p,
                  width: width,
                  revealAll: s.phase == Phase.gameOver,
                  voice: _voice?.voiceOf(p.id),
                  anchorKey: _anchors.keyFor(p.id),
                  peek: c.peeks[p.id],
                  traces: _traces.of(p.id),
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
              ),
          ],
        );
      },
    );
  }

  /// Online, tocar num rival abre adicionar amigo e denunciar.
  Widget _seatTap(Player p, Widget seat) {
    final online = c;
    if (online is! OnlineGameController || p.isBot) return seat;
    return Semantics(
      button: true,
      label: 'Opções de ${p.name}',
      child: InkWell(
        onTap: () => showPlayerSheet(context, online, p),
        child: seat,
      ),
    );
  }
}

/// Faixa com as punições e bênçãos ativas na partida de campanha. Tocar
/// abre a descrição de cada uma.
class _CurseStrip extends StatelessWidget {
  const _CurseStrip({required this.run});
  final CampaignRun run;

  @override
  Widget build(BuildContext context) {
    final items = [
      for (final c in run.curses) (curseInfo[c]!.name, Tv.carmine),
      for (final b in run.blessings.toSet()) (blessingInfo[b]!.name, Tv.proven),
    ];
    return Material(
      color: Tv.stage,
      child: InkWell(
        onTap: () => showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          builder: (_) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              children: [
                for (final c in run.curses)
                  _rule(curseInfo[c]!.name, curseInfo[c]!.description, true),
                for (final b in run.blessings.toSet())
                  _rule(
                    run.count(b) > 1
                        ? '${blessingInfo[b]!.name} ×${run.count(b)}'
                        : blessingInfo[b]!.name,
                    blessingInfo[b]!.description,
                    false,
                  ),
              ],
            ),
          ),
        ),
        child: Container(
          height: 32,
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Tv.rule)),
          ),
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              for (final (name, color) in items)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: Text(
                      name.toUpperCase(),
                      style: TvType.credit(
                        10,
                        color: color,
                        weight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _rule(String name, String text, bool curse) => Container(
    padding: const EdgeInsets.symmetric(vertical: 10),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Tv.rule)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          (curse ? 'Punição' : 'Bênção').toUpperCase(),
          style: TvType.credit(10, color: curse ? Tv.carmine : Tv.proven),
        ),
        const SizedBox(height: 2),
        Text(name, style: TvType.name(20)),
        const SizedBox(height: 2),
        Text(
          text,
          style: const TextStyle(
            fontFamily: TvType.sans,
            fontSize: 14,
            color: Tv.creditDim,
          ),
        ),
      ],
    ),
  );
}
