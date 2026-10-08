import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../theme.dart';
import 'common.dart';
import 'voice_controls.dart';

enum SeatState { idle, turn, waiting, target }

/// Assento compacto de um oponente: avatar, nome, moedas e influências.
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
  });

  final Player player;
  final SeatState state;
  final bool revealAll;
  final double width;

  /// Rótulo curto sobre o assento (ex.: "ALVO", "DESAFIOU").
  final String? statusLabel;

  /// Estado no chat de voz: null = fora, true = mudo, false = falando.
  final bool? voice;

  /// Marca a posição do avatar para as animações da mesa.
  final Key? anchorKey;

  @override
  Widget build(BuildContext context) {
    final dead = !player.isAlive;
    final ring = switch (state) {
      SeatState.turn => CoupColors.gold,
      SeatState.waiting => CoupColors.info,
      SeatState.target => CoupColors.error,
      SeatState.idle => null,
    };

    return Opacity(
      opacity: dead ? 0.4 : 1,
      child: SizedBox(
        width: width,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                PlayerAvatar(
                  key: anchorKey,
                  player: player,
                  size: 46,
                  ringColor: ring,
                ),
                if (dead)
                  const Icon(Icons.close, color: CoupColors.error, size: 40),
                if (statusLabel != null)
                  Positioned(
                    top: -8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: ring ?? CoupColors.surfaceHigh,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        statusLabel!,
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.8,
                          color: Colors.black,
                        ),
                      ),
                    ),
                  ),
                if (voice != null)
                  Positioned(
                    left: width / 2 - 34,
                    bottom: -2,
                    child: VoiceBadge(muted: voice, size: 11),
                  ),
                if (state == SeatState.waiting)
                  const Positioned(
                    right: 22,
                    bottom: -2,
                    child: _ThinkingDots(),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              player.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: state == SeatState.turn
                    ? CoupColors.goldHigh
                    : CoupColors.text,
                decoration: dead ? TextDecoration.lineThrough : null,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                InfluencePips(player: player, revealAll: revealAll),
                const SizedBox(width: 6),
                CoinBadge(coins: player.coins),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ThinkingDots extends StatefulWidget {
  const _ThinkingDots();

  @override
  State<_ThinkingDots> createState() => _ThinkingDotsState();
}

class _ThinkingDotsState extends State<_ThinkingDots>
    with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      decoration: BoxDecoration(
        color: CoupColors.info,
        borderRadius: BorderRadius.circular(8),
      ),
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, _) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++)
              Container(
                width: 4,
                height: 4,
                margin: const EdgeInsets.symmetric(horizontal: 1),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(
                    alpha: ((_ctrl.value * 3 - i) % 3) < 1 ? 1 : 0.35,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
