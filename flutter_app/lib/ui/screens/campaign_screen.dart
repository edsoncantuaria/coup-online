import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../campaign/campaign.dart';
import '../../campaign/campaign_store.dart';
import '../../engine/models.dart';
import '../../game/local_game_controller.dart';
import '../theme.dart';
import '../widgets/tv.dart';
import 'game_screen.dart';

/// Modo campanha: uma temporada da novela em sete capítulos (as cortes),
/// cada partida com uma punição sorteada. Algumas vitórias dão uma bênção;
/// perder sem vidas encerra a temporada.
class CampaignScreen extends StatefulWidget {
  const CampaignScreen({super.key, required this.playerName});
  final String playerName;

  @override
  State<CampaignScreen> createState() => _CampaignScreenState();
}

class _CampaignScreenState extends State<CampaignScreen> {
  final _rng = Random();
  CampaignRun? _run;
  (int, int) _record = (0, 0);
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final run = await CampaignStore.loadRun();
    final record = await CampaignStore.record();
    if (!mounted) return;
    setState(() {
      _run = run;
      _record = record;
      _loading = false;
    });
  }

  Future<void> _save() async {
    await CampaignStore.saveRun(_run);
    final record = await CampaignStore.record();
    if (mounted) setState(() => _record = record);
  }

  void _newRun() {
    HapticFeedback.mediumImpact();
    setState(() => _run = CampaignRun.start(random: _rng));
    _save();
  }

  Future<void> _abandon() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Abandonar a campanha?'),
        content: const Text('O progresso desta campanha será perdido.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('CONTINUAR'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('ABANDONAR'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _run = null);
    await CampaignStore.saveRun(null);
  }

  Future<void> _play() async {
    final run = _run!;
    final setup = MatchSetup.forRun(run, _rng);
    final controller = LocalGameController(
      playerName: widget.playerName,
      botCount: setup.botCount,
      personalities: setup.personalities,
      turnSeconds: setup.turnSeconds,
      houseRules: setup.rules,
      keenEye: setup.keenEye,
      skills: setup.skills,
      random: _rng,
    );
    final won = await Navigator.of(context).push<bool>(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 350),
        pageBuilder: (_, _, _) =>
            GameScreen(controller: controller, campaign: run),
        transitionsBuilder: (_, anim, _, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
    if (!mounted) return;
    final court = run.court;
    setState(() => run.finishMatch(won == true, _rng));
    if (run.status == RunStatus.won) await CampaignStore.addCrown();
    await _save();
    if (!mounted) return;
    if (won == true &&
        run.status == RunStatus.active &&
        !run.choosingBlessing &&
        blessingRewardAt(court) == BlessingReward.chance) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('A sorte não sorriu: nenhuma bênção desta vez.'),
        ),
      );
    }
    if (won != true && run.status == RunStatus.active) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Você perdeu uma vida. Nova punição sorteada para a revanche.',
          ),
        ),
      );
    }
  }

  void _choose(BlessingId b) {
    HapticFeedback.mediumImpact();
    setState(() => _run!.chooseBlessing(b, _rng));
    _save();
  }

  @override
  Widget build(BuildContext context) {
    final run = _run;
    // Entre um estado e outro a novela corta seco, sem transição.
    final Widget body = _loading
        ? const Center(child: CircularProgressIndicator())
        : run == null
        ? _Intro(
            key: const ValueKey('intro'),
            record: _record,
            onStart: _newRun,
          )
        : run.status != RunStatus.active
        ? _Finished(
            key: ValueKey('end-${run.seed}'),
            run: run,
            onRestart: _newRun,
          )
        : run.choosingBlessing
        ? _BlessingChoice(
            key: ValueKey('offer-${run.court}'),
            run: run,
            onChoose: _choose,
          )
        : _NextCourt(
            key: ValueKey('court-${run.seed}-${run.court}-${run.lives}'),
            run: run,
            onPlay: _play,
          );
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: WidgetStateColor.resolveWith(
          (s) => s.contains(WidgetState.scrolledUnder)
              ? Tv.ink
              : Colors.transparent,
        ),
        scrolledUnderElevation: 0,
        actions: [
          if (run != null && run.status == RunStatus.active)
            IconButton(
              tooltip: 'Abandonar campanha',
              icon: const Icon(Icons.flag_outlined),
              onPressed: _abandon,
            ),
        ],
      ),
      body: body,
    );
  }
}

// ------------------------------------------------------------------ palco

