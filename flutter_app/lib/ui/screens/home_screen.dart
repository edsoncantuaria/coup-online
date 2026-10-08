import 'dart:math';

import 'package:flutter/material.dart';

import '../../branding.dart';
import '../../campaign/campaign.dart';
import '../../campaign/campaign_store.dart';
import '../../engine/bot.dart';
import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/local_game_controller.dart';
import '../../settings.dart';
import '../theme.dart';
import '../widgets/emblem.dart';
import '../widgets/influence_card.dart';
import 'campaign_screen.dart';
import 'game_screen.dart';
import 'online_screen.dart';
import 'rules_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  String _name = '';
  String _server = defaultServerUrl;
  int _bots = 3;
  BotPersonality? _personality; // null = sortear
  BotSkill _skill = BotSkill.normal;
  CampaignRun? _run;
  (int, int) _record = (0, 0);

  /// Entrada escalonada das seções.
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    Settings.load().then((v) {
      if (!mounted) return;
      setState(() {
        _name = v.$1;
        _server = v.$2;
      });
    });
    Settings.loadSkill().then((v) {
      final skill = BotSkill.values.where((s) => s.name == v).firstOrNull;
      if (!mounted || skill == null) return;
      setState(() => _skill = skill);
    });
    _loadCampaign();
    _intro.forward();
  }

  @override
  void dispose() {
    _intro.dispose();
    super.dispose();
  }

  Future<void> _loadCampaign() async {
    final run = await CampaignStore.loadRun();
    final record = await CampaignStore.record();
    if (!mounted) return;
    setState(() {
      _run = run?.status == RunStatus.active ? run : null;
      _record = record;
    });
  }

  String get _playerName => _name.trim().isEmpty ? 'Jogador' : _name.trim();

  Future<void> _editName() async {
    final ctrl = TextEditingController(text: _name);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Seu nome na mesa'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLength: 16,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'Como os rivais vão te chamar',
            prefixIcon: Icon(Icons.person_outline),
          ),
          onSubmitted: (v) => Navigator.pop(context, v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, ctrl.text),
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
    if (name == null || !mounted) return;
    setState(() => _name = name.trim());
    Settings.save(name: _name);
  }

  void _playOffline() {
    final controller = LocalGameController(
      playerName: _playerName,
      botCount: _bots,
      skill: _skill,
      personalities: _personality == null
          ? null
          : List.filled(_bots, _personality!),
    );
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => GameScreen(controller: controller)),
    );
  }

  Future<void> _playCampaign() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CampaignScreen(playerName: _playerName),
      ),
    );
    _loadCampaign();
  }

  void _playOnline() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            OnlineScreen(playerName: _playerName, initialServer: _server),
      ),
    );
  }

  void _openRules() =>
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const RulesScreen()));

  void _openQuickPlay() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: CoupColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) {
          void update(VoidCallback f) {
            setState(f);
            setSheet(() {});
          }

          return _QuickPlaySheet(
            bots: _bots,
            skill: _skill,
            personality: _personality,
            onBots: (v) => update(() => _bots = v),
            onSkill: (v) {
              update(() => _skill = v);
              Settings.saveSkill(v.name);
            },
            onPersonality: (v) => update(() => _personality = v),
            onPlay: () {
              Navigator.pop(context);
              _playOffline();
            },
          );
        },
      ),
    );
  }

  /// Seção que entra deslizando, na ordem [i].
  Widget _reveal(int i, Widget child) {
    if (MediaQuery.of(context).disableAnimations) return child;
    final anim = CurvedAnimation(
      parent: _intro,
      curve: Interval(
        min(0.7, i * 0.12),
        min(1, i * 0.12 + 0.45),
        curve: Curves.easeOutCubic,
      ),
    );
    return FadeTransition(
      opacity: anim,
      child: SlideTransition(
        position: Tween(
          begin: const Offset(0, 0.08),
          end: Offset.zero,
        ).animate(anim),
        child: child,
      ),
    );
  }

  List<Widget> _menu() => [
    _reveal(1, _CampaignCard(run: _run, record: _record, onTap: _playCampaign)),
    const SizedBox(height: 14),
    _reveal(
      2,
      Row(
        children: [
          Expanded(
            child: _ModeTile(
              icon: Icons.smart_toy_outlined,
              title: 'PARTIDA RÁPIDA',
              subtitle: 'Contra bots · ${_skill.label}',
              onTap: _openQuickPlay,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _ModeTile(
              icon: Icons.public,
              title: 'ONLINE',
              subtitle: 'Salas com amigos e voz',
              onTap: _playOnline,
            ),
          ),
        ],
      ),
    ),
    const SizedBox(height: 12),
    _reveal(
      3,
      _ModeTile(
        icon: Icons.menu_book_outlined,
        title: 'COMO JOGAR',
        subtitle: 'Personagens, ações e bloqueios',
        onTap: _openRules,
        compact: true,
      ),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final topBar = _TopBar(name: _name, onEditName: _editName);
    const footer = Padding(
      padding: EdgeInsets.only(top: 24, bottom: 8),
      child: Text(
        '$appName · v$appVersion',
        textAlign: TextAlign.center,
        style: TextStyle(color: CoupColors.textMuted, fontSize: 11),
      ),
    );

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: _Backdrop()),
          SafeArea(
            child: wide
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(32, 16, 32, 8),
                    child: Column(
                      children: [
                        topBar,
                        Expanded(
                          child: Row(
                            children: [
                              Expanded(
                                child: Center(
                                  child: _reveal(0, const _Hero(large: true)),
                                ),
                              ),
                              SizedBox(
                                width: 440,
                                child: Center(
                                  child: SingleChildScrollView(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 16,
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [..._menu(), footer],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  )
                : Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 480),
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                        children: [
                          topBar,
                          _reveal(0, const _Hero(large: false)),
                          const SizedBox(height: 8),
                          ..._menu(),
                          footer,
                        ],
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ topo

class _TopBar extends StatelessWidget {
  const _TopBar({required this.name, required this.onEditName});
  final String name;
  final VoidCallback onEditName;

  @override
  Widget build(BuildContext context) {
    final has = name.trim().isNotEmpty;
    return Row(
      children: [
        Material(
          color: CoupColors.surface.withValues(alpha: 0.7),
          shape: StadiumBorder(
            side: BorderSide(color: CoupColors.goldSoft.withValues(alpha: 0.5)),
          ),
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onEditName,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 14, 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 15,
                    backgroundColor: CoupColors.redDeep,
                    child: has
                        ? Text(
                            name.trim()[0].toUpperCase(),
                            style: const TextStyle(
                              fontFamily: displayFont,
                              fontWeight: FontWeight.w700,
                              color: CoupColors.goldHigh,
                            ),
                          )
                        : const Icon(
                            Icons.person,
                            size: 18,
                            color: CoupColors.goldHigh,
                          ),
                  ),
                  const SizedBox(width: 8),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: Text(
                      has ? name.trim() : 'Escolha seu nome',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: has ? CoupColors.text : CoupColors.gold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(
                    Icons.edit_outlined,
                    size: 14,
                    color: CoupColors.textMuted,
                  ),
                ],
              ),
            ),
          ),
        ),
        const Spacer(),
        IconButton(
          tooltip: 'Sobre',
          onPressed: () => showAboutDialog(
            context: context,
            applicationName: appName,
            applicationVersion: appVersion,
            applicationIcon: const Emblem(size: 48),
            children: const [
              Text(
                'Jogo de blefe e influência na corte. Engane, desafie e '
                'seja o último com influência.',
              ),
            ],
          ),
          icon: const Icon(Icons.info_outline, color: CoupColors.textSecondary),
        ),
      ],
    );
  }
}

// ----------------------------------------------------------------- herói

class _Hero extends StatelessWidget {
  const _Hero({required this.large});
  final bool large;

  @override
  Widget build(BuildContext context) {
    final cardW = large ? 104.0 : 70.0;
    return Padding(
      padding: EdgeInsets.symmetric(vertical: large ? 0 : 18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _CardFan(cardWidth: cardW),
          SizedBox(height: large ? 36 : 20),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Emblem(size: large ? 54 : 40),
                SizedBox(width: large ? 16 : 12),
                ShaderMask(
                  shaderCallback: (r) => const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFFF6E2A8), CoupColors.gold],
                  ).createShader(r),
                  child: Text(
                    appName.toUpperCase(),
                    style: TextStyle(
                      fontFamily: displayFont,
                      fontSize: large ? 72 : 46,
                      letterSpacing: large ? 10 : 6,
                      fontWeight: FontWeight.w900,
                      height: 1,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: large ? 14 : 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _rule(),
                const SizedBox(width: 10),
                Text(
                  appTagline.toUpperCase(),
                  style: TextStyle(
                    fontFamily: displayFont,
                    letterSpacing: 3,
                    fontSize: large ? 14 : 11,
                    color: CoupColors.textSecondary,
                  ),
                ),
                const SizedBox(width: 10),
                _rule(flip: true),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _rule({bool flip = false}) => Container(
    width: 28,
    height: 1,
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: flip
            ? [CoupColors.goldSoft, Colors.transparent]
            : [Colors.transparent, CoupColors.goldSoft],
      ),
    ),
  );
}

/// Leque com os cinco personagens, flutuando devagar.
class _CardFan extends StatefulWidget {
  const _CardFan({required this.cardWidth});
  final double cardWidth;

  @override
  State<_CardFan> createState() => _CardFanState();
}

class _CardFanState extends State<_CardFan>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  );

  static const _roles = [
    Role.captain,
    Role.assassin,
    Role.duke,
    Role.contessa,
    Role.ambassador,
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.cardWidth;
    final h = w * 1.45;
    return SizedBox(
      height: h * 1.25,
      width: w * 4.2,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
            // Brilho atrás do leque.
            Container(
              width: w * 3.6,
              height: h,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: CoupColors.gold.withValues(alpha: 0.18),
                    blurRadius: w,
                    spreadRadius: w * 0.1,
                  ),
                ],
              ),
            ),
            for (final i in const [0, 4, 1, 3, 2])
              Transform.translate(
                offset: Offset(
                  (i - 2) * w * 0.62,
                  (i - 2).abs() * w * 0.12 +
                      sin((_c.value + i * 0.2) * 2 * pi) * w * 0.04,
                ),
                child: Transform.rotate(
                  angle: (i - 2) * 0.16,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(w * 0.08),
                      boxShadow: const [
                        BoxShadow(
                          color: Colors.black54,
                          blurRadius: 14,
                          offset: Offset(0, 6),
                        ),
                      ],
                    ),
                    child: InfluenceCard(role: _roles[i], width: w),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Fundo: veludo escuro com brasas douradas subindo devagar.
class _Backdrop extends StatefulWidget {
  const _Backdrop();

  @override
  State<_Backdrop> createState() => _BackdropState();
}

class _BackdropState extends State<_Backdrop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 24),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(
      gradient: RadialGradient(
        center: Alignment(0, -0.5),
        radius: 1.3,
        colors: [Color(0xFF2B1A12), Color(0xFF120D0C), CoupColors.background],
        stops: [0, 0.5, 1],
      ),
    ),
    child: RepaintBoundary(
      child: CustomPaint(painter: _EmbersPainter(_c), size: Size.infinite),
    ),
  );
}

class _EmbersPainter extends CustomPainter {
  _EmbersPainter(this.t) : super(repaint: t);
  final Animation<double> t;

  static final _seeds = List.generate(36, (i) {
    final r = Random(i * 7919);
    return (r.nextDouble(), r.nextDouble(), 0.6 + r.nextDouble() * 1.8);
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    for (final (x0, phase, radius) in _seeds) {
      final p = (t.value + phase) % 1.0;
      final y = size.height * (1 - p);
      final x = size.width * x0 + sin((p + x0) * 6 * pi) * 14;
      final a = sin(p * pi) * 0.35;
      paint.color = CoupColors.goldHigh.withValues(alpha: a);
      canvas.drawCircle(Offset(x, y), radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _EmbersPainter old) => false;
}

// ----------------------------------------------------------------- modos

class _CampaignCard extends StatelessWidget {
  const _CampaignCard({
    required this.run,
    required this.record,
    required this.onTap,
  });
  final CampaignRun? run;
  final (int, int) record;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final run = this.run;
    final (best, crowns) = record;
    return Material(
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF6A1E1E), Color(0xFF2A0C0C)],
          ),
          border: Border.all(color: CoupColors.gold.withValues(alpha: 0.7)),
          boxShadow: [
            BoxShadow(
              color: CoupColors.red.withValues(alpha: 0.25),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: InkWell(
          onTap: onTap,
          child: Stack(
            children: [
              Positioned(
                right: -18,
                bottom: -22,
                child: Icon(
                  Icons.castle,
                  size: 130,
                  color: Colors.black.withValues(alpha: 0.22),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text(
                          'CAMPANHA',
                          style: TextStyle(
                            fontFamily: displayFont,
                            fontWeight: FontWeight.w900,
                            fontSize: 22,
                            letterSpacing: 2,
                            color: CoupColors.goldHigh,
                          ),
                        ),
                        const Spacer(),
                        if (crowns > 0) ...[
                          const Icon(
                            Icons.emoji_events,
                            size: 16,
                            color: CoupColors.goldHigh,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '$crowns',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: CoupColors.goldHigh,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      run == null
                          ? 'Sete cortes até o trono. Cada partida sorteia '
                                'uma punição, e as bênçãos são raras.'
                          : 'Você está na ${courts[run.court].name}.',
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: Color(0xFFE6CFC0),
                      ),
                    ),
                    const SizedBox(height: 14),
                    _CourtDots(reached: run?.court ?? 0, active: run != null),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        if (run != null)
                          for (var i = 0; i < run.lives; i++)
                            const Padding(
                              padding: EdgeInsets.only(right: 2),
                              child: Icon(
                                Icons.favorite,
                                size: 16,
                                color: Color(0xFFE5564E),
                              ),
                            )
                        else if (best > 0)
                          Text(
                            'Recorde: $best de ${courts.length} cortes',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFFE6CFC0),
                            ),
                          ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: CoupColors.goldHigh,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                run == null ? 'COMEÇAR' : 'CONTINUAR',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.5,
                                  fontSize: 13,
                                  color: Color(0xFF2A0C0C),
                                ),
                              ),
                              const SizedBox(width: 4),
                              const Icon(
                                Icons.arrow_forward,
                                size: 16,
                                color: Color(0xFF2A0C0C),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// As sete cortes como um caminho de pontos.
class _CourtDots extends StatelessWidget {
  const _CourtDots({required this.reached, required this.active});
  final int reached;
  final bool active;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (var i = 0; i < courts.length; i++) ...[
        if (i > 0)
          Expanded(
            child: Container(
              height: 1.5,
              color: (active && i <= reached)
                  ? CoupColors.goldHigh
                  : Colors.white.withValues(alpha: 0.18),
            ),
          ),
        Container(
          width: i == courts.length - 1 ? 16 : 10,
          height: i == courts.length - 1 ? 16 : 10,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active && i < reached
                ? CoupColors.goldHigh
                : active && i == reached
                ? CoupColors.red
                : Colors.black.withValues(alpha: 0.3),
            border: Border.all(
              color: active && i <= reached
                  ? CoupColors.goldHigh
                  : Colors.white.withValues(alpha: 0.3),
              width: 1.5,
            ),
          ),
          child: i == courts.length - 1
              ? const Icon(Icons.star, size: 9, color: CoupColors.goldHigh)
              : null,
        ),
      ],
    ],
  );
}

class _ModeTile extends StatelessWidget {
  const _ModeTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.compact = false,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final iconBox = Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: CoupColors.gold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: CoupColors.goldSoft.withValues(alpha: 0.6)),
      ),
      child: Icon(icon, color: CoupColors.goldHigh, size: 22),
    );
    final texts = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            title,
            maxLines: 1,
            style: const TextStyle(
              fontFamily: displayFont,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
              fontSize: 14,
              color: CoupColors.text,
            ),
          ),
        ),
        const SizedBox(height: 3),
        Text(
          subtitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, color: CoupColors.textSecondary),
        ),
      ],
    );
    return Material(
      color: CoupColors.surface.withValues(alpha: 0.85),
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: CoupColors.border),
          ),
          child: compact
              ? Row(
                  children: [
                    iconBox,
                    const SizedBox(width: 12),
                    Expanded(child: texts),
                    const Icon(
                      Icons.chevron_right,
                      color: CoupColors.textMuted,
                    ),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [iconBox, const SizedBox(height: 14), texts],
                ),
        ),
      ),
    );
  }
}

