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
import 'tv.dart';

/// Painel do jogador local, enxuto: identidade e moedas, a mão e um botão
/// "Agir" que abre as ações. Decisões de resposta (desafiar, bloquear,
/// trocar) sobem numa faixa curta só quando é a sua vez de responder.
class MyPanel extends StatefulWidget {
  const MyPanel({
    super.key,
    required this.controller,
    this.trailing,
    this.anchorKey,
  });
  final GameController controller;

  /// Controle extra ao lado do nome (ex.: microfone do chat de voz).
  final Widget? trailing;

  /// Marca a posição da mão para as animações da mesa.
  final Key? anchorKey;

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
        AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          decoration: BoxDecoration(
            color: Tv.ink,
            border: Border(
              top: BorderSide(
                color: decide ? Tv.carmine : Tv.rule,
                width: decide ? 2 : 1,
              ),
            ),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
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
          Flexible(
            child: Text(
              me.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TvType.name(18),
            ),
          ),
          if (widget.trailing != null) ...[
            const SizedBox(width: 6),
            widget.trailing!,
          ],
        ],
      ),
      const SizedBox(height: 6),
      CoinBadge(coins: me.coins, large: true),
    ],
  );

  Widget _hand(Player me, double width, bool losing) => Row(
    key: widget.anchorKey,
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
                Tv.carmine,
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
                  Tv.carmine,
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
                  me.aliveRoles.contains(r)
                      ? roleLabel(r)
                      : '${roleLabel(r)} · blefe',
                  me.aliveRoles.contains(r) ? Tv.cue : null,
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
            accent: Tv.carmine,
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
                    i < me.influence ? 'SUA' : 'NOVA',
                    style: TvType.credit(10),
                  ),
                ],
              ),
          ],
        ),
        buttons: [
          _Btn(
            'Manter ${_pick.length}/$need',
            Tv.carmine,
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

/// O botão de deixa: um bloco carmim "AGIR" na sua vez, um contorno
/// "AÇÕES" fora dela. O relógio corre como uma barra que esvazia embaixo.
class _ActButton extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final t = timer;
    final urgent = t != null && t <= 10;
    return Semantics(
      button: true,
      label: active ? 'Agir' : 'Ações',
      child: SizedBox(
        width: 96,
        height: 64,
        child: Material(
          color: active ? Tv.carmine : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(4),
            side: active
                ? BorderSide.none
                : const BorderSide(color: Tv.creditMuted),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onTap : null,
            child: Stack(
              children: [
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        active ? 'AGIR' : 'AÇÕES',
                        style: TvType.credit(
                          active ? 17 : 13,
                          color: active ? Colors.white : Tv.creditDim,
                          weight: FontWeight.w700,
                        ),
                      ),
                      if (t != null)
                        Text(
                          '${t}s',
                          style: TvType.figure(
                            12,
                            color: active
                                ? Colors.white
                                : urgent
                                ? Tv.carmineText
                                : Tv.creditDim,
                          ),
                        ),
                    ],
                  ),
                ),
                if (t != null && total > 0)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(end: (t / total).clamp(0.0, 1.0)),
                      duration: const Duration(milliseconds: 950),
                      builder: (_, v, _) => Align(
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: v,
                          child: Container(
                            height: 4,
                            color: active
                                ? Tv.ink.withValues(alpha: 0.55)
                                : urgent
                                ? Tv.carmine
                                : Tv.credit,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------ prompt bar

class _Btn {
  const _Btn(this.label, this.color, this.onTap, {this.icon});
  final String label;
  final Color? color;
  final VoidCallback? onTap;
  final IconData? icon;
}

/// A deixa de resposta: sobe sobre o painel quando a mesa espera por você.
class _PromptBar extends StatelessWidget {
  const _PromptBar({
    required this.title,
    required this.subtitle,
    required this.buttons,
    this.timer,
    this.role,
    this.body,
    this.accent = Tv.credit,
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
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      color: Tv.stageHigh,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (role != null) ...[
                SizedBox(width: 44, height: 44, child: CloseUp(role: role!)),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TvType.name(20, color: accent),
                    ),
                    const SizedBox(height: 2),
                    Text(subtitle.toUpperCase(), style: TvType.credit(10.5)),
                  ],
                ),
              ),
              if (timer != null)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Text(
                    '$timer',
                    style: TvType.figure(
                      26,
                      color: timer! <= 10 ? Tv.carmineText : Tv.creditDim,
                    ),
                  ),
                ),
            ],
          ),
          if (body != null) ...[const SizedBox(height: 10), body!],
          if (buttons.isNotEmpty) ...[
            const SizedBox(height: 12),
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
          child: Text(
            b.label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
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
        foregroundColor: b.color == Tv.carmine ? Colors.white : Tv.ink,
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      onPressed: tap,
      child: label,
    );
  }
}