/// Quem abre cada capítulo da temporada.
const _courtLead = [
  Role.ambassador, // Vila de Pedra
  Role.captain, // Taverna do Porto
  Role.duke, // Mercado de Sedas
  Role.assassin, // Mosteiro Sombrio
  Role.captain, // Fortaleza do Norte
  Role.contessa, // Salão dos Espelhos
  Role.duke, // Trono de Ferro
];

/// Moldura de toda a campanha: o close do personagem com o cartão de título
/// por cima, a faixa do letterbox com a deixa e o texto embaixo. Em telas
/// largas o close fica à esquerda, como na abertura.
class _Stage extends StatelessWidget {
  const _Stage({
    required this.role,
    required this.cue,
    required this.title,
    required this.children,
    this.frozen = false,
    this.hot = false,
    this.band = 0.42,
  });
  final Role role;
  final String cue;
  final Widget title;
  final List<Widget> children;

  /// Congelamento do gancho: o close perde a cor.
  final bool frozen;
  final bool hot;

  /// Fração da altura da tela que o close ocupa no celular.
  final double band;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final shot = CloseUp(role: role, grayscale: frozen);
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );

    if (size.width >= 900) {
      return Row(
        children: [
          Expanded(
            flex: 11,
            child: Stack(
              fit: StackFit.expand,
              children: [
                shot,
                const _Scrim(horizontal: true),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: LetterboxBar(cue: cue, hot: hot, height: 40),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 9,
            child: SafeArea(
              left: false,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(48, 72, 56, 40),
                children: [
                  title,
                  const SizedBox(height: 32),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 480),
                      child: content,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    final bandHeight = (size.height * band).clamp(180.0, 400.0);
    return ListView(
      padding: EdgeInsets.only(
        bottom: 28 + MediaQuery.paddingOf(context).bottom,
      ),
      children: [
        SizedBox(
          height: bandHeight,
          child: Stack(
            fit: StackFit.expand,
            children: [
              shot,
              const _Scrim(horizontal: false),
              Positioned(left: 20, right: 20, bottom: 18, child: title),
            ],
          ),
        ),
        LetterboxBar(cue: cue, hot: hot),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: content,
            ),
          ),
        ),
      ],
    );
  }
}

/// Película sobre o close para o texto ler por cima.
class _Scrim extends StatelessWidget {
  const _Scrim({required this.horizontal});
  final bool horizontal;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: horizontal ? Alignment.centerLeft : Alignment.topCenter,
        end: horizontal ? Alignment.centerRight : Alignment.bottomCenter,
        colors: horizontal
            ? [
                Tv.ink.withValues(alpha: 0.0),
                Tv.ink.withValues(alpha: 0.15),
                Tv.ink,
              ]
            : [
                Tv.ink.withValues(alpha: 0.6),
                Tv.ink.withValues(alpha: 0.0),
                Tv.ink.withValues(alpha: 0.45),
                Tv.ink,
              ],
        stops: horizontal ? const [0, 0.75, 1] : const [0, 0.3, 0.62, 1],
      ),
    ),
  );
}

/// Cartão de título: o nome em Bodoni e, se houver, uma linha embaixo.
class _TitleCard extends StatelessWidget {
  const _TitleCard(this.title, {this.below});
  final String title;
  final Widget? below;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(title, style: TvType.title(44)),
      if (below != null) ...[const SizedBox(height: 10), below!],
    ],
  );
}

/// Linha de crédito só de leitura: título em itálico, texto embaixo e o fio.
class _Credit extends StatelessWidget {
  const _Credit(this.title, this.body);
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 14),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Tv.rule)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: TvType.name(21)),
        const SizedBox(height: 4),
        Text(body, style: _body),
      ],
    ),
  );
}

const _body = TextStyle(fontSize: 15, height: 1.4, color: Tv.creditDim);

// ------------------------------------------------------------------ intro

class _Intro extends StatelessWidget {
  const _Intro({super.key, required this.record, required this.onStart});
  final (int, int) record;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final (best, crowns) = record;
    return _Stage(
      role: Role.duke,
      cue: 'SETE CAPÍTULOS ATÉ O TRONO',
      title: const _TitleCard('A Ascensão ao Trono'),
      children: [
        CueButton(
          label: 'Nova campanha',
          icon: Icons.play_arrow_rounded,
          onPressed: onStart,
        ),
        if (best > 0 || crowns > 0) ...[
          const SizedBox(height: 10),
          Text(
            (crowns > 0
                    ? 'Campanhas completas: $crowns · Recorde: $best cortes'
                    : 'Recorde: $best corte${best == 1 ? '' : 's'} '
                          'vencida${best == 1 ? '' : 's'}')
                .toUpperCase(),
            style: TvType.credit(12, color: Tv.credit),
          ),
        ],
        const SizedBox(height: 12),
        const _Credit(
          'Sete cortes',
          'Atravesse 7 cortes, da Vila de Pedra ao Trono de Ferro. Cada '
              'uma é um capítulo da temporada.',
        ),
        const _Credit(
          'Uma punição por partida',
          'Cada partida sorteia uma punição diferente contra você.',
        ),
        const _Credit(
          'Bênçãos raras',
          'Vencer as cortes 1 e 4 garante uma, e a corte 6 dá 50% de '
              'chance. Elas valem até o fim.',
        ),
        _Credit(
          'Vida extra',
          'Você tem $startingLives vida extra. Perder sem vidas encerra a '
              'campanha.',
        ),
      ],
    );
  }
}

