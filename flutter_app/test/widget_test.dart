import 'dart:math';

import 'package:coup/game/local_game_controller.dart';
import 'package:coup/main.dart';
import 'package:coup/ui/screens/game_screen.dart';
import 'package:coup/ui/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('menu inicial mostra os modos de jogo', (tester) async {
    tester.view.physicalSize = const Size(430 * 3, 1000 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const CoupApp());
    await tester.pump();
    expect(find.text('COUP'), findsOneWidget);
    expect(find.text('JOGAR OFFLINE'), findsOneWidget);
    expect(find.text('JOGAR ONLINE'), findsOneWidget);
  });

  for (final size in const [Size(390, 844), Size(360, 640), Size(1280, 800)]) {
    testWidgets(
      'partida offline roda até o fim em ${size.width.toInt()}x${size.height.toInt()}',
      (tester) async {
        tester.view.physicalSize = size * 3;
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);

        final controller = LocalGameController(
          playerName: 'Teste',
          botCount: 3,
          botDelay: const Duration(milliseconds: 50),
          turnSeconds: 1, // o relógio estoura e a IA joga pelo humano
          random: Random(7),
        );
        await tester.pumpWidget(
          MaterialApp(
            theme: buildCoupTheme(),
            home: GameScreen(controller: controller),
          ),
        );

        for (
          var i = 0;
          i < 3000 && find.text('JOGAR DE NOVO').evaluate().isEmpty;
          i++
        ) {
          await tester.pump(const Duration(milliseconds: 200));
        }
        expect(find.text('JOGAR DE NOVO'), findsOneWidget);
        expect(tester.takeException(), isNull);

        await tester.tap(find.text('JOGAR DE NOVO'));
        await tester.pump(const Duration(seconds: 1));
        expect(find.text('JOGAR DE NOVO'), findsNothing);

        await tester.pumpWidget(const SizedBox());
      },
    );
  }
}
