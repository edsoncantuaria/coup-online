import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../theme.dart';

const _avatarPalette = [
  Color(0xFF8C3B3B),
  Color(0xFF3B6E8C),
  Color(0xFF5C3B8C),
  Color(0xFF3B8C5E),
  Color(0xFF8C6F3B),
  Color(0xFF8C3B74),
];

Color avatarColor(String id) =>
    _avatarPalette[id.codeUnits.fold<int>(0, (a, b) => a + b) %
        _avatarPalette.length];

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first[0] + parts.last[0]).toUpperCase();
}

/// Círculo com as iniciais do jogador e um anel que indica o estado.
class PlayerAvatar extends StatelessWidget {
  const PlayerAvatar({
    super.key,
    required this.player,
    this.size = 40,
    this.ringColor,
  });

  final Player player;
  final double size;
  final Color? ringColor;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      width: size,
      height: size,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: ringColor ?? Colors.transparent, width: 2.5),
        boxShadow: ringColor == null
            ? null
            : [
                BoxShadow(
                  color: ringColor!.withValues(alpha: 0.45),
                  blurRadius: 10,
                ),
              ],
      ),
      child: CircleAvatar(
        // Sem cartas ainda (lobby) não conta como eliminado.
        backgroundColor: player.cards.isEmpty || player.isAlive
            ? avatarColor(player.id)
            : CoupColors.border,
        child: player.isBot
            ? Icon(
                Icons.smart_toy_outlined,
                size: size * 0.45,
                color: Colors.white70,
              )
            : Text(
                initials(player.name),
                style: TextStyle(
                  fontSize: size * 0.34,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
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
    final size = large ? 18.0 : 12.0;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 12 : 6,
        vertical: large ? 5 : 2,
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
          const SizedBox(width: 3),
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

/// Mini representação das influências: retângulos vivos (dourados) ou
/// perdidos (com o papel revelado).
class InfluencePips extends StatelessWidget {
  const InfluencePips({
    super.key,
    required this.player,
    this.revealAll = false,
  });
  final Player player;
  final bool revealAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final c in player.cards)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1.5),
            child: _pip(c),
          ),
      ],
    );
  }

  Widget _pip(GameCard c) {
    final show = (c.isFlipped || revealAll) && !c.hidden;
    final style = show ? roleStyle(c.role) : null;
    return Container(
      width: 18,
      height: 26,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(3),
        gradient: show
            ? LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [style!.top, style.bottom],
              )
            : const LinearGradient(
                colors: [Color(0xFF3A2915), Color(0xFF1A1208)],
              ),
        border: Border.all(
          color: c.isFlipped
              ? CoupColors.error.withValues(alpha: 0.6)
              : CoupColors.goldSoft,
        ),
      ),
      child: show
          ? Icon(
              style!.icon,
              size: 12,
              color: c.isFlipped
                  ? style.accent.withValues(alpha: 0.45)
                  : style.accent,
            )
          : null,
    );
  }
}