// ------------------------------------------------------------ próxima corte

/// O capítulo a seguir: a faixa da temporada, vidas e bênçãos, e o sorteio
/// da punição, que termina num congelamento de cena.
class _NextCourt extends StatefulWidget {
  const _NextCourt({super.key, required this.run, required this.onPlay});
  final CampaignRun run;
  final VoidCallback onPlay;

  /// Sorteios já mostrados: só anima a primeira vez que cada um aparece.
  static final Set<String> _seen = {};

  @override
  State<_NextCourt> createState() => _NextCourtState();
}

class _NextCourtState extends State<_NextCourt>
    with SingleTickerProviderStateMixin {
  static const _steps = 14;

  late List<Curse> _shown = _final;
  bool _landed = true;
  bool _started = false;
  Timer? _timer;

  /// O soco do congelamento: o nome assenta de um pouco maior para o normal.
  late final AnimationController _freeze = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
    value: 1,
  );

  List<Curse> get _final => [for (final c in widget.run.curses) curseInfo[c]!];

  String get _key =>
      '${widget.run.seed}-${widget.run.court}-${widget.run.lives}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (!_NextCourt._seen.add(_key)) return;
    if (MediaQuery.of(context).disableAnimations) {
      HapticFeedback.heavyImpact();
      return;
    }
    _landed = false;
    _shown = _frame(0);
    HapticFeedback.selectionClick();
    _timer = Timer(const Duration(milliseconds: 50), () => _spin(1));
  }

  List<Curse> _frame(int step) {
    final all = curseInfo.values.toList();
    return [
      for (final c in widget.run.curses) all[(step * 5 + c.index) % all.length],
    ];
  }

  void _spin(int step) {
    if (!mounted) return;
    if (step >= _steps) {
      setState(() {
        _shown = _final;
        _landed = true;
      });
      _freeze.forward(from: 0);
      HapticFeedback.heavyImpact();
      return;
    }
    setState(() => _shown = _frame(step));
    HapticFeedback.selectionClick();
    // Cada corte demora mais que a anterior, até parar.
    _timer = Timer(
      Duration(milliseconds: 50 + step * step * 3),
      () => _spin(step + 1),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _freeze.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final run = widget.run;
    final court = run.currentCourt;
    final rivals = court.bots + (run.hasCurse(CurseId.crowdedCourt) ? 1 : 0);
    final many = run.curses.length > 1;
    return _Stage(
      role: _courtLead[run.court],
      band: 0.30,
      frozen: _landed,
      hot: _landed,
      cue: _landed
          ? (many ? 'PUNIÇÕES SORTEADAS' : 'PUNIÇÃO SORTEADA')
          : 'SORTEIO',
      title: _TitleCard(
        'Corte ${run.court + 1}',
        below: Text(
          court.name.toUpperCase(),
          style: TvType.credit(13, color: Tv.credit, weight: FontWeight.w700),
        ),
      ),
      children: [
        Text(
          '$rivals rival${rivals == 1 ? '' : 'is'}'
                  '${court.hardBots > 0 ? ' (${court.hardBots} de elite)' : ''}'
              .toUpperCase(),
          style: TvType.credit(12),
        ),
        const SizedBox(height: 12),
        for (final (i, c) in _shown.indexed)
          _CurseLine(
            curse: c,
            drawn: curseInfo[run.curses[i]]!,
            landed: _landed,
            freeze: _freeze,
          ),
        const SizedBox(height: 16),
        CueButton(
          label: 'Enfrentar a corte',
          icon: Icons.gavel,
          onPressed: widget.onPlay,
        ),
        const SizedBox(height: 32),
        _CourtStrip(run: run),
        const SizedBox(height: 8),
        _RunStatus(run: run),
      ],
    );
  }
}

