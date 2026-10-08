// Folha de contato das animações das cartas, para revisar os efeitos.
// flutter build web -t tool/effects_preview.dart
import 'package:coup/ui/theme.dart';
import 'package:coup/ui/widgets/card_effects.dart';
import 'package:flutter/material.dart';

void main() => runApp(
  MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: buildCoupTheme(),
    home: const _Sheet(),
  ),
);

const _ts = [0.12, 0.3, 0.42, 0.55, 0.75];

class _Sheet extends StatelessWidget {
  const _Sheet();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SingleChildScrollView(
      child: Column(
        children: [
          for (final k in EffectKind.values)
            Row(
              children: [
                SizedBox(
                  width: 110,
                  child: Text(k.name, style: const TextStyle(fontSize: 12)),
                ),
                for (final t in _ts)
                  Container(
                    width: 200,
                    height: 230,
                    decoration: BoxDecoration(
                      border: Border.all(color: CoupColors.border),
                    ),
                    child: ClipRect(
                      child: CustomPaint(
                        painter: EffectPainter(
                          kind: k,
                          t: t,
                          from: const Offset(100, 190),
                          to: const Offset(100, 40),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
        ],
      ),
    ),
  );
}
