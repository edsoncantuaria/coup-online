import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/coup_engine.dart';
import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../theme.dart';
import 'action_sheet.dart';
import 'common.dart';
import 'influence_card.dart';

/// Painel do jogador local, enxuto: identidade e moedas, a mão e um botão
/// "Agir" que abre as ações. Decisões de resposta (desafiar, bloquear,
/// trocar) sobem numa faixa curta só quando é a sua vez de responder.
class MyPanel extends StatefulWidget {
  const MyPanel({super.key, required this.controller, this.trailing});
  final GameController controller;

  /// Controle extra ao lado do nome (ex.: microfone do chat de voz).
  final Widget? trailing;

  @override
  State<MyPanel> createState() => _MyPanelState();
}

class _MyPanelState extends State<MyPanel> {
  GameController get c => widget.controller;
  final Set<int> _pick = {};
  int? _exchangeStamp;

  @override
  Widget build(BuildContext context) {
    final s = c.state!;
    final me = c.me;
    if (me == null) return const SizedBox.shrink();

    // Zera a seleção da troca a cada nova troca.
    final exchangeKey = s.phase == Phase.exchanging ? s.turnIndex : null;
    if (exchangeKey != _exchangeStamp) {
      _exchangeStamp = exchangeKey;
      _pick.clear();
    }

    final decide = c.isMyDecision;
    final losing = decide && s.phase == Phase.losingInfluence;
    final myTurn = decide && s.phase == Phase.action;
    final height = MediaQuery.sizeOf(context).height;
    final cardWidth = (height * 0.085).clamp(54.0, 84.0);
    final prompt = _prompt(s, me);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GenSwitcher(
          switchKey: prompt?.key,
          duration: const Duration(milliseconds: 280),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          transitionBuilder: (child, anim) => FadeTransition(
            opacity: anim,
            child: SlideTransition(
              position: Tween(
                begin: const Offset(0, 0.25),
                end: Offset.zero,
              ).animate(anim),
              child: SizeTransition(
                sizeFactor: anim,
                alignment: Alignment.bottomCenter,
                child: child,
              ),
            ),
          ),
          child: prompt?.child ?? const SizedBox(width: double.infinity),
        ),
        Container(
          decoration: BoxDecoration(
            color: CoupColors.secondary,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            border: Border(
              top: BorderSide(
                color: decide ? CoupColors.gold : CoupColors.border,
                width: decide ? 1.5 : 1,
              ),
            ),
            boxShadow: const [
              BoxShadow(
                color: Colors.black54,
                blurRadius: 16,
                offset: Offset(0, -4),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(
                children: [
                  Expanded(child: _identity(s, me)),
                  _hand(me, cardWidth, losing),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: _ActButton(
                        active: myTurn,
                        enabled: me.isAlive && s.phase != Phase.gameOver,
                        timer: decide ? c.turnTimer : null,
                        total: c.turnTimerTotal,
                        onTap: () {
                          HapticFeedback.selectionClick();
                          showActionSheet(context, c);
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _identity(GameState s, Player me) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Row(
        children: [
          PlayerAvatar(
            player: me,
            size: 30,
            ringColor: s.currentPlayer?.id == me.id ? CoupColors.gold : null,
          ),
          if (widget.trailing != null) ...[
            const SizedBox(width: 4),
            widget.trailing!,
          ],
        ],
      ),
      const SizedBox(height: 4),
      Text(
        me.name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
      ),
      const SizedBox(height: 6),
      CoinBadge(coins: me.coins, large: true),
    ],
  );

  Widget _hand(Player me, double width, bool losing) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      for (final card in me.cards)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: FlipSwitcher(
            flipKey: '${card.role}-${card.isFlipped}',
            child: InfluenceCard(
              role: card.role,
              flipped: card.isFlipped,
              width: width,
              highlight: losing && !card.isFlipped,
              onTap: losing && !card.isFlipped
                  ? () {
                      HapticFeedback.mediumImpact();
                      c.selectInfluence(card.role);
                    }
                  : null,
            ),
          ),
        ),
    ],
  );

  /// A faixa que sobe acima do painel, ou null quando não há nada a decidir.
  ({Key key, Widget child})? _prompt(GameState s, Player me) {
    if (s.phase == Phase.gameOver || !c.isMyDecision) return null;
    final timer = c.turnTimer;
    final k = '${s.phase.wire}-${s.turnIndex}-${s.pendingBlock?.blockerId}';

    switch (s.phase) {
      case Phase.challenge:
        final a = s.currentAction!;
        final role = CoupEngine.requiredRole(a.type)!;
        final actor = s.playerById(a.source)?.name ?? '?';
        return (
          key: ValueKey(k),
          child: _PromptBar(
            role: role,
            timer: timer,
            title: a.target == me.id
                ? '$actor: ${actionLabel(a.type)} em você'
                : '$actor diz ter ${roleLabel(role)}',
            subtitle: 'Desafie se achar que é blefe.',
            buttons: [
              _Btn(
                'Desafiar',
                CoupColors.red,
                () => c.sendResponse(ResponseType.challenge),
              ),
              _Btn('Acreditar', null, () => c.sendResponse(ResponseType.pass)),
            ],
          ),
        );
      case Phase.block:
        final a = s.currentAction!;
        final pb = s.pendingBlock;
        if (pb != null) {
          final blocker = s.playerById(pb.blockerId)?.name ?? '?';
          return (
            key: ValueKey(k),
            child: _PromptBar(
              role: pb.role,
              timer: timer,
              title: '$blocker bloqueia com ${roleLabel(pb.role)}',
              subtitle: 'Desafie se achar que é blefe.',
              buttons: [
                _Btn(
                  'Desafiar',
                  CoupColors.red,
                  () => c.sendResponse(ResponseType.challenge),
                ),
                _Btn('Aceitar', null, () => c.sendResponse(ResponseType.pass)),
              ],
            ),
          );
        }
        final actor = s.playerById(a.source)?.name ?? '?';
        final roles = CoupEngine.blockingRoles(a.type);
        return (
          key: ValueKey(k),
          child: _PromptBar(
            timer: timer,
            title: switch (a.type) {
              ActionType.assassinate => '$actor quer assassinar você',
              ActionType.steal => '$actor quer extorquir você',
              _ => '$actor pede Ajuda Externa',
            },
            subtitle: 'Bloquear vale mesmo sem ter a carta.',
            buttons: [
              for (final r in roles)
                _Btn(
                  roleLabel(r),
                  me.aliveRoles.contains(r)
                      ? CoupColors.info
                      : CoupColors.bluff,
                  () => c.sendResponse(ResponseType.block, r),
                  icon: Icons.shield,
                ),
              _Btn('Permitir', null, () => c.sendResponse(ResponseType.pass)),
            ],
          ),
        );
      case Phase.losingInfluence:
        return (
          key: ValueKey(k),
          child: _PromptBar(
            timer: timer,
            accent: CoupColors.error,
            title: 'Você perde uma influência',
            subtitle: 'Toque na carta que vai revelar.',
            buttons: const [],
          ),
        );
      case Phase.exchanging:
        return (key: ValueKey(k), child: _exchange(s, me, timer));
      default:
        return null;
    }
  }

  Widget _exchange(GameState s, Player me, int? timer) {
    final pool = [...me.aliveRoles, ...?s.exchangingCards];
    final need = me.influence;
    return StatefulBuilder(
      builder: (context, setLocal) => _PromptBar(
        timer: timer,
        title: 'Embaixador: escolha $need para manter',
        subtitle: 'As outras voltam para a Corte.',
        body: Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (var i = 0; i < pool.length; i++)
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  InfluenceCard(
                    role: pool[i],
                    width: 54,
                    selected: _pick.contains(i),
                    onTap: () => setLocal(() {
                      HapticFeedback.selectionClick();
                      if (_pick.contains(i)) {
                        _pick.remove(i);
                      } else if (_pick.length < need) {
                        _pick.add(i);
                      } else if (need == 1) {
                        _pick
                          ..clear()
                          ..add(i);
                      }
                    }),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    i < me.influence ? 'sua' : 'nova',
                    style: const TextStyle(
                      fontSize: 10,
                      color: CoupColors.textMuted,
                    ),
                  ),
                ],
              ),
          ],
        ),
        buttons: [
          _Btn(
            'Manter ${_pick.length}/$need',
            CoupColors.gold,
            _pick.length == need
                ? () => c.confirmExchange(_pick.map((i) => pool[i]).toList())
                : null,
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------- act button

class _ActButton extends StatefulWidget {
  const _ActButton({
    required this.active,
    required this.enabled,
    required this.timer,
    required this.total,
    required this.onTap,
  });

  final bool active;
  final bool enabled;
  final int? timer;
  final int total;
  final VoidCallback onTap;

  @override
  State<_ActButton> createState() => _ActButtonState();
}

class _ActButtonState extends State<_ActButton>
    with SingleTickerProviderStateMixin {
  late final _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(_ActButton old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    if (widget.active && !_pulse.isAnimating) {
      _pulse.repeat();
    } else if (!widget.active && _pulse.isAnimating) {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const size = 66.0;
    final t = widget.timer;
    final urgent = t != null && t <= 10;
    final ringColor = urgent ? CoupColors.error : CoupColors.goldHigh;
    return Semantics(
      button: true,
      label: widget.active ? 'Agir' : 'Ações',
      child: SizedBox(
        width: size + 16,
        height: size + 16,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Halo pulsante quando é a sua vez.
            AnimatedBuilder(
              animation: _pulse,
              builder: (_, _) {
                if (!widget.active) return const SizedBox.shrink();
                final v = Curves.easeOut.transform(_pulse.value);
                return Container(
                  width: size + 16 * v,
                  height: size + 16 * v,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: CoupColors.gold.withValues(alpha: 0.35 * (1 - v)),
                  ),
                );
              },
            ),
            if (t != null && widget.total > 0)
              SizedBox(
                width: size + 6,
                height: size + 6,
                child: TweenAnimationBuilder<double>(
                  tween: Tween(end: t / widget.total),
                  duration: const Duration(milliseconds: 950),
                  builder: (_, v, _) => CustomPaint(
                    painter: _RingPainter(value: v, color: ringColor),
                  ),
                ),
              ),
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: widget.active
                    ? const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [CoupColors.goldHigh, CoupColors.gold],
                      )
                    : null,
                color: widget.active ? null : CoupColors.surfaceHigh,
                border: Border.all(
                  color: widget.active
                      ? CoupColors.goldHigh
                      : CoupColors.border,
                ),
                boxShadow: widget.active
                    ? [
                        BoxShadow(
                          color: CoupColors.gold.withValues(alpha: 0.5),
                          blurRadius: 14,
                        ),
                      ]
                    : null,
              ),
              child: Material(
                type: MaterialType.transparency,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: widget.enabled ? widget.onTap : null,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        widget.active ? Icons.bolt : Icons.style_outlined,
                        size: 24,
                        color: widget.active
                            ? Colors.black
                            : CoupColors.textSecondary,
                      ),
                      Text(
                        widget.active ? 'AGIR' : 'AÇÕES',
                        style: TextStyle(
                          fontSize: 10,
                          letterSpacing: 1.2,
                          fontWeight: FontWeight.w900,
                          color: widget.active
                              ? Colors.black
                              : CoupColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.value, required this.color});
  final double value;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      rect.deflate(1.5),
      0,
      2 * math.pi,
      false,
      paint..color = CoupColors.border,
    );
    canvas.drawArc(
      rect.deflate(1.5),
      -math.pi / 2,
      2 * math.pi * value.clamp(0, 1),
      false,
      paint..color = color,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.value != value || old.color != color;
}

// ------------------------------------------------------------ prompt bar

class _Btn {
  const _Btn(this.label, this.color, this.onTap, {this.icon});
  final String label;
  final Color? color;
  final VoidCallback? onTap;
  final IconData? icon;
}

class _PromptBar extends StatelessWidget {
  const _PromptBar({
    required this.title,
    required this.subtitle,
    required this.buttons,
    this.timer,
    this.role,
    this.body,
    this.accent = CoupColors.gold,
  });

  final String title;
  final String subtitle;
  final List<_Btn> buttons;
  final int? timer;
  final Role? role;
  final Widget? body;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: CoupColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accent.withValues(alpha: 0.6)),
        boxShadow: const [
          BoxShadow(
            color: Colors.black54,
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (role != null) ...[
                InfluenceCard(role: role, width: 30),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: CoupColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (timer != null)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Text(
                    '${timer}s',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      color: timer! <= 10
                          ? CoupColors.error
                          : CoupColors.textMuted,
                    ),
                  ),
                ),
            ],
          ),
          if (body != null) ...[const SizedBox(height: 10), body!],
          if (buttons.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                for (var i = 0; i < buttons.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: _button(buttons[i])),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _button(_Btn b) {
    final label = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (b.icon != null) ...[
          Icon(b.icon, size: 16),
          const SizedBox(width: 4),
        ],
        Flexible(
          child: Text(b.label, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ],
    );
    final tap = b.onTap == null
        ? null
        : () {
            HapticFeedback.selectionClick();
            b.onTap!();
          };
    if (b.color == null) {
      return OutlinedButton(onPressed: tap, child: label);
    }
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: b.color,
        foregroundColor: b.color == CoupColors.gold
            ? Colors.black
            : Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      onPressed: tap,
      child: label,
    );
  }
}
