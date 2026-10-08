import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/coup_engine.dart';
import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../theme.dart';
import 'arena.dart';
import 'common.dart';
import 'influence_card.dart';

/// Painel do jogador local: mão, moedas, relógio e a decisão do momento.
class MyPanel extends StatefulWidget {
  const MyPanel({super.key, required this.controller});
  final GameController controller;

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
    final exchanging = decide && s.phase == Phase.exchanging;
    final height = MediaQuery.sizeOf(context).height;
    final cardWidth = (height * 0.095).clamp(58.0, 92.0);

    return Container(
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _TimerBar(controller: c),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      PlayerAvatar(
                        player: me,
                        size: 34,
                        ringColor: s.currentPlayer?.id == me.id
                            ? CoupColors.gold
                            : null,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          me.name,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      if (c.turnTimer != null) ...[
                        Icon(
                          Icons.timer_outlined,
                          size: 16,
                          color: c.turnTimer! <= 10
                              ? CoupColors.error
                              : CoupColors.textSecondary,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          '${c.turnTimer}s',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: c.turnTimer! <= 10
                                ? CoupColors.error
                                : CoupColors.textSecondary,
                          ),
                        ),
                        const SizedBox(width: 10),
                      ],
                      CoinBadge(coins: me.coins, large: true),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (exchanging)
                    _exchangePicker(s, me)
                  else
                    _hand(me, cardWidth, losing),
                  const SizedBox(height: 12),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 200),
                    alignment: Alignment.topCenter,
                    child: _decision(s, me),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _hand(Player me, double width, bool losing) => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      for (final card in me.cards)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: InfluenceCard(
            role: card.role,
            flipped: card.isFlipped,
            width: width,
            highlight: losing && !card.isFlipped,
            onTap: losing && !card.isFlipped
                ? () => _confirmLoss(card.role)
                : null,
          ),
        ),
    ],
  );

  Future<void> _confirmLoss(Role role) async {
    HapticFeedback.mediumImpact();
    c.selectInfluence(role);
  }

  Widget _exchangePicker(GameState s, Player me) {
    final pool = [...me.aliveRoles, ...?s.exchangingCards];
    final need = me.influence;
    return Column(
      children: [
        Text(
          'Toque em $need carta${need > 1 ? 's' : ''} para manter. '
          'As outras voltam para a Corte.',
          textAlign: TextAlign.center,
          style: const TextStyle(color: CoupColors.textSecondary, fontSize: 12),
        ),
        const SizedBox(height: 10),
        Wrap(
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
                    width: 64,
                    selected: _pick.contains(i),
                    onTap: () => setState(() {
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
                  const SizedBox(height: 4),
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
      ],
    );
  }

  Widget _decision(GameState s, Player me) {
    if (s.phase == Phase.gameOver) return const SizedBox.shrink();
    if (!me.isAlive) {
      return const _Note(
        icon: Icons.visibility_outlined,
        text: 'Você foi eliminado. Assista ao desfecho da corte.',
      );
    }
    if (!c.isMyDecision) {
      if (c.busy) return const SizedBox(height: 4);
      return _Note(
        icon: Icons.hourglass_empty,
        text: describeWaiting(s, c.myId),
      );
    }

    switch (s.phase) {
      case Phase.action:
        return _ActionGrid(controller: c, state: s, me: me);
      case Phase.challenge:
        final a = s.currentAction!;
        final role = CoupEngine.requiredRole(a.type)!;
        final actor = s.playerById(a.source)?.name ?? '?';
        final targetsMe = a.target == me.id;
        return _DecisionCard(
          title: '$actor diz ter ${roleLabel(role)}',
          body: targetsMe
              ? '${actionLabel(a.type)} contra você. Se desafiar e '
                    '$actor tiver a carta, você perde uma influência.'
              : 'Se desafiar e $actor tiver a carta, você perde uma '
                    'influência. Se for blefe, quem perde é $actor.',
          role: role,
          buttons: [
            _Btn(
              'Desafiar',
              Icons.gavel,
              CoupColors.red,
              () => c.sendResponse(ResponseType.challenge),
            ),
            _Btn(
              'Acreditar',
              Icons.check,
              null,
              () => c.sendResponse(ResponseType.pass),
            ),
          ],
        );
      case Phase.block:
        final a = s.currentAction!;
        final pb = s.pendingBlock;
        if (pb != null) {
          final blocker = s.playerById(pb.blockerId)?.name ?? '?';
          return _DecisionCard(
            title: '$blocker bloqueia com ${roleLabel(pb.role)}',
            body:
                'Se desafiar e $blocker tiver a carta, você perde uma '
                'influência. Se for blefe, o bloqueio cai.',
            role: pb.role,
            buttons: [
              _Btn(
                'Desafiar',
                Icons.gavel,
                CoupColors.red,
                () => c.sendResponse(ResponseType.challenge),
              ),
              _Btn(
                'Aceitar',
                Icons.check,
                null,
                () => c.sendResponse(ResponseType.pass),
              ),
            ],
          );
        }
        final actor = s.playerById(a.source)?.name ?? '?';
        final roles = CoupEngine.blockingRoles(a.type);
        return _DecisionCard(
          title: switch (a.type) {
            ActionType.assassinate => '$actor quer assassinar você',
            ActionType.steal => '$actor quer extorquir você',
            _ => '$actor pede Ajuda Externa',
          },
          body:
              'Você pode bloquear dizendo ter '
              '${roles.map(roleLabel).join(' ou ')}, mesmo sem ter.',
          buttons: [
            for (final r in roles)
              _Btn(
                'Bloquear · ${roleLabel(r)}',
                Icons.shield,
                me.aliveRoles.contains(r) ? CoupColors.info : CoupColors.bluff,
                () => c.sendResponse(ResponseType.block, r),
              ),
            _Btn(
              'Permitir',
              Icons.check,
              null,
              () => c.sendResponse(ResponseType.pass),
            ),
          ],
        );
      case Phase.losingInfluence:
        return const _Note(
          icon: Icons.touch_app,
          text: 'Toque na carta que você vai revelar e perder.',
          color: CoupColors.error,
        );
      case Phase.exchanging:
        final need = me.influence;
        return SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _pick.length == need
                ? () {
                    final pool = [...me.aliveRoles, ...?s.exchangingCards];
                    c.confirmExchange(_pick.map((i) => pool[i]).toList());
                  }
                : null,
            icon: const Icon(Icons.check),
            label: Text('Manter ${_pick.length}/$need'),
          ),
        );
      default:
        return const SizedBox.shrink();
    }
  }
}

