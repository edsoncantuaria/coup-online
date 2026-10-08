import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';
import 'common.dart';
import 'voice_controls.dart';

enum SeatState { idle, turn, waiting, target }

/// Um rival no elenco do topo: nome em Bodoni, moedas, influências e o
/// rastro do que ele andou dizendo ser (o mais velho já apagando).
class OpponentSeat extends StatelessWidget {
  const OpponentSeat({
    super.key,
    required this.player,
    required this.state,
    this.revealAll = false,
    this.width = 116,
    this.statusLabel,
    this.voice,
    this.anchorKey,
    this.peek,
    this.traces = const [],
  });

  final Player player;
  final SeatState state;
  final bool revealAll;
  final double width;

  /// Rótulo curto da cena (ex.: "ALVO", "BLOQUEIA").
  final String? statusLabel;

  /// Estado no chat de voz: null = fora, true = mudo, false = falando.
  final bool? voice;

  /// Marca a posição do rival para as animações da mesa.
  final Key? anchorKey;

  /// Carta deste rival que você conhece (bênção Olho Clínico).
  final Role? peek;

  /// Papéis que ele declarou, do mais novo ao mais velho.
  final List<Role> traces;

  @override
  Widget build(BuildContext context) {
    final dead = !player.isAlive;
    final hot = state != SeatState.idle && !dead;
    final rule = switch (state) {
      SeatState.turn => Tv.credit,
      SeatState.waiting => Tv.cue,
      SeatState.target => Tv.carmine,
      SeatState.idle => Tv.rule,
    };
    final label =
        statusLabel ??
        switch (state) {
          SeatState.turn => 'EM CENA',
          SeatState.waiting => 'DECIDINDO',
          _ => dead ? 'FORA' : null,
        };

    return Opacity(
      opacity: dead ? 0.45 : 1,
      child: Container(
        key: anchorKey,
        width: width,
        padding: const EdgeInsets.fromLTRB(0, 8, 6, 8),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: rule, width: hot ? 2 : 1),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 14,
              child: Row(
                children: [
                  if (label != null)
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TvType.credit(
                          10,
                          color: dead ? Tv.creditMuted : rule,
                          weight: FontWeight.w700,
                        ),
                      ),
                    ),
                  if (state == SeatState.waiting) ...[
                    const SizedBox(width: 4),
                    const _ThinkingTick(),
                  ],
                  const Spacer(),
                  if (voice != null) VoiceBadge(muted: voice, size: 11),
                ],
              ),
            ),
            const SizedBox(height: 2),
            Text(
              player.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TvType.name(
                17,
                color: dead ? Tv.creditMuted : Tv.credit,
              ).copyWith(decoration: dead ? TextDecoration.lineThrough : null),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                InfluencePips(player: player, revealAll: revealAll, height: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: CoinBadge(coins: player.coins),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: 12,
              child: peek != null && !revealAll
                  ? Text(
                      'VOCÊ VIU: ${roleLabel(peek!).toUpperCase()}',
                      maxLines: 1,
                      overflow: TextOverflow.clip,
                      style: TvType.credit(9, color: roleStyle(peek!).accent),
                    )
                  : Text.rich(
                      TextSpan(
                        children: [
                          for (final (i, r) in traces.indexed)
                            TextSpan(
                              text: '${roleLabel(r).toUpperCase()}  ',
                              style: TvType.credit(
                                9,
                                color: roleStyle(r).accent.withValues(
                                  alpha: const [1.0, 0.55, 0.3][i],
                                ),
                              ),
                            ),
                        ],
                      ),
                      maxLines: 1,
                      softWrap: false,
                      overflow: TextOverflow.clip,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Um traço que corre enquanto o rival decide.
class _ThinkingTick extends StatefulWidget {
  const _ThinkingTick();

  @override
  State<_ThinkingTick> createState() => _ThinkingTickState();
}

class _ThinkingTickState extends State<_ThinkingTick>
    with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _ctrl.value = 0.5;
    } else if (!_ctrl.isAnimating) {
      _ctrl.repeat();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 18,
    height: 2,
    child: AnimatedBuilder(
      animation: _ctrl,
      builder: (_, _) => Align(
        alignment: Alignment(_ctrl.value * 2 - 1, 0),
        child: Container(width: 6, height: 2, color: Tv.cue),
      ),
    ),
  );
}
