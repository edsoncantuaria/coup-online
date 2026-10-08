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
import '../widgets/tv.dart';
import 'campaign_screen.dart';
import 'game_screen.dart';
import 'lobby_screen.dart';
import 'rules_screen.dart';

/// Abertura: um close de um personagem, o cartão de título e o menu como
/// créditos. A cada visita o elenco troca quem abre o capítulo.
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
  Role _lead = Role.values[Random().nextInt(Role.values.length)];

  /// O cartão de título entra depois do primeiro plano, uma vez.
  late final AnimationController _open = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
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
    _open.forward();
  }

  @override
  void dispose() {
    _open.dispose();
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

  /// Ao voltar de outra tela, outro personagem abre o capítulo.
  void _recast() {
    final others = Role.values.where((r) => r != _lead).toList();
    setState(() => _lead = others[Random().nextInt(others.length)]);
  }

  String get _playerName => _name.trim().isEmpty ? 'Jogador' : _name.trim();

  Future<void> _editName() async {
    final ctrl = TextEditingController(text: _name);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Seu nome nos créditos'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLength: 16,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'Como os rivais vão te chamar',
          ),
          onSubmitted: (v) => Navigator.pop(context, v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('CANCELAR'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, ctrl.text),
            child: const Text('SALVAR'),
          ),
        ],
      ),
    );
    if (name == null || !mounted) return;
    setState(() => _name = name.trim());
    Settings.save(name: _name);
  }

  Future<void> _go(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    if (!mounted) return;
    _recast();
    _loadCampaign();
  }

  void _playOffline() => _go(
    GameScreen(
      controller: LocalGameController(
        playerName: _playerName,
        botCount: _bots,
        skill: _skill,
        personalities: _personality == null
            ? null
            : List.filled(_bots, _personality!),
      ),
    ),
  );

  void _openQuickPlay() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
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

  void _about() => showAboutDialog(
    context: context,
    applicationName: appName,
    applicationVersion: appVersion,
    children: const [
      Text(
        'Jogo de blefe e influência na corte, inspirado no Coup. Declare '
        'personagens que talvez não tenha, desafie quem mente e seja o último '
        'com influência.',
      ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final wide = size.width >= 900;
    final run = _run;
    final (best, crowns) = _record;

    final campaignTitle = run == null
        ? 'Começar a campanha'
        : 'Continuar o capítulo ${run.court + 1}';
    final campaignCredit = run == null
        ? best > 0
              ? 'Sete cortes até o trono · recorde: $best'
              : 'Sete cortes até o trono'
        : '${courts[run.court].name} · '
              '${run.lives} vida${run.lives == 1 ? '' : 's'} extra'
              '${crowns > 0 ? ' · $crowns coroa${crowns == 1 ? '' : 's'}' : ''}';

    final titleCard = FadeTransition(
      opacity: CurvedAnimation(
        parent: _open,
        curve: const Interval(0.25, 1, curve: Curves.easeOutExpo),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(appName, style: TvType.title(wide ? 112 : 76)),
          ),
          const SizedBox(height: 10),
          Text(appTagline.toUpperCase(), style: TvType.credit(12)),
        ],
      ),
    );

    final menu = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        CueButton(
          label: campaignTitle,
          icon: Icons.play_arrow_rounded,
          onPressed: () => _go(CampaignScreen(playerName: _playerName)),
        ),
        const SizedBox(height: 8),
        Text(
          campaignCredit.toUpperCase(),
          style: TvType.credit(11),
          maxLines: 2,
        ),
        const SizedBox(height: 18),
        CreditLine(
          title: 'Partida rápida',
          credit:
              'Contra $_bots bot${_bots == 1 ? '' : 's'} · '
              '${_skill.label}',
          onTap: _openQuickPlay,
          trailing: const Icon(Icons.tune, color: Tv.creditMuted),
        ),
        CreditLine(
          title: 'Online',
          credit: 'Buscar partida, salas abertas e amigos',
          onTap: () =>
              _go(LobbyScreen(playerName: _playerName, serverUrl: _server)),
          trailing: const Icon(Icons.chevron_right, color: Tv.creditMuted),
        ),
        CreditLine(
          title: 'Como jogar',
          credit: 'Personagens, ações e bloqueios',
          onTap: () => _go(const RulesScreen()),
          trailing: const Icon(Icons.chevron_right, color: Tv.creditMuted),
        ),
      ],
    );

    final starring = _Starring(name: _name, onTap: _editName, onInfo: _about);

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            Expanded(
              flex: 11,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  PushInCloseUp(role: _lead),
                  const _Scrim(horizontal: true),
                  Positioned(
                    left: 56,
                    bottom: 56,
                    right: 24,
                    child: _CastCredit(role: _lead),
                  ),
                ],
              ),
            ),
            Expanded(
              flex: 9,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(48, 20, 56, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      starring,
                      const Spacer(),
                      titleCard,
                      const SizedBox(height: 40),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 440),
                        child: menu,
                      ),
                      const Spacer(),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: size.height * 0.62,
            child: PushInCloseUp(role: _lead),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: size.height * 0.62 + 1,
            child: const _Scrim(horizontal: false),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, c) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: c.maxHeight),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        starring,
                        SizedBox(height: max(120, c.maxHeight * 0.30)),
                        _CastCredit(role: _lead),
                        const SizedBox(height: 18),
                        titleCard,
                        const SizedBox(height: 28),
                        menu,
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Escurece o close para o texto ler por cima (uma película, não um efeito).
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
                Tv.ink.withValues(alpha: 0.55),
                Tv.ink.withValues(alpha: 0.0),
                Tv.ink.withValues(alpha: 0.35),
                Tv.ink,
              ],
        stops: horizontal ? const [0, 0.7, 1] : const [0, 0.22, 0.6, 1],
      ),
    ),
  );
}

