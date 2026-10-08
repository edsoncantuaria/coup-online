import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../campaign/campaign.dart';
import '../../campaign/campaign_store.dart';
import '../../game/local_game_controller.dart';
import '../theme.dart';
import 'game_screen.dart';

/// Modo campanha: sete cortes em sequência, cada partida com uma punição
/// sorteada. Algumas vitórias dão uma bênção; perder sem vidas encerra a
/// campanha.
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
        backgroundColor: CoupColors.surface,
        title: const Text('Abandonar a campanha?'),
        content: const Text('O progresso desta campanha será perdido.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Continuar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: CoupColors.red,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Abandonar'),
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
        SnackBar(
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
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'CAMPANHA',
          style: TextStyle(letterSpacing: 4, fontWeight: FontWeight.w800),
        ),
        actions: [
          if (run != null && run.status == RunStatus.active)
            IconButton(
              tooltip: 'Abandonar campanha',
              icon: const Icon(Icons.flag_outlined),
              onPressed: _abandon,
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 350),
                  child: run == null
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
                          key: ValueKey(
                            'court-${run.seed}-${run.court}-${run.lives}',
                          ),
                          run: run,
                          onPlay: _play,
                        ),
                ),
              ),
            ),
    );
  }
}

// ------------------------------------------------------------------ intro

class _Intro extends StatelessWidget {
  const _Intro({super.key, required this.record, required this.onStart});
  final (int, int) record;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final (best, crowns) = record;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Icon(Icons.castle, size: 64, color: CoupColors.gold),
        const SizedBox(height: 12),
        const Text(
          'A Ascensão ao Trono',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 16),
        const _Bullet(
          Icons.route,
          'Atravesse 7 cortes, da Vila de Pedra ao Trono de Ferro.',
        ),
        const _Bullet(
          Icons.casino,
          'Cada partida sorteia uma punição diferente contra você.',
        ),
        const _Bullet(
          Icons.auto_awesome,
          'Bênçãos são raras: vencer as cortes 1 e 4 garante uma, e a corte '
          '6 dá 50% de chance. Elas valem até o fim.',
        ),
        _Bullet(
          Icons.favorite,
          'Você tem $startingLives vida extra. Perder sem vidas encerra a campanha.',
        ),
        const SizedBox(height: 20),
        if (best > 0 || crowns > 0)
          Text(
            crowns > 0
                ? 'Campanhas completas: $crowns · Recorde: $best cortes'
                : 'Recorde: $best corte${best == 1 ? '' : 's'} vencida${best == 1 ? '' : 's'}',
            textAlign: TextAlign.center,
            style: const TextStyle(color: CoupColors.goldHigh),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: onStart,
          icon: const Icon(Icons.play_arrow),
          label: const Text('NOVA CAMPANHA'),
        ),
      ],
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      children: [
        Icon(icon, size: 20, color: CoupColors.gold),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: CoupColors.textSecondary),
          ),
        ),
      ],
    ),
  );
}

// ------------------------------------------------------------ próxima corte

class _NextCourt extends StatelessWidget {
  const _NextCourt({super.key, required this.run, required this.onPlay});
  final CampaignRun run;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final court = run.currentCourt;
    final rivals = court.bots + (run.hasCurse(CurseId.crowdedCourt) ? 1 : 0);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _RunHeader(run: run),
        const SizedBox(height: 12),
        _CourtPath(run: run),
        const SizedBox(height: 16),
        Text(
          court.name.toUpperCase(),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 20,
            letterSpacing: 2,
            fontWeight: FontWeight.w900,
            color: CoupColors.goldHigh,
          ),
        ),
        Text(
          '$rivals rival${rivals == 1 ? '' : 'is'}'
          '${court.hardBots > 0 ? ' (${court.hardBots} de elite)' : ''} · '
          '${run.curses.length == 1 ? 'punição sorteada' : 'punições sorteadas'}',
          textAlign: TextAlign.center,
          style: const TextStyle(color: CoupColors.textSecondary),
        ),
        const SizedBox(height: 14),
        for (final c in run.curses)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _CurseReveal(
              curse: curseInfo[c]!,
              revealKey: '${run.seed}-${run.court}-${run.lives}-${c.name}',
            ),
          ),
        const SizedBox(height: 8),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: onPlay,
          icon: const Icon(Icons.gavel),
          label: const Text('ENFRENTAR A CORTE'),
        ),
      ],
    );
  }
}

