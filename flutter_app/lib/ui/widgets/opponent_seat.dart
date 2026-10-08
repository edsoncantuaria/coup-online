import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';
import 'common.dart';
import 'tv.dart';
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
    final edge = switch (state) {
      SeatState.turn => Tv.foil,
      SeatState.waiting => Tv.cue,
      SeatState.target => Tv.carmine,
      SeatState.idle => Colors.transparent,
    };
    final label =
        statusLabel ??
        switch (state) {
          SeatState.turn => 'NA VEZ',
          SeatState.waiting => 'DECIDINDO',
          _ => dead ? 'SEM PALITOS' : null,
        };

    return Opacity(
      opacity: dead ? 0.5 : 1,
      child: Container(
        key: anchorKey,
        width: width,
        decoration: BoxDecoration(
          color: dead ? Tv.stage : clubColor(player.id),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(color: hot ? edge : Tv.rule, width: hot ? 2 : 1),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (traces.isNotEmpty && !dead) ...[
                        SizedBox(
                          width: 30,
                          height: 30,
                          child: CloseUp(role: traces.first, zoom: 1.2),
                        ),
                        const SizedBox(width: 8),
                      ],
                      Expanded(
                        child: Text(
                          player.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TvType.name(15, color: Tv.credit).copyWith(
                            height: 1.05,
                            decoration: dead
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      InfluencePips(
                        player: player,
                        revealAll: revealAll,
                        height: 18,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Align(
                          alignment: Alignment.centerRight,
                          child: CoinBadge(coins: player.coins),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  SizedBox(
                    height: 15,
                    child: peek != null && !revealAll
                        ? Text(
                            'VOCÊ VIU: ${roleLabel(peek!).toUpperCase()}',
                            maxLines: 1,
                            overflow: TextOverflow.clip,
                            style: TvType.credit(11, color: Tv.credit),
                          )
                        : Text.rich(
                            TextSpan(
                              children: [
                                for (final (i, r) in traces.indexed)
                                  TextSpan(
                                    text: '${roleLabel(r).toUpperCase()}  ',
                                    style: TvType.credit(
                                      11,
                                      color: Tv.credit.withValues(
                                        alpha: const [1.0, 0.75, 0.55][i],
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
            // A lixa da capa, com a deixa do rival escrita nela.
            SizedBox(
              height: 18,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  StrikerStrip(
                    height: 18,
                    color: state == SeatState.target && !dead
                        ? Tv.carmine
                        : Tv.striker,
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Row(
                      children: [
                        if (label != null)
                          Flexible(
                            child: Text(
                              label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TvType.credit(
                                10.5,
                                color: Tv.credit,
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
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Cor de capa de clube de cada jogador.
Color clubColor(String id) {
  const clubs = [
    Color(0xFF5A1520),
    Color(0xFF1E3B2D),
    Color(0xFF1F2A3D),
    Color(0xFF3A2416),
    Color(0xFF2E1A33),
  ];
  return clubs[id.codeUnits.fold<int>(0, (a, b) => a + b) % clubs.length];
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
        child: Container(width: 6, height: 2, color: Tv.credit),
      ),
    ),
  );
}
