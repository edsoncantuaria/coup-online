import 'package:flutter/material.dart';

import '../theme.dart';

/// Brasão do jogo: um losango dourado com a coroa ao centro.
class Emblem extends StatelessWidget {
  const Emblem({super.key, this.size = 72});
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: const CustomPaint(painter: EmblemPainter()),
  );
}

class EmblemPainter extends CustomPainter {
  const EmblemPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide / 100;
    canvas.save();
    canvas.translate((size.width - 100 * s) / 2, (size.height - 100 * s) / 2);
    canvas.scale(s);

    Path diamond(double inset) => Path()
      ..moveTo(50, inset)
      ..lineTo(100 - inset, 50)
      ..lineTo(50, 100 - inset)
      ..lineTo(inset, 50)
      ..close();

    const rect = Rect.fromLTWH(0, 0, 100, 100);
    canvas.drawPath(
      diamond(3),
      Paint()
        ..shader = const RadialGradient(
          center: Alignment(0, -0.2),
          colors: [Color(0xFF5A1A1A), Color(0xFF1A0909)],
        ).createShader(rect),
    );
    final goldShader = const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [CoupColors.goldHigh, CoupColors.goldSoft, CoupColors.goldHigh],
    ).createShader(rect);
    canvas.drawPath(
      diamond(3),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.2
        ..strokeJoin = StrokeJoin.miter
        ..shader = goldShader,
    );
    canvas.drawPath(
      diamond(10),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = CoupColors.goldSoft.withValues(alpha: 0.8),
    );

    // Coroa.
    final crown = Path()
      ..moveTo(31, 60)
      ..lineTo(27, 38)
      ..lineTo(40, 49)
      ..lineTo(50, 31)
      ..lineTo(60, 49)
      ..lineTo(73, 38)
      ..lineTo(69, 60)
      ..close();
    final gold = Paint()..shader = goldShader;
    canvas.drawPath(crown, gold);
    canvas.drawRRect(
      RRect.fromLTRBR(30, 61, 70, 67, const Radius.circular(1.5)),
      gold,
    );
    for (final p in const [Offset(27, 37), Offset(50, 30), Offset(73, 37)]) {
      canvas.drawCircle(p, 3.2, gold);
    }
    final gem = Paint()..color = const Color(0xFF8E1F1F);
    for (final x in const [40.0, 50.0, 60.0]) {
      canvas.drawCircle(Offset(x, 64), 1.6, gem);
    }
    canvas.drawCircle(const Offset(50, 52), 2.4, gem);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