/// Vidas e bênçãos acumuladas.
class _RunHeader extends StatelessWidget {
  const _RunHeader({required this.run});
  final CampaignRun run;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (var i = 0; i < 1 + run.lives; i++)
        const Padding(
          padding: EdgeInsets.only(right: 2),
          child: Icon(Icons.favorite, color: CoupColors.error, size: 20),
        ),
      const SizedBox(width: 8),
      Expanded(
        child: Wrap(
          alignment: WrapAlignment.end,
          spacing: 4,
          runSpacing: 4,
          children: [
            for (final b in run.blessings.toSet())
              Tooltip(
                message:
                    '${blessingInfo[b]!.name}: ${blessingInfo[b]!.description}',
                triggerMode: TooltipTriggerMode.tap,
                child: Chip(
                  visualDensity: VisualDensity.compact,
                  avatar: Icon(
                    blessingInfo[b]!.icon,
                    size: 14,
                    color: CoupColors.success,
                  ),
                  label: Text(
                    run.count(b) > 1
                        ? '${blessingInfo[b]!.name} ×${run.count(b)}'
                        : blessingInfo[b]!.name,
                    style: const TextStyle(fontSize: 11),
                  ),
                ),
              ),
          ],
        ),
      ),
    ],
  );
}

/// Caminho das sete cortes: vencidas, atual e por vir.
class _CourtPath extends StatelessWidget {
  const _CourtPath({required this.run});
  final CampaignRun run;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 64,
      child: Row(
        children: [
          for (var i = 0; i < courts.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  color: i <= run.court ? CoupColors.gold : CoupColors.border,
                ),
              ),
            _node(i),
          ],
        ],
      ),
    );
  }

  Widget _node(int i) {
    final done = i < run.court;
    final current = i == run.court;
    final last = i == courts.length - 1;
    final reward = blessingRewardAt(i);
    final node = _circle(i, done, current, last);
    if (reward == BlessingReward.none) {
      return Tooltip(message: courts[i].name, child: node);
    }
    final sure = reward == BlessingReward.sure;
    return Tooltip(
      message:
          '${courts[i].name} · '
          '${sure ? 'bênção garantida' : '50% de chance de bênção'}',
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          node,
          Positioned(
            right: -6,
            top: -6,
            child: Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? CoupColors.surface : CoupColors.redDeep,
                border: Border.all(color: CoupColors.goldHigh, width: 1),
              ),
              child: Icon(
                sure ? Icons.auto_awesome : Icons.casino,
                size: 11,
                color: CoupColors.goldHigh,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _circle(int i, bool done, bool current, bool last) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: current ? 40 : 30,
      height: current ? 40 : 30,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done
            ? CoupColors.gold
            : current
            ? CoupColors.surfaceHigh
            : CoupColors.surface,
        border: Border.all(
          color: done || current ? CoupColors.goldHigh : CoupColors.border,
          width: current ? 2.5 : 1,
        ),
        boxShadow: current
            ? [
                BoxShadow(
                  color: CoupColors.gold.withValues(alpha: 0.5),
                  blurRadius: 12,
                ),
              ]
            : null,
      ),
      child: Center(
        child: done
            ? const Icon(Icons.check, size: 16, color: Colors.black)
            : last
            ? Icon(
                Icons.castle,
                size: current ? 20 : 15,
                color: current ? CoupColors.goldHigh : CoupColors.textMuted,
              )
            : Text(
                '${i + 1}',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: current ? CoupColors.goldHigh : CoupColors.textMuted,
                ),
              ),
      ),
    );
  }
}

/// Sorteio da punição: a carta gira entre as punições possíveis, desacelera
/// e para na sorteada. Só anima a primeira vez que cada sorteio aparece.
class _CurseReveal extends StatefulWidget {
  const _CurseReveal({required this.curse, required this.revealKey});
  final Curse curse;
  final String revealKey;

  static final Set<String> _seen = {};

  @override
  State<_CurseReveal> createState() => _CurseRevealState();
}