// --------------------------------------------------------------- timer bar

class _TimerBar extends StatelessWidget {
  const _TimerBar({required this.controller});
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final t = controller.turnTimer;
    final total = controller.turnTimerTotal;
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      child: SizedBox(
        height: 3,
        child: t == null || total <= 0
            ? const SizedBox.shrink()
            : TweenAnimationBuilder<double>(
                tween: Tween(end: t / total),
                duration: const Duration(milliseconds: 950),
                builder: (_, v, _) => LinearProgressIndicator(
                  value: v,
                  backgroundColor: Colors.transparent,
                  color: t <= 10 ? CoupColors.error : CoupColors.gold,
                ),
              ),
      ),
    );
  }
}

// ------------------------------------------------------------- action grid

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({
    required this.controller,
    required this.state,
    required this.me,
  });

  final GameController controller;
  final GameState state;
  final Player me;

  String? _whyNot(ActionType t) {
    if (me.coins >= 10 && t != ActionType.coup) return 'Golpe obrigatório';
    if (t == ActionType.coup && me.coins < 7) return 'Precisa de 7';
    if (t == ActionType.assassinate && me.coins < 3) return 'Precisa de 3';
    if (CoupEngine.actionNeedsTarget(t) && _targets(t).isEmpty) {
      return 'Sem alvo';
    }
    return null;
  }

  List<Player> _targets(ActionType t) => state.players
      .where(
        (p) =>
            p.id != me.id &&
            p.isAlive &&
            (t != ActionType.steal || p.coins > 0),
      )
      .toList();

  Future<void> _go(BuildContext context, ActionType t) async {
    HapticFeedback.selectionClick();
    if (!CoupEngine.actionNeedsTarget(t)) {
      controller.sendAction(GameAction(type: t, source: me.id));
      return;
    }
    final targets = _targets(t);
    final target = targets.length == 1
        ? targets.first
        : await showModalBottomSheet<Player>(
            context: context,
            backgroundColor: CoupColors.secondary,
            showDragHandle: true,
            builder: (_) => _TargetSheet(type: t, targets: targets),
          );
    if (target != null) {
      controller.sendAction(
        GameAction(type: t, source: me.id, target: target.id),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget tile(ActionType t, String hint, {Role? role}) {
      final why = _whyNot(t);
      final bluff = role != null && !me.aliveRoles.contains(role);
      return _ActionTile(
        type: t,
        hint: why ?? hint,
        role: role,
        bluff: bluff && why == null,
        enabled: why == null,
        onTap: () => _go(context, t),
      );
    }

    final forcedCoup = me.coins >= 10;
    return LayoutBuilder(
      builder: (context, box) {
        final cols = box.maxWidth >= 560 ? 4 : 2;
        final gap = 8.0;
        final w = (box.maxWidth - gap * (cols - 1)) / cols;
        Widget grid(List<Widget> tiles) => Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [for (final t in tiles) SizedBox(width: w, child: t)],
        );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (forcedCoup)
              const _Note(
                icon: Icons.warning_amber,
                text: 'Com 10 moedas o Golpe é obrigatório.',
                color: CoupColors.error,
              ),
            const _GroupLabel('Ações gerais'),
            grid([
              tile(ActionType.income, '+1 moeda'),
              tile(ActionType.foreignAid, '+2 · Duque bloqueia'),
              tile(ActionType.coup, '-7 · sem defesa'),
            ]),
            const SizedBox(height: 10),
            const _GroupLabel('Personagens (vale blefar)'),
            grid([
              tile(ActionType.tax, '+3 moedas', role: Role.duke),
              tile(ActionType.steal, 'Rouba até 2', role: Role.captain),
              tile(
                ActionType.assassinate,
                '-3 · elimina carta',
                role: Role.assassin,
              ),
              tile(ActionType.exchange, 'Troca cartas', role: Role.ambassador),
            ]),
          ],
        );
      },
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6, left: 2),
    child: Text(
      text.toUpperCase(),
      style: const TextStyle(
        fontSize: 10,
        letterSpacing: 1.6,
        fontWeight: FontWeight.w800,
        color: CoupColors.textMuted,
      ),
    ),
  );
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.type,
    required this.hint,
    required this.enabled,
    required this.onTap,
    this.role,
    this.bluff = false,
  });

  final ActionType type;
  final String hint;
  final bool enabled;
  final VoidCallback onTap;
  final Role? role;
  final bool bluff;

  @override
  Widget build(BuildContext context) {
    final style = role != null ? roleStyle(role!) : null;
    final accent = style?.accent ?? CoupColors.goldHigh;
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: Material(
        color: style?.top.withValues(alpha: 0.35) ?? CoupColors.surfaceHigh,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: enabled ? onTap : null,
          child: Container(
            constraints: const BoxConstraints(minHeight: 52),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: accent.withValues(alpha: 0.45)),
            ),
            child: Row(
              children: [
                Icon(actionIcon(type), size: 20, color: accent),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        shortActionLabel(type),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        hint,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10.5,
                          color: CoupColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (bluff)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: CoupColors.bluff.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: const Text(
                      'BLEFE',
                      style: TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w900,
                        color: CoupColors.bluff,
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

class _TargetSheet extends StatelessWidget {
  const _TargetSheet({required this.type, required this.targets});
  final ActionType type;
  final List<Player> targets;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${shortActionLabel(type)}: escolha o alvo',
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 12),
          for (final p in targets)
            Card(
              color: CoupColors.surface,
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: PlayerAvatar(player: p, size: 40),
                title: Text(p.name),
                subtitle: Text(
                  '${p.influence} influência${p.influence > 1 ? 's' : ''}',
                  style: const TextStyle(color: CoupColors.textSecondary),
                ),
                trailing: CoinBadge(coins: p.coins),
                onTap: () => Navigator.of(context).pop(p),
              ),
            ),
        ],
      ),
    ),
  );
}