/// Uma punição como linha de crédito: o papel à esquerda, o nome à direita.
/// Enquanto sorteia, os nomes cortam secos em cinza; ao parar, a cena
/// congela com o fio em carmim.
class _CurseLine extends StatelessWidget {
  const _CurseLine({
    required this.curse,
    required this.drawn,
    required this.landed,
    required this.freeze,
  });

  /// O que está na tela agora (muda a cada corte do sorteio).
  final Curse curse;

  /// A punição sorteada: a descrição dela já reserva o espaço, invisível,
  /// para nada pular quando a cena congela.
  final Curse drawn;
  final bool landed;
  final Animation<double> freeze;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 16),
    decoration: BoxDecoration(
      border: Border(top: BorderSide(color: landed ? Tv.carmine : Tv.rule)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 92,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                landed ? 'PUNIÇÃO' : 'SORTEANDO...',
                style: TvType.credit(
                  11,
                  color: landed ? Tv.credit : Tv.creditMuted,
                  weight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              Icon(
                curse.icon,
                size: 26,
                color: landed ? Tv.carmineText : Tv.creditMuted,
              ),
            ],
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AnimatedBuilder(
                animation: freeze,
                builder: (context, child) => Transform.scale(
                  alignment: Alignment.centerLeft,
                  scale:
                      1 +
                      0.12 * (1 - Curves.easeOutExpo.transform(freeze.value)),
                  child: child,
                ),
                child: Text(
                  curse.name,
                  style: TvType.name(
                    26,
                    color: landed ? Tv.credit : Tv.creditMuted,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Opacity(
                opacity: landed ? 1 : 0,
                child: Text(drawn.description, style: _body),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Vidas e bênçãos acumuladas.
class _RunStatus extends StatelessWidget {
  const _RunStatus({required this.run});
  final CampaignRun run;

  @override
  Widget build(BuildContext context) {
    final lives = run.lives;
    return Wrap(
      spacing: 20,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Semantics(
          label: lives == 0
              ? 'Última vida'
              : '$lives vida${lives == 1 ? '' : 's'} extra',
          excludeSemantics: true,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < 1 + lives; i++)
                  const Padding(
                    padding: EdgeInsets.only(right: 2),
                    child: Icon(Icons.favorite, size: 16, color: Tv.credit),
                  ),
                const SizedBox(width: 6),
                Text(
                  lives == 0
                      ? 'ÚLTIMA VIDA'
                      : '$lives VIDA${lives == 1 ? '' : 'S'} EXTRA',
                  style: TvType.credit(12, color: Tv.credit),
                ),
              ],
            ),
          ),
        ),
        for (final b in run.blessings.toSet())
          Tooltip(
            message:
                '${blessingInfo[b]!.name}: ${blessingInfo[b]!.description}',
            triggerMode: TooltipTriggerMode.tap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(blessingInfo[b]!.icon, size: 16, color: Tv.proven),
                  const SizedBox(width: 6),
                  Text(
                    (run.count(b) > 1
                            ? '${blessingInfo[b]!.name} ×${run.count(b)}'
                            : blessingInfo[b]!.name)
                        .toUpperCase(),
                    style: TvType.credit(12, color: Tv.credit),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// A temporada em faixa: os sete capítulos, com as bênçãos marcadas.
class _CourtStrip extends StatelessWidget {
  const _CourtStrip({required this.run});
  final CampaignRun run;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < courts.length; i++)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: i == courts.length - 1 ? 0 : 4),
                child: _cell(i),
              ),
            ),
        ],
      ),
      const SizedBox(height: 10),
      Wrap(
        spacing: 18,
        runSpacing: 6,
        children: const [
          _Legend(Icons.auto_awesome, 'Bênção garantida'),
          _Legend(Icons.casino, '50% de chance de bênção'),
        ],
      ),
    ],
  );

  Widget _cell(int i) {
    final done = i < run.court;
    final current = i == run.court;
    final reward = blessingRewardAt(i);
    final color = current
        ? Tv.credit
        : done
        ? Tv.creditDim
        : Tv.creditMuted;
    final rewardText = switch (reward) {
      BlessingReward.sure => ' · bênção garantida',
      BlessingReward.chance => ' · 50% de chance de bênção',
      BlessingReward.none => '',
    };
    return Tooltip(
      message:
          'Corte ${i + 1}: ${courts[i].name}'
          '${done ? ' (vencida)' : ''}$rewardText',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: current ? 3 : 1,
            color: current
                ? Tv.credit
                : done
                ? Tv.creditDim
                : Tv.rule,
          ),
          SizedBox(
            height: 40,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${i + 1}',
                  style: TvType.figure(current ? 30 : 20, color: color),
                ),
                if (done) ...[
                  const SizedBox(width: 2),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 2),
                    child: Icon(Icons.check, size: 13, color: Tv.creditDim),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: 16,
            child: switch (reward) {
              BlessingReward.sure => const Icon(
                Icons.auto_awesome,
                size: 16,
                color: Tv.proven,
              ),
              BlessingReward.chance => const Icon(
                Icons.casino,
                size: 16,
                color: Tv.proven,
              ),
              BlessingReward.none => null,
            },
          ),
        ],
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 14, color: Tv.proven),
      const SizedBox(width: 6),
      Text(text.toUpperCase(), style: TvType.credit(11)),
    ],
  );
}

