import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/coup_engine.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../theme.dart';
import 'arena.dart';
import 'common.dart';

/// Abre a folha de ações. Fora da sua vez ela vira uma referência rápida
/// (tudo desabilitado), para planejar a próxima jogada.
Future<void> showActionSheet(BuildContext context, GameController c) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: CoupColors.secondary,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => ListenableBuilder(
      listenable: c,
      builder: (ctx, _) => _ActionSheet(controller: c),
    ),
  );
}

class _ActionSheet extends StatelessWidget {
  const _ActionSheet({required this.controller});
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final s = c.state;
    final me = c.me;
    if (s == null || me == null) return const SizedBox.shrink();
    final myTurn = c.isMyDecision && s.phase == Phase.action;

    // Aberta como consulta, a folha sai da frente quando chega uma decisão
    // de resposta (desafio, bloqueio, troca) ou a partida acaba.
    if ((c.isMyDecision && !myTurn) || s.phase == Phase.gameOver) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted && ModalRoute.of(context)?.isCurrent == true) {
          Navigator.of(context).pop();
        }
      });
    }

    String? whyNot(ActionType t) {
      if (!myTurn) return null;
      if (me.coins >= 10 && t != ActionType.coup) return 'Golpe obrigatório';
      if (t == ActionType.coup && me.coins < 7) return 'Precisa de 7';
      if (t == ActionType.assassinate && me.coins < 3) return 'Precisa de 3';
      if (CoupEngine.actionNeedsTarget(t) && _targets(s, me, t).isEmpty) {
        return 'Sem alvo';
      }
      return null;
    }

    Future<void> go(ActionType t) async {
      HapticFeedback.selectionClick();
      Player? target;
      if (CoupEngine.actionNeedsTarget(t)) {
        final targets = _targets(s, me, t);
        target = targets.length == 1
            ? targets.first
            : await showModalBottomSheet<Player>(
                context: context,
                backgroundColor: CoupColors.secondary,
                showDragHandle: true,
                builder: (_) => _TargetSheet(type: t, targets: targets),
              );
        if (target == null) return;
      }
      if (context.mounted) Navigator.of(context).pop();
      c.sendAction(GameAction(type: t, source: me.id, target: target?.id));
    }

    Widget tile(ActionType t, String hint, {Role? role}) {
      final why = whyNot(t);
      final bluff = role != null && !me.aliveRoles.contains(role);
      return _ActionTile(
        type: t,
        hint: why ?? hint,
        role: role,
        bluff: myTurn && bluff && why == null,
        enabled: myTurn && why == null,
        onTap: () => go(t),
      );
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: LayoutBuilder(
          builder: (context, box) {
            final cols = box.maxWidth >= 560 ? 4 : 2;
            const gap = 8.0;
            final w = (box.maxWidth - gap * (cols - 1)) / cols;
            Widget grid(List<Widget> tiles) => Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [for (final t in tiles) SizedBox(width: w, child: t)],
            );
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  myTurn ? 'Sua jogada' : 'Ações',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  myTurn
                      ? me.coins >= 10
                            ? 'Com 10 moedas o Golpe é obrigatório.'
                            : 'Você pode declarar qualquer personagem, mesmo sem ter.'
                      : 'Não é sua vez. Use para planejar a próxima jogada.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: myTurn && me.coins >= 10
                        ? CoupColors.error
                        : CoupColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 16),
                const _GroupLabel('Gerais'),
                grid([
                  tile(ActionType.income, '+1 moeda'),
                  tile(ActionType.foreignAid, '+2 · Duque bloqueia'),
                  tile(ActionType.coup, '-7 · sem defesa'),
                ]),
                const SizedBox(height: 12),
                const _GroupLabel('Personagens'),
                grid([
                  tile(ActionType.tax, 'Duque · +3', role: Role.duke),
                  tile(ActionType.steal, 'Capitão · +2', role: Role.captain),
                  tile(
                    ActionType.assassinate,
                    'Assassino · -3',
                    role: Role.assassin,
                  ),
                  tile(
                    ActionType.exchange,
                    'Embaixador',
                    role: Role.ambassador,
                  ),
                ]),
              ],
            );
          },
        ),
      ),
    );
  }

  static List<Player> _targets(GameState s, Player me, ActionType t) => s
      .players
      .where(
        (p) =>
            p.id != me.id &&
            p.isAlive &&
            (t != ActionType.steal || p.coins > 0),
      )
      .toList();
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
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: enabled ? 1 : 0.45,
      child: Material(
        color: style?.top.withValues(alpha: 0.35) ?? CoupColors.surfaceHigh,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: enabled ? onTap : null,
          child: Container(
            constraints: const BoxConstraints(minHeight: 58),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: accent.withValues(alpha: 0.4)),
            ),
            child: Row(
              children: [
                Icon(actionIcon(type), size: 22, color: accent),
                const SizedBox(width: 10),
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
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        hint,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
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
