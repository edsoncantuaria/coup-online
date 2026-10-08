import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../../engine/labels.dart';
import '../theme.dart';
import 'influence_card.dart';
import 'tv.dart';

const _avatarPalette = [
  Color(0xFF5A2333),
  Color(0xFF2E3A52),
  Color(0xFF42305A),
  Color(0xFF2F4A3E),
  Color(0xFF5A4326),
  Color(0xFF4F2A4A),
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

/// Monograma do jogador em Bodoni, com um fio fino que indica o estado.
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
    // Sem cartas ainda (lobby) não conta como eliminado.
    final alive = player.cards.isEmpty || player.isAlive;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: alive ? avatarColor(player.id) : Tv.stage,
        border: Border.all(
          color: ringColor ?? Tv.rule,
          width: ringColor == null ? 1 : 2,
        ),
      ),
      child: Text(
        initials(player.name),
        style: TvType.name(
          size * 0.4,
          color: alive ? Tv.credit : Tv.creditMuted,
        ),
      ),
    );
  }
}

/// Moedas do jogador. O número corre até o valor novo e um "+N" ou "−N"
/// sobe e some.
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
      if (!MediaQuery.of(context).disableAnimations) _ctrl.forward(from: 0);
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
    final size = large ? 30.0 : 15.0;
    final up = _delta > 0;
    return Semantics(
      label: '${widget.coins} moedas',
      excludeSemantics: true,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                BallisticCount(
                  value: widget.coins,
                  style: TvType.figure(size, color: Tv.coin),
                ),
                const SizedBox(width: 4),
                Text(
                  large ? 'MOEDAS' : 'M',
                  style: TvType.credit(large ? 11 : 9, color: Tv.coin),
                ),
              ],
            ),
          ),
          Positioned(
            right: 0,
            top: -6,
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _ctrl,
                builder: (_, _) {
                  if (!_ctrl.isAnimating || _delta == 0) {
                    return const SizedBox.shrink();
                  }
                  final t = Curves.easeOut.transform(_ctrl.value);
                  return Transform.translate(
                    offset: Offset(0, -20 * t),
                    child: Opacity(
                      opacity: (1 - _ctrl.value).clamp(0.0, 1.0),
                      child: Text(
                        up ? '+$_delta' : '−${-_delta}',
                        style: TvType.figure(
                          large ? 18 : 13,
                          color: up ? Tv.proven : Tv.carmineText,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Influências como palitos de fósforo: inteiros enquanto vivas, queimados
/// quando perdidas, com a inicial do papel quando ele é conhecido.
class InfluencePips extends StatelessWidget {
  const InfluencePips({
    super.key,
    required this.player,
    this.revealAll = false,
    this.height = 22,
  });
  final Player player;
  final bool revealAll;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label:
          '${player.influence} influência${player.influence == 1 ? '' : 's'}',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final c in player.cards)
            Padding(
              padding: const EdgeInsets.only(right: 5),
              child: FlipSwitcher(
                flipKey:
                    '${c.isFlipped}-${(c.isFlipped || revealAll) && !c.hidden ? c.role : null}',
                child: _pip(c),
              ),
            ),
        ],
      ),
    );
  }

  Widget _pip(GameCard c) {
    final show = (c.isFlipped || revealAll) && !c.hidden;
    return MatchStick(
      burnt: c.isFlipped,
      height: height * 1.3,
      mark: show ? roleLabel(c.role).substring(0, 1) : null,
      markColor: show ? roleStyle(c.role).accent : Tv.credit,
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
