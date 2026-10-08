import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/coup_engine.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../theme.dart';
import 'common.dart';
import 'stage.dart';
import 'tv.dart';

/// Abre a folha de ações. Fora da sua vez ela vira uma referência rápida
/// (tudo desabilitado), para planejar a próxima jogada.
Future<void> showActionSheet(BuildContext context, GameController c) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
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

    final coupCost = c.rules.coupCostFor(me.id);
    final steal = c.rules.stealFor(me.id);
    String? whyNot(ActionType t) {
      if (!c.rules.allows(me.id, t)) return 'Proibida nesta partida';
      if (!myTurn) return null;
      if (me.coins >= 10 && t != ActionType.coup) return 'Golpe obrigatório';
      if (t == ActionType.coup && me.coins < coupCost) {
        return 'Precisa de $coupCost';
      }
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
                showDragHandle: true,
                builder: (_) => _TargetSheet(type: t, targets: targets),
              );
        if (target == null) return;
      }
      if (context.mounted) Navigator.of(context).pop();
      c.sendAction(GameAction(type: t, source: me.id, target: target?.id));
    }

    Widget tile(ActionType t, String hint, {Role? role, String? figure}) {
      final why = whyNot(t);
      final bluff = role != null && !me.aliveRoles.contains(role);
      return _ActionTile(
        type: t,
        figure: figure,
        hint: why ?? hint,
        role: role,
        bluff: myTurn && bluff && why == null,
        enabled: myTurn && why == null,
        onTap: () => go(t),
      );
    }

    final general = [
      tile(ActionType.income, 'Pega uma moeda', figure: '+1'),
      tile(ActionType.foreignAid, 'O Duque pode bloquear', figure: '+2'),
      tile(ActionType.coup, 'Sem defesa possível', figure: '−$coupCost'),
    ];
    final roles = [
      tile(ActionType.tax, 'Duque · +3 moedas', role: Role.duke),
      tile(ActionType.steal, 'Capitão · leva $steal', role: Role.captain),
      tile(ActionType.assassinate, 'Assassino · custa 3', role: Role.assassin),
      tile(ActionType.exchange, 'Embaixador · troca 2', role: Role.ambassador),
    ];

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: LayoutBuilder(
          builder: (context, box) {
            final two = box.maxWidth >= 640;
            final head = Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  myTurn ? 'Sua jogada.' : 'O roteiro.',
                  style: TvType.title(34),
                ),
                const SizedBox(height: 4),
                Text(
                  myTurn
                      ? me.coins >= 10
                            ? 'Com 10 moedas o Golpe é obrigatório.'
                            : 'Declare qualquer personagem, mesmo sem ter.'
                      : 'Não é sua vez. Use para planejar a próxima jogada.',
                  style: TextStyle(
                    fontFamily: TvType.sans,
                    fontSize: 14,
                    color: myTurn && me.coins >= 10 ? Tv.carmine : Tv.creditDim,
                  ),
                ),
              ],
            );
            final generalCol = Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [const _GroupLabel('Gerais'), ...general],
            );
            final rolesCol = Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [const _GroupLabel('Personagens'), ...roles],
            );
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                head,
                const SizedBox(height: 16),
                if (two)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: rolesCol),
                      const SizedBox(width: 28),
                      Expanded(child: generalCol),
                    ],
                  )
                else ...[
                  rolesCol,
                  const SizedBox(height: 18),
                  generalCol,
                ],
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
    padding: const EdgeInsets.only(bottom: 4),
    child: Text(text.toUpperCase(), style: TvType.credit(11)),
  );
}

/// Uma linha do roteiro: o close do personagem (ou o valor em moedas), o
/// nome da ação em Bodoni e o crédito do que ela faz.
class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.type,
    required this.hint,
    required this.enabled,
    required this.onTap,
    this.role,
    this.figure,
    this.bluff = false,
  });

  final ActionType type;
  final String hint;
  final bool enabled;
  final VoidCallback onTap;
  final Role? role;
  final String? figure;
  final bool bluff;

  @override
  Widget build(BuildContext context) {
    final accent = role != null ? roleStyle(role!).accent : Tv.coin;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 160),
      opacity: enabled ? 1 : 0.4,
      child: Semantics(
        button: true,
        enabled: enabled,
        child: InkWell(
          onTap: enabled ? onTap : null,
          splashColor: Tv.carmine.withValues(alpha: 0.18),
          highlightColor: Tv.carmine.withValues(alpha: 0.08),
          child: Container(
            constraints: const BoxConstraints(minHeight: 64),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Tv.rule)),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 48,
                  height: 48,
                  child: role != null
                      ? CloseUp(role: role!, zoom: 1.3)
                      : Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            figure ?? '',
                            style: TvType.figure(22, color: Tv.coin),
                          ),
                        ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(shortActionLabel(type), style: TvType.name(22)),
                      const SizedBox(height: 2),
                      Text(
                        hint.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TvType.credit(10.5, color: accent),
                      ),
                    ],
                  ),
                ),
                if (bluff)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      'BLEFE',
                      style: TvType.credit(
                        11,
                        color: Tv.bluff,
                        weight: FontWeight.w700,
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
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${shortActionLabel(type)}: quem?', style: TvType.title(30)),
          const SizedBox(height: 12),
          for (final p in targets)
            CreditLine(
              title: p.name,
              size: 24,
              credit:
                  '${p.influence} influência${p.influence > 1 ? 's' : ''} · '
                  '${p.coins} moeda${p.coins == 1 ? '' : 's'}',
              trailing: PlayerAvatar(player: p, size: 40),
              onTap: () => Navigator.of(context).pop(p),
            ),
        ],
      ),
    ),
  );
}