/// "Estrelando" e o nome do jogador no alto da abertura; tocar edita o nome.
class _Starring extends StatelessWidget {
  const _Starring({
    required this.name,
    required this.onTap,
    required this.onInfo,
  });
  final String name;
  final VoidCallback onTap;
  final VoidCallback onInfo;

  @override
  Widget build(BuildContext context) {
    final has = name.trim().isNotEmpty;
    return Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Row(
                children: [
                  Text('ESTRELANDO', style: TvType.credit(11)),
                  const SizedBox(width: 10),
                  Flexible(
                    child: Text(
                      has ? name.trim() : 'seu nome aqui',
                      overflow: TextOverflow.ellipsis,
                      style: TvType.name(
                        20,
                        color: has ? Tv.credit : Tv.creditDim,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.edit, size: 14, color: Tv.creditDim),
                ],
              ),
            ),
          ),
        ),
        IconButton(
          tooltip: 'Sobre o $appName',
          onPressed: onInfo,
          icon: const Icon(Icons.info_outline, color: Tv.creditDim),
        ),
      ],
    );
  }
}

/// Crédito do personagem que abre o capítulo ("Rafael · como o Duque").
class _CastCredit extends StatelessWidget {
  const _CastCredit({required this.role});
  final Role role;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: const Duration(milliseconds: 300),
    child: Align(
      key: ValueKey(role),
      alignment: Alignment.centerLeft,
      child: LowerThird(
        name: castName(role),
        role: 'como ${roleArticle(role)}',
        roleColor: roleStyle(role).accent,
        nameSize: 18,
      ),
    ),
  );
}

/// Nome de elenco de cada personagem (as artes trazem esses nomes).
String castName(Role r) => switch (r) {
  Role.duke => 'Rafael',
  Role.assassin => 'Sem nome',
  Role.captain => 'Volk',
  Role.ambassador => 'Teodoro',
  Role.contessa => 'Isabel',
};

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

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Center(
      heightFactor: 1,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Partida rápida', style: TvType.title(34)),
              const SizedBox(height: 28),
              Row(
                children: [
                  Text('OPONENTES', style: TvType.credit(12)),
                  const Spacer(),
                  Text('$bots', style: TvType.figure(22)),
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
              const SizedBox(height: 16),
              Text('DIFICULDADE', style: TvType.credit(12)),
              const SizedBox(height: 10),
              SegmentedButton<BotSkill>(
                showSelectedIcon: false,
                segments: [
                  for (final s in BotSkill.values)
                    ButtonSegment(value: s, label: Text(s.label)),
                ],
                selected: {skill},
                onSelectionChanged: (v) => onSkill(v.first),
              ),
              const SizedBox(height: 10),
              Text(switch (skill) {
                BotSkill.easy => 'Bots distraídos, bons para aprender.',
                BotSkill.normal =>
                  'Bots que lembram do que foi provado na mesa.',
                BotSkill.hard =>
                  'Contam cartas, lembram de cada blefe e calculam o risco.',
              }, style: const TextStyle(fontSize: 14, color: Tv.creditDim)),
              const SizedBox(height: 24),
              Text('ESTILO DOS RIVAIS', style: TvType.credit(12)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ChoiceChip(
                    label: Text(
                      'Variados',
                      style: TextStyle(
                        color: personality == null ? Tv.ink : Tv.credit,
                      ),
                    ),
                    selected: personality == null,
                    showCheckmark: false,
                    onSelected: (_) => onPersonality(null),
                  ),
                  for (final p in BotPersonality.values)
                    ChoiceChip(
                      label: Text(
                        personalityLabel(p),
                        style: TextStyle(
                          color: personality == p ? Tv.ink : Tv.credit,
                        ),
                      ),
                      selected: personality == p,
                      showCheckmark: false,
                      onSelected: (_) => onPersonality(p),
                    ),
                ],
              ),
              const SizedBox(height: 32),
              CueButton(
                label: 'Jogar',
                icon: Icons.play_arrow_rounded,
                onPressed: onPlay,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
