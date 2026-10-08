import 'package:flutter/material.dart';

import '../../engine/coup_engine.dart';
import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';
import 'common.dart';
import 'influence_card.dart';

/// Centro da mesa: mostra a jogada em curso (quem, o quê, contra quem),
/// o que se espera agora e o último acontecimento.
class Arena extends StatelessWidget {
  const Arena({
    super.key,
    required this.state,
    required this.myId,
    this.onOpenLog,
    this.showRecentLog = true,
  });

  final GameState state;
  final String myId;
  final VoidCallback? onOpenLog;
  final bool showRecentLog;

  String _n(String? id) =>
      id == myId ? 'Você' : (state.playerById(id)?.name ?? '?');

  @override
  Widget build(BuildContext context) {
    final s = state;
    final event = latestEvent(s, myId);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: KeyedSubtree(
            key: ValueKey(
              '${s.phase.wire}-${s.currentAction?.type}-${s.pendingBlock?.blockerId}-${s.turnIndex}',
            ),
            child: _move(context),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          describeWaiting(s, myId),
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: CoupColors.textSecondary,
            fontSize: 13,
            height: 1.3,
          ),
        ),
        const SizedBox(height: 14),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 350),
          transitionBuilder: (child, anim) => FadeTransition(
            opacity: anim,
            child: SizeTransition(sizeFactor: anim, child: child),
          ),
          child: event == null
              ? const SizedBox(key: ValueKey('none'), width: double.infinity)
              : EventBanner(key: ValueKey(event.stamp), event: event),
        ),
        if (showRecentLog && s.logs.isNotEmpty) ...[
          const SizedBox(height: 10),
          InkWell(
            onTap: onOpenLog,
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: Column(
                children: [
                  for (final line in s.logs.reversed.take(3).toList().reversed)
                    Text(
                      line,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: CoupColors.textMuted,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _move(BuildContext context) {
    final s = state;
    final a = s.currentAction;
    final pb = s.pendingBlock;

    if (s.phase == Phase.gameOver) {
      return _Headline(
        icon: Icons.emoji_events,
        text: 'Fim de jogo',
        color: CoupColors.goldHigh,
      );
    }

    if (s.phase == Phase.losingInfluence) {
      final reason = switch (s.losingContext?.reason) {
        LossReason.coup => 'sofreu um Golpe',
        LossReason.assassinate => 'foi assassinado',
        LossReason.challengeLost => 'errou o desafio',
        LossReason.bluffCaught => 'foi pego blefando',
        null => 'perde influência',
      };
      final p = s.playerById(s.losingInfluenceId);
      return Column(
        children: [
          if (p != null)
            PlayerAvatar(player: p, size: 56, ringColor: CoupColors.error),
          const SizedBox(height: 8),
          _Headline(
            text: '${_n(s.losingInfluenceId)} $reason',
            color: CoupColors.error,
          ),
        ],
      );
    }

    if (a != null && (s.phase == Phase.challenge || s.phase == Phase.block)) {
      final actor = s.playerById(a.source);
      final target = s.playerById(a.target);
      final claim = CoupEngine.requiredRole(a.type);
      return Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (actor != null)
                Flexible(
                  child: _Who(player: actor, label: _n(actor.id)),
                ),
              const SizedBox(width: 10),
              Flexible(
                flex: 2,
                child: _ActionChip(type: a.type, claim: claim),
              ),
              if (target != null) ...[
                const SizedBox(width: 10),
                Flexible(
                  child: _Who(player: target, label: _n(target.id)),
                ),
              ],
            ],
          ),
          if (pb != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: CoupColors.info.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: CoupColors.info.withValues(alpha: 0.6),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.shield, color: CoupColors.info, size: 18),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      '${_n(pb.blockerId)} bloqueia com ${roleLabel(pb.role)}',
                      style: const TextStyle(
                        color: CoupColors.info,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      );
    }

    if (s.phase == Phase.exchanging) {
      return _Headline(
        icon: Icons.swap_horiz,
        text: '${_n(s.waitingFor?.id)} troca cartas com a Corte',
        color: roleStyle(Role.ambassador).accent,
      );
    }

    final cp = s.currentPlayer;
    if (cp == null) return const SizedBox.shrink();
    final mine = cp.id == myId;
    return Column(
      children: [
        PlayerAvatar(player: cp, size: 56, ringColor: CoupColors.gold),
        const SizedBox(height: 8),
        _Headline(
          text: mine ? 'Sua vez' : 'Vez de ${cp.name}',
          color: mine ? CoupColors.goldHigh : CoupColors.text,
        ),
      ],
    );
  }
}

class _Headline extends StatelessWidget {
  const _Headline({required this.text, required this.color, this.icon});
  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (icon != null) ...[
        Icon(icon, color: color, size: 22),
        const SizedBox(width: 6),
      ],
      Flexible(
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ),
    ],
  );
}

class _Who extends StatelessWidget {
  const _Who({required this.player, required this.label});
  final Player player;
  final String label;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 96,
    child: Column(
      children: [
        PlayerAvatar(player: player, size: 44),
        const SizedBox(height: 4),
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.type, this.claim});
  final ActionType type;
  final Role? claim;

