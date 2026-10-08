import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../theme.dart';
import 'influence_card.dart';

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

/// Moedas do jogador. Quando o valor muda, um "+N" ou "−N" sobe e some.
class CoinBadge extends StatefulWidget {
  const CoinBadge({super.key, required this.coins, this.large = false});
  final int coins;
  final bool large;

  @override
  State<CoinBadge> createState() => _CoinBadgeState();
}

class _CoinBadgeState extends State<CoinBadge>
    with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );
  int _delta = 0;

  @override
  void didUpdateWidget(CoinBadge old) {
    super.didUpdateWidget(old);
    if (old.coins != widget.coins) {
      _delta = widget.coins - old.coins;
      _ctrl.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final large = widget.large;
    final size = large ? 18.0 : 12.0;
    final up = _delta > 0;
    final deltaColor = up ? CoupColors.success : CoupColors.error;
    return Stack(
      clipBehavior: Clip.none,
      alignment: Alignment.center,
      children: [
        AnimatedBuilder(
          animation: _ctrl,
          builder: (_, child) {
            // Pulso rápido no início da animação.
            final t = _ctrl.isAnimating ? _ctrl.value : 1.0;
            final pulse = t < 0.25
                ? 1 + 0.18 * (1 - (t - 0.125).abs() / 0.125)
                : 1.0;
            return Transform.scale(scale: pulse, child: child);
          },
          child: Container(
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
                Icon(
                  Icons.monetization_on,
                  size: size,
                  color: CoupColors.goldHigh,
                ),
                const SizedBox(width: 3),
                TweenAnimationBuilder<double>(
                  tween: Tween(end: widget.coins.toDouble()),
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
          ),
        ),
        Positioned(
          top: -4,
          child: IgnorePointer(
            child: AnimatedBuilder(
              animation: _ctrl,
              builder: (_, _) {
                if (!_ctrl.isAnimating || _delta == 0) {
                  return const SizedBox.shrink();
                }
                final t = Curves.easeOut.transform(_ctrl.value);
                return Transform.translate(
                  offset: Offset(0, -22 * t),
                  child: Opacity(
                    opacity: (1 - _ctrl.value).clamp(0.0, 1.0),
                    child: Text(
                      up ? '+$_delta' : '−${-_delta}',
                      style: TextStyle(
                        fontSize: large ? 16 : 12,
                        fontWeight: FontWeight.w900,
                        color: deltaColor,
                        shadows: const [
                          Shadow(color: Colors.black, blurRadius: 4),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ],
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
            child: FlipSwitcher(
              flipKey:
                  '${c.isFlipped}-${(c.isFlipped || revealAll) && !c.hidden ? c.role : null}',
              child: _pip(c),
            ),
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

/// [AnimatedSwitcher] que aceita a mesma chave voltando enquanto a anterior
/// ainda sai de cena (ex.: bloqueio → desafio → bloqueio em sequência). Cada
/// mudança de [switchKey] gera uma geração nova, então nunca há chaves
/// duplicadas na transição.
class GenSwitcher extends StatefulWidget {
  const GenSwitcher({
    super.key,
    required this.switchKey,
    required this.child,
    this.duration = const Duration(milliseconds: 300),
    this.switchInCurve = Curves.linear,
    this.switchOutCurve = Curves.linear,
    this.transitionBuilder = AnimatedSwitcher.defaultTransitionBuilder,
    this.layoutBuilder = AnimatedSwitcher.defaultLayoutBuilder,
  });

  final Object? switchKey;
  final Widget child;
  final Duration duration;
  final Curve switchInCurve;
  final Curve switchOutCurve;
  final AnimatedSwitcherTransitionBuilder transitionBuilder;
  final AnimatedSwitcherLayoutBuilder layoutBuilder;

  @override
  State<GenSwitcher> createState() => _GenSwitcherState();
}

class _GenSwitcherState extends State<GenSwitcher> {
  int _gen = 0;

  @override
  void didUpdateWidget(GenSwitcher old) {
    super.didUpdateWidget(old);
    if (old.switchKey != widget.switchKey) _gen++;
  }

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: widget.duration,
    switchInCurve: widget.switchInCurve,
    switchOutCurve: widget.switchOutCurve,
    transitionBuilder: widget.transitionBuilder,
    layoutBuilder: widget.layoutBuilder,
    child: KeyedSubtree(key: ValueKey(_gen), child: widget.child),
  );
}