class _CurseRevealState extends State<_CurseReveal> {
  late Curse _shown;
  bool _landed = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _shown = widget.curse;
    if (_CurseReveal._seen.add(widget.revealKey)) {
      _landed = false;
      _spin(0);
    } else {
      _landed = true;
    }
  }

  void _spin(int step) {
    const steps = 14;
    if (step >= steps) {
      setState(() {
        _shown = widget.curse;
        _landed = true;
      });
      HapticFeedback.heavyImpact();
      return;
    }
    final all = curseInfo.values.toList();
    setState(
      () => _shown = all[(step * 5 + widget.curse.id.index) % all.length],
    );
    HapticFeedback.selectionClick();
    // Desacelera como uma roleta.
    _timer = Timer(Duration(milliseconds: 50 + step * step * 3), () {
      if (mounted) _spin(step + 1);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _shown;
    return AnimatedScale(
      scale: _landed ? 1 : 0.96,
      duration: const Duration(milliseconds: 400),
      curve: Curves.elasticOut,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: CoupColors.redDeep.withValues(alpha: _landed ? 0.35 : 0.15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: CoupColors.error.withValues(alpha: _landed ? 0.8 : 0.3),
            width: _landed ? 1.5 : 1,
          ),
          boxShadow: _landed
              ? [
                  BoxShadow(
                    color: CoupColors.error.withValues(alpha: 0.25),
                    blurRadius: 18,
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: CoupColors.error.withValues(alpha: 0.15),
              ),
              child: Icon(c.icon, color: CoupColors.error, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _landed ? 'PUNIÇÃO' : 'SORTEANDO...',
                    style: const TextStyle(
                      fontSize: 10,
                      letterSpacing: 2,
                      fontWeight: FontWeight.w800,
                      color: CoupColors.textMuted,
                    ),
                  ),
                  Text(
                    c.name,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  AnimatedOpacity(
                    duration: const Duration(milliseconds: 250),
                    opacity: _landed ? 1 : 0.35,
                    child: Text(
                      c.description,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: CoupColors.textSecondary,
                      ),
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
}

// ---------------------------------------------------------------- bênção

class _BlessingChoice extends StatelessWidget {
  const _BlessingChoice({super.key, required this.run, required this.onChoose});
  final CampaignRun run;
  final ValueChanged<BlessingId> onChoose;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _RunHeader(run: run),
        const SizedBox(height: 20),
        const Icon(Icons.emoji_events, size: 48, color: CoupColors.goldHigh),
        const SizedBox(height: 8),
        Text(
          '${run.currentCourt.name} conquistada!',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const Text(
          'Escolha uma bênção. Ela vale até o fim da campanha.',
          textAlign: TextAlign.center,
          style: TextStyle(color: CoupColors.textSecondary),
        ),
        const SizedBox(height: 18),
        for (final (i, id) in run.offer.indexed)
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: Duration(milliseconds: 400 + i * 150),
            curve: Curves.easeOutBack,
            builder: (_, v, child) => Opacity(
              opacity: v.clamp(0, 1),
              child: Transform.translate(
                offset: Offset(0, 30 * (1 - v)),
                child: child,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _BlessingCard(
                blessing: blessingInfo[id]!,
                owned: run.count(id),
                onTap: () => onChoose(id),
              ),
            ),
          ),
      ],
    );
  }
}

class _BlessingCard extends StatelessWidget {
  const _BlessingCard({
    required this.blessing,
    required this.owned,
    required this.onTap,
  });
  final Blessing blessing;
  final int owned;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: CoupColors.surface,
    borderRadius: BorderRadius.circular(16),
    child: InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: CoupColors.success.withValues(alpha: 0.6)),
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: CoupColors.success.withValues(alpha: 0.15),
              ),
              child: Icon(blessing.icon, color: CoupColors.success, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    owned > 0 ? '${blessing.name} (+1)' : blessing.name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    blessing.description,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: CoupColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: CoupColors.textMuted),
          ],
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ fim

class _Finished extends StatelessWidget {
  const _Finished({super.key, required this.run, required this.onRestart});
  final CampaignRun run;
  final VoidCallback onRestart;

  @override
  Widget build(BuildContext context) {
    final won = run.status == RunStatus.won;
    final cleared = run.history.where((h) => h.won).length;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(
          won ? Icons.castle : Icons.heart_broken,
          size: 64,
          color: won ? CoupColors.goldHigh : CoupColors.error,
        ),
        const SizedBox(height: 12),
        Text(
          won ? 'O Trono é seu!' : 'Sua campanha terminou',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        Text(
          won
              ? 'Você venceu as ${courts.length} cortes.'
              : 'Caiu em ${run.currentCourt.name}, depois de vencer '
                    '$cleared corte${cleared == 1 ? '' : 's'}.',
          textAlign: TextAlign.center,
          style: const TextStyle(color: CoupColors.textSecondary),
        ),
        const SizedBox(height: 20),
        for (final h in run.history)
          ListTile(
            dense: true,
            leading: Icon(
              h.won ? Icons.check_circle : Icons.cancel,
              color: h.won ? CoupColors.success : CoupColors.error,
            ),
            title: Text(courts[h.court].name),
            subtitle: Text(
              h.curses.map((c) => curseInfo[c]!.name).join(' + '),
              style: const TextStyle(color: CoupColors.textSecondary),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: onRestart,
          icon: const Icon(Icons.replay),
          label: const Text('NOVA CAMPANHA'),
        ),
      ],
    );
  }
}