// ---------------------------------------------------------------- bênção

class _BlessingChoice extends StatelessWidget {
  const _BlessingChoice({super.key, required this.run, required this.onChoose});
  final CampaignRun run;
  final ValueChanged<BlessingId> onChoose;

  @override
  Widget build(BuildContext context) => _Stage(
    role: Role.contessa,
    cue: 'CORTE ${run.court + 1} VENCIDA',
    title: _TitleCard('${run.currentCourt.name} conquistada!'),
    children: [
      _RunStatus(run: run),
      const SizedBox(height: 6),
      Text(
        'Escolha uma bênção. Ela vale até o fim da campanha.',
        style: _body.copyWith(fontSize: 16, color: Tv.credit),
      ),
      const SizedBox(height: 10),
      for (final id in run.offer)
        _BlessingLine(
          blessing: blessingInfo[id]!,
          owned: run.count(id),
          onTap: () => onChoose(id),
        ),
    ],
  );
}

/// Bênção oferecida como linha de crédito tocável.
class _BlessingLine extends StatelessWidget {
  const _BlessingLine({
    required this.blessing,
    required this.owned,
    required this.onTap,
  });
  final Blessing blessing;
  final int owned;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    child: InkWell(
      onTap: onTap,
      splashColor: Tv.carmine.withValues(alpha: 0.18),
      highlightColor: Tv.carmine.withValues(alpha: 0.08),
      child: Container(
        constraints: const BoxConstraints(minHeight: 72),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Tv.rule)),
        ),
        child: Row(
          children: [
            Icon(blessing.icon, size: 24, color: Tv.proven),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    owned > 0 ? '${blessing.name} (+1)' : blessing.name,
                    style: TvType.name(24),
                  ),
                  const SizedBox(height: 4),
                  Text(blessing.description, style: _body),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right, color: Tv.creditMuted),
          ],
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ fim

/// Cartão de fim de temporada, com os capítulos que passaram nos créditos.
class _Finished extends StatelessWidget {
  const _Finished({super.key, required this.run, required this.onRestart});
  final CampaignRun run;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    final won = run.status == RunStatus.won;
    final cleared = run.history.where((h) => h.won).length;
    return _Stage(
      role: won ? Role.duke : Role.assassin,
      frozen: !won,
      hot: !won,
      cue: 'FIM DA CAMPANHA',
      title: _TitleCard(
        won ? 'O Trono é seu!' : 'Sua campanha terminou',
        below: Text(
          won
              ? 'Você venceu as ${courts.length} cortes.'
              : 'Caiu em ${run.currentCourt.name}, depois de vencer '
                    '$cleared corte${cleared == 1 ? '' : 's'}.',
          style: _body.copyWith(color: Tv.credit),
        ),
      ),
      children: [
        for (final h in run.history) _HistoryLine(result: h),
        const SizedBox(height: 28),
        CueButton(
          label: 'Nova campanha',
          icon: Icons.replay,
          onPressed: onRestart,
        ),
      ],
    );
  }
}

class _HistoryLine extends StatelessWidget {
  const _HistoryLine({required this.result});
  final CourtResult result;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 12),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Tv.rule)),
    ),
    child: Row(
      children: [
        SizedBox(
          width: 36,
          child: Text('${result.court + 1}', style: TvType.figure(20)),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(courts[result.court].name, style: TvType.name(19)),
              const SizedBox(height: 3),
              Text(
                result.curses
                    .map((c) => curseInfo[c]!.name)
                    .join(' + ')
                    .toUpperCase(),
                style: TvType.credit(11),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Icon(
          result.won ? Icons.check : Icons.close,
          size: 18,
          color: result.won ? Tv.proven : Tv.carmineText,
        ),
        const SizedBox(width: 6),
        Text(
          result.won ? 'VENCEU' : 'CAIU',
          style: TvType.credit(11, color: Tv.credit, weight: FontWeight.w700),
        ),
      ],
    ),
  );
}
