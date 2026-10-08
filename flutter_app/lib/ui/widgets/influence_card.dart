import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';
import 'common.dart';

/// Carta de influência. Mostra arte do personagem, verso (oculta) ou a
/// carta virada (perdida, em tons de cinza com caveira).
class InfluenceCard extends StatelessWidget {
  const InfluenceCard({
    super.key,
    required this.role,
    this.hidden = false,
    this.flipped = false,
    this.width = 96,
    this.selected = false,
    this.highlight = false,
    this.onTap,
  });

  final Role? role;
  final bool hidden;
  final bool flipped;
  final double width;
  final bool selected;
  final bool highlight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final height = width * 1.45;
    final radius = BorderRadius.circular(3);
    final showBack = hidden || role == null;
    final style = showBack ? null : roleStyle(role!);

    Widget face;
    if (showBack) {
      // Verso: o "I" de Intriga em Bodoni sobre o ameixa do palco.
      face = ColoredBox(
        color: Tv.stageHigh,
        child: Center(
          child: Text('I', style: TvType.title(width * 0.5, color: Tv.rule)),
        ),
      );
    } else {
      face = Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [style!.top, style.bottom],
              ),
            ),
          ),
          // A arte já traz o nome do personagem; o rótulo só aparece no fallback.
          Image.asset(
            roleArt(role!),
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(style.icon, color: style.accent, size: width * 0.4),
                Text(
                  roleLabel(role!).toUpperCase(),
                  style: TextStyle(
                    color: style.accent,
                    fontWeight: FontWeight.w900,
                    fontSize: width * 0.12,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
      if (flipped) {
        face = Stack(
          fit: StackFit.expand,
          children: [
            ColorFiltered(
              colorFilter: const ColorFilter.matrix(<double>[
                0.25, 0.25, 0.25, 0, 0, //
                0.25, 0.25, 0.25, 0, 0, //
                0.25, 0.25, 0.25, 0, 0, //
                0, 0, 0, 1, 0,
              ]),
              child: face,
            ),
            ColoredBox(color: Tv.ink.withValues(alpha: 0.35)),
            Center(
              child: Transform.rotate(
                angle: -0.35,
                child: Text(
                  'FORA',
                  style: TvType.credit(
                    width * 0.16,
                    color: Tv.carmine,
                    weight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        );
      }
    }

    final borderColor = selected
        ? Tv.credit
        : highlight
        ? Tv.carmine
        : Tv.rule;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: width,
        height: height,
        transform: Matrix4.translationValues(0, selected ? -8 : 0, 0),
        decoration: BoxDecoration(
          borderRadius: radius,
          border: Border.all(
            color: borderColor,
            width: selected || highlight ? 2 : 1,
          ),
        ),
        child: ClipRRect(borderRadius: radius, child: face),
      ),
    );
  }
}

/// Vira a carta no eixo Y sempre que [flipKey] muda (revelação, perda,
/// troca). A face antiga gira até ficar de lado e a nova surge do outro lado.
class FlipSwitcher extends StatelessWidget {
  const FlipSwitcher({super.key, required this.flipKey, required this.child});
  final Object flipKey;
  final Widget child;

  @override
  Widget build(BuildContext context) => GenSwitcher(
    switchKey: flipKey,
    duration: const Duration(milliseconds: 520),
    switchInCurve: Curves.easeOut,
    switchOutCurve: Curves.easeIn,
    layoutBuilder: (current, previous) =>
        Stack(alignment: Alignment.center, children: [...previous, ?current]),
    transitionBuilder: (child, anim) => AnimatedBuilder(
      animation: anim,
      child: child,
      builder: (_, child) {
        // Os dois lados usam o mesmo ângulo; quem passa de 90° some.
        final angle = (1 - anim.value) * math.pi;
        if (angle > math.pi / 2) {
          return Opacity(opacity: 0, child: child);
        }
        return Transform(
          alignment: Alignment.center,
          transform: Matrix4.identity()
            ..setEntry(3, 2, 0.0015)
            ..rotateY(angle),
          child: child,
        );
      },
    ),
    child: child,
  );
}