// --------------------------------------------------------------- decisions

class _Btn {
  const _Btn(this.label, this.icon, this.color, this.onTap);
  final String label;
  final IconData icon;
  final Color? color;
  final VoidCallback onTap;
}

class _DecisionCard extends StatelessWidget {
  const _DecisionCard({
    required this.title,
    required this.body,
    required this.buttons,
    this.role,
  });

  final String title;
  final String body;
  final List<_Btn> buttons;
  final Role? role;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            if (role != null) ...[
              InfluenceCard(role: role, width: 36),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    body,
                    style: const TextStyle(
                      fontSize: 12,
                      color: CoupColors.textSecondary,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
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
    );
  }

  Widget _button(_Btn b) {
    final label = Text(
      b.label,
      maxLines: 2,
      textAlign: TextAlign.center,
      overflow: TextOverflow.ellipsis,
    );
    void tap() {
      HapticFeedback.selectionClick();
      b.onTap();
    }

    if (b.color == null) {
      return OutlinedButton(onPressed: tap, child: label);
    }
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: b.color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      onPressed: tap,
      child: label,
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({
    required this.icon,
    required this.text,
    this.color = CoupColors.textSecondary,
  });
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(color: color, fontSize: 13),
          ),
        ),
      ],
    ),
  );
}
