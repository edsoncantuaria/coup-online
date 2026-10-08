import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';

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
    final radius = BorderRadius.circular(width * 0.1);
    final showBack = hidden || role == null;
    final style = showBack ? null : roleStyle(role!);

    Widget face;
    if (showBack) {
      face = Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF2A1D10), Color(0xFF120C06)],
          ),
          borderRadius: radius,
        ),
        child: Center(
          child: Icon(
            Icons.local_police_outlined,
            color: CoupColors.goldSoft,
            size: width * 0.4,
          ),
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
            Center(
              child: Icon(
                Icons.close_rounded,
                color: CoupColors.error.withValues(alpha: 0.85),
                size: width * 0.6,
              ),
            ),
          ],
        );
      }
    }

    final borderColor = selected
        ? CoupColors.goldHigh
        : highlight
        ? CoupColors.error
        : CoupColors.goldSoft.withValues(alpha: flipped ? 0.3 : 0.8);

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
            width: selected || highlight ? 2.5 : 1.2,
          ),
          boxShadow: [
            if (selected || highlight)
              BoxShadow(
                color: borderColor.withValues(alpha: 0.5),
                blurRadius: 14,
                spreadRadius: 1,
              ),
            const BoxShadow(
              color: Colors.black54,
              blurRadius: 6,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: ClipRRect(borderRadius: radius, child: face),
      ),
    );
  }
}
