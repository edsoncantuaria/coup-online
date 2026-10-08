import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';
import 'influence_card.dart';

/// Assento de um oponente na mesa: nome, moedas e cartas.
class PlayerSeat extends StatelessWidget {
  const PlayerSeat({
    super.key,
    required this.player,
    required this.isTurn,
    required this.isWaiting,
    this.isMe = false,
    this.showCards = false,
    this.onTap,
    this.selectable = false,
  });

  final Player player;
  final bool isTurn;
  final bool isWaiting;
  final bool isMe;
  final bool showCards;
  final bool selectable;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final dead = !player.isAlive;
    final borderColor = selectable
        ? CoupColors.error
        : isTurn
        ? CoupColors.gold
        : isWaiting
        ? CoupColors.info
        : CoupColors.border;

    return Opacity(
      opacity: dead ? 0.45 : 1,
      child: Material(
        color: CoupColors.surface,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            width: 150,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: borderColor,
                width: isTurn || selectable ? 2 : 1,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Icon(
                      player.isBot ? Icons.smart_toy_outlined : Icons.person,
                      size: 14,
                      color: CoupColors.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        player.name,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: isTurn ? CoupColors.goldHigh : CoupColors.text,
                          decoration: dead ? TextDecoration.lineThrough : null,
                        ),
                      ),
                    ),
                    if (isWaiting)
                      const SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: CoupColors.info,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final c in player.cards) ...[
                      InfluenceCard(
                        role: c.hidden ? null : c.role,
                        hidden: !c.isFlipped && !showCards,
                        flipped: c.isFlipped,
                        width: 44,
                      ),
                      const SizedBox(width: 4),
                    ],
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    CoinBadge(coins: player.coins),
                    if (player.personality != null)
                      Flexible(
                        child: Text(
                          personalityLabel(player.personality!),
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10,
                            color: CoupColors.textMuted,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CoinBadge extends StatelessWidget {
  const CoinBadge({super.key, required this.coins, this.large = false});
  final int coins;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final size = large ? 20.0 : 14.0;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 12 : 8,
        vertical: large ? 6 : 3,
      ),
      decoration: BoxDecoration(
        color: CoupColors.gold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: CoupColors.goldSoft),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.monetization_on, size: size, color: CoupColors.goldHigh),
          const SizedBox(width: 4),
          TweenAnimationBuilder<double>(
            tween: Tween(end: coins.toDouble()),
            duration: const Duration(milliseconds: 500),
            builder: (_, v, _) => Text(
              '${v.round()}',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: size,
                color: CoupColors.goldHigh,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
