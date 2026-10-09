import 'package:coup/ui/screens/campaign_screen.dart';
import 'package:coup/ui/screens/game_screen.dart';
import 'package:coup/ui/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final size in const [Size(360, 640), Size(390, 844), Size(1280, 800)]) {
    testWidgets('campanha: começa, sorteia punição e abre a partida em '
        '${size.width.toInt()}x${size.height.toInt()}', (tester) async {
      tester.view.physicalSize = size * 3;
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MaterialApp(
          theme: buildCoupTheme(),
          home: const CampaignScreen(playerName: 'Teste'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('A Ascensão ao Trono'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('NOVA CAMPANHA'), 200);
      await tester.tap(find.text('NOVA CAMPANHA'));
      await tester.pump();
      // A punição e o botão mostram o sorteio; entrar ainda não dá.
      expect(find.text('SORTEANDO...'), findsNWidgets(2));
      await tester.ensureVisible(find.text('SORTEANDO...').last);
      await tester.tap(find.text('SORTEANDO...').last, warnIfMissed: false);
      await tester.pump();
      expect(find.byType(GameScreen), findsNothing);
      // Deixa a roleta parar.
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
      expect(find.text('PUNIÇÃO'), findsOneWidget);
      expect(find.text('VILA DE PEDRA'), findsOneWidget);

      await tester.ensureVisible(find.text('ENFRENTAR A CORTE'));
      await tester.tap(find.text('ENFRENTAR A CORTE'));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.byType(GameScreen), findsOneWidget);
      expect(find.text('Corte 1 de 7'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