  @override
  Widget build(BuildContext context) {
    final style = claim != null ? roleStyle(claim!) : null;
    final color = style?.accent ?? CoupColors.goldHigh;
    return Column(
      children: [
        if (claim != null)
          InfluenceCard(role: claim, width: 46)
        else
          Container(
            width: 46,
            height: 46 * 1.45,
            decoration: BoxDecoration(
              color: CoupColors.surfaceHigh,
              borderRadius: BorderRadius.circular(5),
              border: Border.all(color: CoupColors.goldSoft),
            ),
            child: Icon(actionIcon(type), color: color),
          ),
        const SizedBox(height: 4),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                shortActionLabel(type),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
            const Icon(
              Icons.arrow_forward,
              size: 14,
              color: CoupColors.textMuted,
            ),
          ],
        ),
      ],
    );
  }
}

IconData actionIcon(ActionType t) => switch (t) {
  ActionType.income => Icons.add_circle_outline,
  ActionType.foreignAid => Icons.public,
  ActionType.coup => Icons.whatshot,
  ActionType.tax => Icons.account_balance,
  ActionType.steal => Icons.anchor,
  ActionType.assassinate => Icons.colorize,
  ActionType.exchange => Icons.swap_horiz,
};

String shortActionLabel(ActionType t) => switch (t) {
  ActionType.income => 'Renda',
  ActionType.foreignAid => 'Ajuda Externa',
  ActionType.coup => 'Golpe',
  ActionType.tax => 'Taxa',
  ActionType.steal => 'Extorsão',
  ActionType.assassinate => 'Assassinar',
  ActionType.exchange => 'Troca',
};

/// Frase sobre quem a mesa está esperando.
String describeWaiting(GameState s, String myId) {
  String n(String? id) => id == myId ? 'você' : (s.playerById(id)?.name ?? '?');
  final w = s.waitingFor?.id;
  final me = w == myId;
  switch (s.phase) {
    case Phase.action:
      return s.currentPlayer?.id == myId
          ? 'Escolha uma ação abaixo.'
          : '${n(s.currentPlayer?.id)} está escolhendo uma ação.';
    case Phase.challenge:
      return me
          ? 'Você acredita? Decida se desafia.'
          : 'Aguardando ${n(w)} decidir se desafia.';
    case Phase.block:
      if (s.pendingBlock != null) {
        return me
            ? 'Decida se desafia o bloqueio.'
            : 'Aguardando ${n(w)} decidir se desafia o bloqueio.';
      }
      return me
          ? 'Decida se bloqueia.'
          : 'Aguardando ${n(w)} decidir se bloqueia.';
    case Phase.losingInfluence:
      return s.losingInfluenceId == myId
          ? 'Escolha qual carta revelar.'
          : 'Aguardando ${n(s.losingInfluenceId)} escolher a carta.';
    case Phase.exchanging:
      return me ? 'Escolha quais cartas manter.' : 'A Corte aguarda a troca.';
    case Phase.gameOver:
    case Phase.reveal:
      return '';
  }
}

class GameEvent {
  GameEvent(this.stamp, this.text, this.color, this.icon, [this.role]);
  final int stamp;
  final String text;
  final Color color;
  final IconData icon;
  final Role? role;
}

GameEvent? latestEvent(GameState s, String myId) {
  String n(String id, String name) => id == myId ? 'Você' : name;
  final events = <GameEvent>[
    if (s.lastResolved != null)
      GameEvent(
        s.lastResolved!.stamp,
        s.lastResolved!.summary,
        CoupColors.gold,
        Icons.campaign,
      ),
    if (s.lastReveal != null)
      GameEvent(
        s.lastReveal!.stamp,
        s.lastReveal!.proven
            ? '${n(s.lastReveal!.playerId, s.lastReveal!.playerName)} provou ter ${roleLabel(s.lastReveal!.role)}!'
            : '${n(s.lastReveal!.playerId, s.lastReveal!.playerName)} blefou ${roleLabel(s.lastReveal!.role)}!',
        s.lastReveal!.proven ? CoupColors.success : CoupColors.bluff,
        s.lastReveal!.proven ? Icons.verified : Icons.theater_comedy,
        s.lastReveal!.role,
      ),
    if (s.lastLoss != null)
      GameEvent(
        s.lastLoss!.stamp,
        '${n(s.lastLoss!.playerId, s.lastLoss!.playerName)} perdeu ${roleLabel(s.lastLoss!.role)}.',
        CoupColors.error,
        Icons.heart_broken,
        s.lastLoss!.role,
      ),
  ];
  if (events.isEmpty) return null;
  events.sort((a, b) => b.stamp.compareTo(a.stamp));
  return events.first;
}

class EventBanner extends StatelessWidget {
  const EventBanner({super.key, required this.event});
  final GameEvent event;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: event.color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: event.color.withValues(alpha: 0.5)),
    ),
    child: Row(
      children: [
        Icon(event.icon, color: event.color, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            event.text,
            style: TextStyle(
              color: event.color,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
      ],
    ),
  );
}