// --------------------------------------------------- partida rápida

class _QuickPlaySheet extends StatelessWidget {
  const _QuickPlaySheet({
    required this.bots,
    required this.skill,
    required this.personality,
    required this.onBots,
    required this.onSkill,
    required this.onPersonality,
    required this.onPlay,
  });
  final int bots;
  final BotSkill skill;
  final BotPersonality? personality;
  final ValueChanged<int> onBots;
  final ValueChanged<BotSkill> onSkill;
  final ValueChanged<BotPersonality?> onPersonality;
  final VoidCallback onPlay;

  static const _label = TextStyle(
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: FontWeight.w800,
    color: CoupColors.gold,
  );

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Center(
      heightFactor: 1,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: CoupColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Partida rápida',
                style: TextStyle(
                  fontFamily: displayFont,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: CoupColors.goldHigh,
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Text('OPONENTES', style: _label),
                  const Spacer(),
                  Text(
                    '$bots',
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
              Slider(
                value: bots.toDouble(),
                min: 1,
                max: 5,
                divisions: 4,
                label: '$bots',
                onChanged: (v) => onBots(v.round()),
              ),
              const SizedBox(height: 8),
              const Text('DIFICULDADE', style: _label),
              const SizedBox(height: 10),
              SegmentedButton<BotSkill>(
                showSelectedIcon: false,
                segments: [
                  for (final s in BotSkill.values)
                    ButtonSegment(
                      value: s,
                      label: Text(s.label),
                      icon: Icon(switch (s) {
                        BotSkill.easy => Icons.sentiment_satisfied,
                        BotSkill.normal => Icons.psychology_outlined,
                        BotSkill.hard => Icons.local_fire_department,
                      }),
                    ),
                ],
                selected: {skill},
                onSelectionChanged: (v) => onSkill(v.first),
              ),
              const SizedBox(height: 6),
              Text(
                switch (skill) {
                  BotSkill.easy => 'Bots distraídos, bons para aprender.',
                  BotSkill.normal =>
                    'Bots que lembram do que foi provado na mesa.',
                  BotSkill.hard =>
                    'Contam cartas, lembram de cada blefe e calculam o risco.',
                },
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  color: CoupColors.textSecondary,
                ),
              ),
              const SizedBox(height: 18),
              const Text('ESTILO DOS RIVAIS', style: _label),
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  ChoiceChip(
                    label: const Text('Variados'),
                    selected: personality == null,
                    onSelected: (_) => onPersonality(null),
                  ),
                  for (final p in BotPersonality.values)
                    ChoiceChip(
                      label: Text(personalityLabel(p)),
                      selected: personality == p,
                      onSelected: (_) => onPersonality(p),
                    ),
                ],
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: onPlay,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                icon: const Icon(Icons.play_arrow_rounded),
                label: const Text('JOGAR'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
